import { chatJSON } from "./ai-gateway.server";
import {
  auditSystemPrompt,
  scriptSystemPrompt,
  simplifySystemPrompt,
  scriptUserPrompt,
  SOPHIA_OUTRO,
  type Script,
} from "./prompts.server";
import { languageName } from "./languages";
import {
  durationRange,
  fastestWordsPerSecond,
  wordsPerSecond as speechRate,
} from "./duration";
import {
  calibrationMode,
  charWindow,
  narrationChars,
  perSceneChars,
  sceneDeltas,
} from "./calibration";

/** Nombre maximum de passes de réécriture de longueur. Jamais de boucle. */
export const MAX_LENGTH_PASSES = 3;
import { defaultCharsPerSecond, predictSeconds } from "./voice-rate";

export type BuildScriptInput = {
  topic: string;
  kind: "faits" | "culture" | "pub";
  style: "question" | "revelation" | "storytelling" | "listicle" | "mecanique";
  sceneCount: number;
  targetSeconds: number;
  styleBrief?: string | undefined;
  wordsBias?: number | undefined;
  language: string;
  /**
   * Toutes les langues qui seront produites à partir de ce script (master
   * multilingue). Le budget de mots est calculé sur la PLUS RAPIDE d'entre
   * elles pour qu'aucune version ne passe sous la durée cible.
   */
  productionLanguages?: string[] | undefined;
  /** Ajouter le plan CTA Sophia à la fin (true par défaut). */
  includeCta?: boolean | undefined;
  /** Faits vérifiés : seule source de chiffres et d'affirmations autorisée. */
  facts?: string[] | undefined;
  /**
   * Débit MESURÉ de la voix source (caractères par seconde à la vitesse 1,0).
   * C'est lui qui fixe la longueur du script : une estimation en mots fait
   * dériver le français de plus de dix secondes.
   */
  sourceCharsPerSecond?: number | undefined;
  /** Vitesse de synthèse prévue pour la voix source. */
  voiceSpeed?: number | undefined;
  /** Niveau de langue imposé (page Paramètres). */
  languageBrief?: string | undefined;
  /** Règles de l'accroche (page Paramètres). */
  hookBrief?: string | undefined;
  /** Structure des plans, information nouvelle et densité (page Paramètres). */
  structureBrief?: string | undefined;
  /** Relecture finale « à quelle seconde je scrolle ? » (page Paramètres). */
  auditBrief?: string | undefined;
};

/**
 * Écrit le script complet (hook + histoire + CTA Sophia unique).
 * Partagé entre le studio (navigateur) et la file d'attente serveur.
 */
