import { chatJSON } from "./ai-gateway.server";
import {
  scriptSystemPrompt,
  scriptUserPrompt,
  SOPHIA_OUTRO,
  type Script,
} from "./prompts.server";
import { languageName } from "./languages";
import { fastestWordsPerSecond } from "./duration";

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
  const maxTotalSeconds = Math.round(data.targetSeconds * 1.1);
  const sourceCapWords = Math.round(
    Math.max(8, maxTotalSeconds - (includeCta ? 6 : 0)) * wordsPerSecondSource,
  );
  const totalWords = Math.min(
    Math.round(narrationSeconds * wordsPerSecond),
    sourceCapWords,
  );
  const wordsBias = data.wordsBias ?? 0;

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
    ),
    `${scriptUserPrompt(data.kind, data.topic)}\nÉcris tout le script en ${langName}.`,
  );

  script.scenes = (script.scenes ?? []).slice(0, sceneCount).map((s, i) => ({ ...s, index: i }));

  // UN SEUL plan CTA : on retire les scènes de pub écrites par l'IA.
  const isCta = (t: string) => /\b(sophia|t[ée]l[ée]charge|l'appli|l'application)\b/i.test(t);
  while (
    script.scenes.length > 2 &&
    isCta(script.scenes[script.scenes.length - 1]?.narration ?? "")
  ) {
    script.scenes.pop();
  }

  // Rallonge automatique si le script est trop court pour la durée demandée.
  const countWords = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;
  const words = () => script.scenes.reduce((n, s) => n + countWords(s.narration ?? ""), 0);
  // Une vidéo trop courte est le défaut n°1 : on vise 100 % du budget et on
  // n'accepte pas moins de 98 %.
  if (words() < totalWords * 0.98 && script.scenes.length) {
    const missing = totalWords - words();
    try {
      // On ALLONGE les scènes existantes : ajouter des scènes ajouterait des
      // clips animés payants et hacherait le montage.
      const longer = await chatJSON<{ scenes: { index: number; narration: string }[] }>(
        "google/gemini-3.7-flash",
        [
          `Tu réécris les narrations d'un script vidéo existant, en ${langName}.`,
          `Tu renvoies EXACTEMENT ${script.scenes.length} scènes, avec les MÊMES index, dans le même ordre. Tu n'ajoutes, ne supprimes et ne fusionnes AUCUNE scène.`,
          `Chaque narration doit faire entre ${minWords} et ${maxWords} mots (soit 6 à 8 secondes de parole). Allonge en priorité les scènes les plus courtes avec des détails concrets : date exacte, lieu, nom, chiffre précis, conséquence matérielle. N'invente aucun fait douteux, n'ajoute ni morale ni publicité, ne répète pas ce qui est déjà dit.`,
          `Le script complet doit gagner environ ${missing} mots.`,
          'Réponds uniquement en JSON: {"scenes":[{"index":number,"narration":string}]}',
        ].join("\n"),
        `Scènes actuelles (JSON) : ${JSON.stringify(
          script.scenes.map((s) => ({ index: s.index, narration: s.narration })),
        )}`,
      );
      for (const s of longer.scenes ?? []) {
        const target = script.scenes[s.index];
        const text = (s.narration ?? "").trim();
        if (target && text && countWords(text) >= countWords(target.narration ?? "")) {
          target.narration = text;
        }
      }
    } catch {
      // Rallonge best-effort : on garde le script d'origine en cas d'échec.
    }
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
