/**
 * Découpage visuel (storyboard) du style papier v2.
 *
 * Le script est écrit par le chemin v1 (mêmes règles, mêmes exemples). Cette
 * étape ne réécrit JAMAIS le texte : elle le redécoupe en plans d'une phrase
 * et demande à l'IA un imagePrompt / videoPrompt / overlay par plan.
 * En cas de problème, on conserve les plans v1 : le job n'échoue jamais ici.
 */

import { chatJSON } from "../ai-gateway.server";
import type { Script } from "../prompts.server";
import { V2_STORYBOARD_BRIEF } from "../style-presets";
import { splitIntoShots } from "../storyboard-split";
import { logEvent, type JobScene, type RenderJob } from "./store.server";

type StoryboardShot = {
  index: number;
  overlay?: string;
  imagePrompt?: string;
  videoPrompt?: string;
};

export async function storyboardV2(
  job: RenderJob,
  script: Script,
  scenes: JobScene[],
): Promise<JobScene[]> {
  try {
    const narration = scenes
      .map((s) => s.narration.trim())
      .filter(Boolean)
      .join(" ");
    const shots = splitIntoShots(narration);
    if (shots.length < 2) return scenes;

    const user = JSON.stringify({
      title: script.title,
      language: job.language,
      palette: script.palette ?? "",
      characters: script.characters ?? [],
      shots: shots.map((narration, index) => ({ index, narration })),
    });

    let result: { palette?: string; shots?: StoryboardShot[] } | null = null;
    for (let attempt = 0; attempt < 2 && !result; attempt++) {
      try {
        const res = await chatJSON<{ palette?: string; shots?: StoryboardShot[] }>(
          "google/gemini-3.7-flash",
          V2_STORYBOARD_BRIEF,
          user,
        );
        if (Array.isArray(res?.shots) && res.shots.length === shots.length) result = res;
      } catch {
        /* nouvelle tentative, puis repli */
      }
    }

    if (!result) {
      await logEvent(job.id, "script", "Storyboard v2 indisponible : plans v1 conservés", "warn");
      return scenes;
    }

    if (result.palette?.trim()) script.palette = result.palette.trim();

    return shots.map((narration, index) => {
      const shot = result!.shots![index]!;
      return {
        index,
        narration,
        overlay: shot.overlay ?? "",
        imagePrompt: shot.imagePrompt?.trim() || narration,
        videoPrompt: shot.videoPrompt?.trim() || shot.imagePrompt?.trim() || narration,
      };
    });
  } catch {
    await logEvent(job.id, "script", "Storyboard v2 indisponible : plans v1 conservés", "warn");
    return scenes;
  }
}