export async function buildScript(data: BuildScriptInput): Promise<Script> {
  const langName = languageName(data.language);
  const includeCta = data.includeCta !== false;
  // Le CTA final ajoute une scène : on ne réserve ses ~6 s que s'il existe.
  const narrationSeconds = Math.max(8, data.targetSeconds - (includeCta ? 6 : 0));
  // Budget calé sur la langue la PLUS RAPIDE produite : la version la plus
  // courte atteint quand même la cible, les autres sont un peu plus longues.
  const wordsPerSecond = fastestWordsPerSecond(
    (data.productionLanguages?.length ? data.productionLanguages : [data.language]).filter(Boolean),
    data.language,
  );
  // BORNE HAUTE : le budget est calculé sur la langue la plus rapide, mais il
  // est lu par la langue SOURCE. Sans plafond, le français dérive (72 s pour
  // une cible de 60) et on paie des secondes de clip en trop. On plafonne donc
  // le script source à 110 % de la durée demandée (60 s → 66 s).
  const maxTotalSeconds = durationRange(data.targetSeconds).hi;
  const sourceCapWords = Math.round(
    Math.max(8, maxTotalSeconds - (includeCta ? 6 : 0)) * speechRate(data.language),
  );
  const totalWords = Math.min(
    Math.round(narrationSeconds * wordsPerSecond),
    sourceCapWords,
  );
  const wordsBias = data.wordsBias ?? 0;

  // FENÊTRE DE CARACTÈRES DU SCRIPT SOURCE — l'unique mesure de longueur qui
  // tienne : caractères ÷ débit MESURÉ de la voix source. La borne haute est
  // la durée demandée + 10 %, CTA déduit.
  const sourceCps = data.sourceCharsPerSecond ?? defaultCharsPerSecond(data.language);
  const sourceSpeed = data.voiceSpeed ?? 1;
  // BORNE BASSE : 60 s est un MINIMUM, pas une moyenne. On vise donc le milieu
  // haut de la fenêtre (cible − 2 s au plus bas), jamais la cible moins le CTA.
  const loNarrationSeconds = Math.max(
    8,
    data.targetSeconds - 2 - (includeCta ? 6 : 0),
  );
  const hiNarrationSeconds = Math.max(
    loNarrationSeconds + 2,
    maxTotalSeconds - (includeCta ? 6 : 0),
  );
  const charsWindow = charWindow(
    loNarrationSeconds,
    hiNarrationSeconds,
    sourceCps,
    sourceSpeed,
  );

  // Le nombre de plans vient de l'interface : il correspond à la durée choisie.
  // On ne le gonfle JAMAIS (chaque plan en plus = un clip animé payant en plus).
  const sceneCount = Math.max(2, data.sceneCount);

  // Chaque plan doit représenter entre 6 et 8 secondes de parole dans la langue
  // source : on convertit ces secondes en mots avec le débit réel de la langue.
  const minWords = Math.round(6 * wordsPerSecond);
  const maxWords = Math.round(8 * wordsPerSecond);
  const wordsPerScene = Math.min(
    maxWords,
    Math.max(minWords, Math.round(totalWords / sceneCount) + wordsBias),
  );

  const script = await chatJSON<Script>(
    "google/gemini-3.7-flash",
    scriptSystemPrompt(
      data.kind,
      sceneCount,
      data.style,
      wordsPerScene,
      data.styleBrief,
      totalWords,
      langName,
      includeCta,
      data.facts ?? [],
      {
        min: charsWindow.min,
        target: charsWindow.target,
        max: charsWindow.max,
        perScene: Math.max(40, Math.round(charsWindow.target / sceneCount)),
      },
      data.languageBrief,
      data.hookBrief,
      data.structureBrief,
    ),
    `${scriptUserPrompt(data.kind, data.topic)}\nÉcris tout le script en ${langName}.`,
  );

  script.scenes = (script.scenes ?? []).slice(0, sceneCount).map((s, i) => ({ ...s, index: i }));

  // L'ACCROCHE RETENUE DEVIENT LE PLAN 1. L'IA propose trois accroches et
  // choisit la meilleure : si elle a oublié de la recopier dans la scène 1, on
  // la remet en tête (la passe de longueur qui suit rattrape les caractères).
  const hook = (script.hook ?? "").trim();
  const first = script.scenes[0];
  if (hook && first) {
    const flat = (t: string) =>
      t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
    if (!flat(first.narration ?? "").startsWith(flat(hook).slice(0, 24))) {
      first.narration = `${hook} ${(first.narration ?? "").trim()}`.trim();
    }
  }
  script.hookOptions = (script.hookOptions ?? []).map((h) => String(h).trim()).filter(Boolean);
  script.hookScores = (script.hookScores ?? []).map((h) => String(h).trim()).filter(Boolean);
  script.hookChoice = (script.hookChoice ?? "").trim();


  // UN SEUL plan CTA : on retire les scènes de pub écrites par l'IA.
  const isCta = (t: string) => /\b(sophia|t[ée]l[ée]charge|l'appli|l'application)\b/i.test(t);
  while (
    script.scenes.length > 2 &&
    isCta(script.scenes[script.scenes.length - 1]?.narration ?? "")
  ) {
    script.scenes.pop();
  }

  // CONTRÔLE DE LONGUEUR (langue source), EN CARACTÈRES et SYMÉTRIQUE : le
  // script doit atterrir dans la fenêtre AVANT toute traduction, sinon toutes
  // les versions dérivent. Trop court est une faute aussi grave que trop long.
  const totalChars = () => narrationChars(script.scenes.map((s) => s.narration));
  const budgetPerScene = perSceneChars(charsWindow, script.scenes.length);
  for (let pass = 0; pass < MAX_LENGTH_PASSES; pass++) {
    const chars = totalChars();
    const mode = calibrationMode(chars, charsWindow);
    if (mode === "ok") break;
    const sec = predictSeconds(chars, sourceCps, sourceSpeed);
    // Écart PLAN PAR PLAN : on dit au modèle combien de caractères il manque ou
    // sont en trop dans chaque narration, au lieu d'un total qu'il ignore.
    const deltas = sceneDeltas(script.scenes.map((s) => s.narration), charsWindow);
    try {
      const fixed = await chatJSON<{ scenes: { index: number; narration: string }[] }>(
        "google/gemini-3.7-flash",
        [
          `Tu ajustes la LONGUEUR des narrations d'un script vidéo en ${langName}. Tu ne changes ni le sens, ni le ton, ni l'ordre.`,
          `Tu renvoies EXACTEMENT ${script.scenes.length} scènes, avec les MÊMES index. Tu n'ajoutes, ne supprimes et ne fusionnes AUCUNE scène.`,
          `BUDGET DE CARACTÈRES (unique mesure de longueur, calculée sur le débit réel de la voix) : la somme de toutes les narrations doit faire ${charsWindow.target} caractères espaces compris, jamais moins de ${charsWindow.min}, jamais plus de ${charsWindow.max}. Soit environ ${budgetPerScene} caractères par scène.`,
          "CORRECTION EXACTE À APPLIQUER, PLAN PAR PLAN (un nombre positif = caractères MANQUANTS à ajouter, négatif = caractères EN TROP à retirer) :",
          ...deltas.map(
            (d) =>
              `- plan ${d.index} : ${d.chars} caractères, cible ${d.target} → ${
                d.delta >= 0 ? `+${d.delta}` : `${d.delta}`
              }`,
          ),
          mode === "shorten"
            ? `Le script est trop LONG (${chars} caractères, soit environ ${Math.round(sec)} s lues à voix haute). CONDENSE : supprime les redondances, les adjectifs de remplissage, les adverbes et les mots de liaison. Tu gardes TOUS les chiffres et toute l'information.`
            : `Le script est trop COURT (${chars} caractères, soit environ ${Math.round(sec)} s lues à voix haute). ALLONGE EN AJOUTANT DE L'INFORMATION, jamais des mots : un chiffre, un lieu, une date, un geste précis, une conséquence concrète. INTERDIT d'ajouter un adjectif, un superlatif ou une reformulation de ce qui est déjà dit. N'invente aucun fait douteux, n'ajoute ni morale, ni publicité.`,
          "RÈGLE ABSOLUE, DANS LES DEUX SENS : aucune redondance, un seul qualificatif par idée. « un trou rond au milieu du front » et jamais « un immense trou géant, tout rond et complètement unique ».",
          'Réponds uniquement en JSON: {"scenes":[{"index":number,"narration":string}]}',
        ].join("\n"),
        `Scènes actuelles (JSON) : ${JSON.stringify(
          script.scenes.map((s) => ({ index: s.index, narration: s.narration })),
        )}`,
      );
      let changed = false;
      for (const s of fixed.scenes ?? []) {
        const target = script.scenes[s.index];
        const text = (s.narration ?? "").trim();
        if (target && text) {
          target.narration = text;
          changed = true;
        }
      }
      if (!changed) break;
    } catch {
      break; // ajustement best-effort : on garde le script en l'état
    }
  }

  // BILAN DE LONGUEUR : on ne boucle jamais au-delà de MAX_LENGTH_PASSES. Si le
  // script reste hors fenêtre, on le dit clairement au lieu de faire semblant.
  const finalChars = totalChars();
  if (calibrationMode(finalChars, charsWindow) !== "ok") {
    const finalSeconds = predictSeconds(finalChars, sourceCps, sourceSpeed);
    script.lengthNote = `Longueur hors cible après ${MAX_LENGTH_PASSES} tentatives : ${finalChars} caractères, soit environ ${finalSeconds.toFixed(
      1,
    )} s de narration (fenêtre visée ${loNarrationSeconds}-${Math.round(hiNarrationSeconds)} s). Reformule le sujet ou ajuste le nombre de plans.`;
    console.warn("[script]", script.lengthNote);
  }

  // PASSE DE RELECTURE : on remplace les mots savants par des mots du
  // quotidien. Elle vient en dernier, à longueur constante, pour ne pas
  // défaire le calage des durées. Best-effort : en cas d'échec on garde le texte.
  try {
    const simple = await chatJSON<{ scenes: { index: number; narration: string }[] }>(
      "google/gemini-3.7-flash",
      simplifySystemPrompt(langName, script.scenes.length, data.languageBrief),
      `Scènes (JSON) : ${JSON.stringify(
        script.scenes.map((s) => ({ index: s.index, narration: s.narration })),
      )}`,
      0.2,
    );
    for (const s of simple.scenes ?? []) {
      const target = script.scenes[s.index];
      const text = (s.narration ?? "").trim();
      // Garde-fou : une relecture ne doit pas raccourcir ou allonger le plan.
      if (target && text) {
        const before = (target.narration ?? "").length;
        if (before === 0 || Math.abs(text.length - before) / before <= 0.15) {
          target.narration = text;
        }
      }
    }
    const newHook = script.scenes[0]?.narration?.trim();
    if (newHook) script.hook = newHook;
  } catch {
    // relecture best-effort
  }


  // « Sophia » n'est prononcé qu'une seule fois, dans le CTA final — et jamais
  // du tout quand le CTA est désactivé.
  const strip = (t: string) =>
    (t ?? "")
      .replace(/\bSophia\b/gi, includeCta ? "l'appli" : "")
      .replace(/\s{2,}/g, " ")
      .trim();
  script.scenes = script.scenes.map((s, i) => ({
    ...s,
    index: i,
    narration: strip(s.narration ?? ""),
  }));

  if (!includeCta) {
    // Aucune publicité : on retire toute scène qui parlerait de l'appli.
    const isAd = (t: string) =>
      /\b(sophia|l'appli|l'application|t[ée]l[ée]charge|abonne-toi)\b/i.test(t);
    script.scenes = script.scenes.filter((s) => !isAd(s.narration ?? ""));
    script.scenes = script.scenes.map((s, i) => ({ ...s, index: i }));
    script.cta = "";
    return script;
  }

  let seenSophia = false;
  const cta = ((script.cta ?? "").trim() || SOPHIA_OUTRO)
    .replace(/\bSophia\b/gi, (m) => {
      if (seenSophia) return "l'appli";
      seenSophia = true;
      return m;
    })
    .replace(/\s{2,}/g, " ")
    .trim();
  script.cta = cta;

  script.scenes.push({
    index: script.scenes.length,
    narration: cta,
    overlay: "Télécharge Sophia",
    imagePrompt:
      "a hand holding a simple smartphone showing a clean study app screen, small floating book and lightbulb shapes around it, calm background",
    videoPrompt:
      "static frontal shot, the smartphone rises slightly while small book and lightbulb shapes float gently around it",
  } as Script["scenes"][number]);

  return script;
}
