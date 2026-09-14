import { chatJSON } from "./ai-gateway.server";
import {
  scriptSystemPrompt,
  scriptUserPrompt,
  SOPHIA_OUTRO,
  type Script,
} from "./prompts.server";
import { languageName } from "./languages";
import { estimateSpeechSeconds } from "./duration";

export type BuildScriptInput = {
  topic: string;
  kind: "faits" | "culture" | "pub";
  style: "question" | "revelation" | "storytelling" | "listicle" | "mecanique";
  sceneCount: number;
  targetSeconds: number;
  styleBrief?: string | undefined;
  wordsBias?: number | undefined;
  language: string;
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
  // Débit de parole réel de la langue (estimateSpeechSeconds fait foi).
  const wordsPerSecond = 1 / estimateSpeechSeconds("mot", data.language);
  const totalWords = Math.round(narrationSeconds * wordsPerSecond);
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
  if (words() < totalWords * 0.92 && script.scenes.length < 16) {
    const missing = totalWords - words();
    const extra = Math.max(1, Math.min(6, Math.ceil(missing / wordsPerScene)));
    try {
      const more = await chatJSON<{ scenes: Script["scenes"] }>(
        "google/gemini-3.7-flash",
        [
          scriptSystemPrompt(
            data.kind,
            extra,
            data.style,
            wordsPerScene,
            data.styleBrief,
            undefined,
            langName,
            includeCta,
          ),
          `Tu complètes un script existant : tu écris UNIQUEMENT ${extra} scènes SUPPLÉMENTAIRES qui s'intercalent avant la révélation finale, dans la même histoire, mêmes personnages, même bible visuelle. Aucune scène de pub. Réponds en JSON {"scenes":[...]} uniquement.`,
        ].join("\n"),
        [
          `Histoire existante (JSON) : ${JSON.stringify({
            title: script.title,
            characters: script.characters,
            palette: script.palette,
            scenes: script.scenes.map((s) => s.narration),
          })}`,
          `Ajoute ${extra} scènes de détails concrets (époque exacte, lieu, noms, chiffres marquants) qui rendent l'histoire plus claire et plus longue d'environ ${missing} mots.`,
        ].join("\n"),
      );
      const add = (more.scenes ?? []).filter((s) => (s.narration ?? "").trim());
      if (add.length) {
        const tail = script.scenes.slice(-1);
        script.scenes = [...script.scenes.slice(0, -1), ...add, ...tail];
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
