/**
 * MASTER MULTILINGUE, CÔTÉ SERVEUR.
 *
 * Règle de coût fondamentale du projet : les IMAGES et les CLIPS animés sont
 * payés UNE SEULE FOIS et réutilisés par toutes les langues. Seule la voix off
 * se multiplie.
 *
 * Concrètement : un travail « maître » écrit le script source, fabrique les
 * images, commande les clips. Quand les clips sont prêts, ce module TRADUIT le
 * texte et crée un travail « enfant » par langue supplémentaire, dont les plans
 * pointent EXACTEMENT les mêmes fichiers d'image et de clip (`imagePath` /
 * `clipPath` recopiés). Un enfant démarre directement à l'étape voix : les
 * gardes `if (scene.imagePath) continue;` et `if (scene.clipPath) continue;` du
 * pipeline rendent alors toute nouvelle dépense d'image ou de clip impossible.
 */

import { chatJSON } from "../ai-gateway.server";
import { languageName } from "../languages";
import { targetCharsPerShot } from "../calibration";
import { maxWordsForSeconds } from "../duration";
import type { Script } from "../prompts.server";
import { admin, logEvent, type JobScene, type RenderJob } from "./store.server";

/** Traduit uniquement la partie parlée (le visuel est déjà fabriqué). */
export async function translateNarration(
  script: Script | null,
  scenes: JobScene[],
  language: string,
  targetSeconds: number,
): Promise<{
  title: string;
  caption: string;
  hashtags: string[];
  scenes: { index: number; narration: string; overlay: string }[];
}> {
  const { translationSystemPrompt } = await import("../prompts.server");
  const { buildSocialCopy } = await import("../social-copy");
  const perScene = targetCharsPerShot(language, targetSeconds, scenes.length);
  const total = perScene * scenes.length;
  const res = await chatJSON<{
    title?: string;
    caption?: string;
    hashtags?: string[];
    scenes?: { index: number; narration?: string; overlay?: string }[];
  }>(
    "google/gemini-3.7-flash",
    translationSystemPrompt(
      languageName(language),
      scenes.length,
      maxWordsForSeconds(8, language),
      8,
      undefined,
      false,
      {
        min: Math.round(total * 0.85),
        target: total,
        max: Math.round(total * 1.15),
        perScene,
        sceneDeltas: scenes.map((s) => ({
          index: s.index,
          chars: s.narration.trim().length,
          target: perScene,
        })),
      },
      undefined,
      // Légende et hashtags demandés DANS ce même appel : aucun coût de plus.
      true,
    ),
    JSON.stringify({
      title: script?.title ?? "",
      scenes: scenes.map((s) => ({
        index: s.index,
        narration: s.narration,
        overlay: s.overlay ?? "",
      })),
    }),
    0.4,
  );

  const byIndex = new Map((res.scenes ?? []).map((s) => [s.index, s]));
  const social = buildSocialCopy({
    caption: res.caption,
    hashtags: res.hashtags,
    hook: scenes[0]?.narration ?? "",
    language,
  });
  return {
    title: res.title?.trim() || (script?.title ?? ""),
    caption: social.caption,
    hashtags: social.hashtags,
    scenes: scenes.map((s, i) => {
      const t = byIndex.get(s.index) ?? (res.scenes ?? [])[i];
      return {
        index: s.index,
        narration: (t?.narration ?? s.narration).trim(),
        overlay: (t?.overlay ?? s.overlay ?? "").trim(),
      };
    }),
  };
}

/** Langues supplémentaires à produire à partir de ce maître. */
export function extraLanguages(job: RenderJob): string[] {
  const all = Array.isArray(job.languages) ? job.languages : [];
  return all.filter((l) => l && l !== job.language).filter((l, i, a) => a.indexOf(l) === i);
}

/**
 * Crée un travail par langue supplémentaire, réutilisant les MÊMES fichiers.
 * Aucun appel d'image ni de clip n'est possible depuis ces travaux.
 */
export async function fanOutLanguages(job: RenderJob) {
  const langs = extraLanguages(job);
  if (!langs.length) return;
  const db = await admin();

  const { data: existing } = await db
    .from("render_jobs")
    .select("language")
    .eq("master_id", job.id);
  const done = new Set(((existing ?? []) as { language: string }[]).map((r) => r.language));

  const { data: langRows } = await db.from("language_settings").select("*");
  const settings = new Map(
    ((langRows ?? []) as Record<string, unknown>[]).map((r) => [String(r["language"]), r]),
  );

  for (const language of langs) {
    if (done.has(language)) continue;

    const translated = await translateNarration(
      job.script as Script | null,
      job.scenes,
      language,
      job.duration_sec,
    );

    // PARTAGE GARANTI : on recopie imagePath / clipPath / clipFailed tels quels,
    // et on n'emporte NI audio NI mots (la voix est la seule chose à refaire).
    const scenes: JobScene[] = job.scenes.map((s, i) => {
      const t = translated.scenes[i];
      const scene: JobScene = {
        index: s.index,
        narration: t?.narration ?? s.narration,
        overlay: t?.overlay ?? s.overlay ?? "",
        imagePrompt: s.imagePrompt,
        videoPrompt: s.videoPrompt,
      };
      if (s.imagePath) scene.imagePath = s.imagePath;
      if (s.clipPath) scene.clipPath = s.clipPath;
      if (s.clipFailed) scene.clipFailed = true;
      return scene;
    });

    const s = settings.get(language);
    const script = {
      ...((job.script as Record<string, unknown> | null) ?? {}),
      title: translated.title,
      scenes: scenes.map((sc) => ({
        narration: sc.narration,
        overlay: sc.overlay,
        imagePrompt: sc.imagePrompt,
        videoPrompt: sc.videoPrompt,
      })),
    };

    const { error } = await db.from("render_jobs").insert({
      master_id: job.id,
      language,
      languages: [],
      narration_style: job.narration_style,
      topic_category: job.topic_category,
      visual_style: job.visual_style,
      duration_sec: job.duration_sec,
      voice_id: (s?.["eleven_voice_id"] as string | null) ?? null,
      voice_engine: job.voice_engine,
      topic: job.topic,
      include_cta: job.include_cta,
      publish_date: job.publish_date ?? null,
      script,
      scenes,
      caption: translated.caption,
      hashtags: translated.hashtags,
      // Démarrage direct à la voix : ni script, ni image, ni clip à payer.
      status: "voice",
      step: "voice",
      progress: 0.6,
    });
    if (error) throw new Error(`Création de la version ${language} : ${error.message}`);
    await logEvent(job.id, "languages", `Version ${language} créée (mêmes images et mêmes clips)`);
  }
}
