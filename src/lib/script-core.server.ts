import { chatJSON } from "./ai-gateway.server";
import {
  scriptSystemPrompt,
  scriptUserPrompt,
  SOPHIA_OUTRO,
  type Script,
} from "./prompts.server";
import { languageName } from "./languages";

export type BuildScriptInput = {
  topic: string;
  kind: "faits" | "culture" | "pub";
  style: "question" | "revelation" | "storytelling" | "listicle";
  sceneCount: number;
  targetSeconds: number;
  styleBrief?: string | undefined;
  wordsBias?: number | undefined;
  language: string;
};

/**
 * Écrit le script complet (hook + histoire + CTA Sophia unique).
 * Partagé entre le studio (navigateur) et la file d'attente serveur.
 */
export async function buildScript(data: BuildScriptInput): Promise<Script> {
  const langName = languageName(data.language);
  // Le CTA final ajoute une scène : on réserve ~6 s pour lui.
  const narrationSeconds = Math.max(8, data.targetSeconds - 6);
  // ~2,6 mots/seconde : mesuré sur les exports réels.
  const totalWords = Math.round(narrationSeconds * 2.6);
  const wordsBias = data.wordsBias ?? 0;

  const sceneCount = Math.min(16, Math.max(data.sceneCount, Math.ceil(totalWords / 18)));
  const wordsPerScene = Math.min(
    22,
    Math.max(8, Math.round(totalWords / sceneCount) + wordsBias),
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

  // « Sophia » n'est prononcé qu'une seule fois, dans le CTA final.
  script.scenes = script.scenes.map((s, i) => ({
    ...s,
    index: i,
    narration: (s.narration ?? "").replace(/\bSophia\b/gi, "l'appli"),
  }));
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
