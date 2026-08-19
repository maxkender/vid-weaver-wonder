import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  chatJSON,
  createVideoJob,
  generateImageDataUrl,
  getVideoJob,
} from "./ai-gateway.server";
import {
  coverPrompt,
  motionPrompt,
  scriptSystemPrompt,
  scriptUserPrompt,
  SOPHIA_OUTRO,
  type Script,
} from "./prompts.server";

const visualEnum = z.enum(["papercraft", "cinematique", "documentaire", "retro"]);

export const generateScript = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        topic: z.string().max(300).default(""),
        kind: z.enum(["faits", "culture", "pub"]),
        style: z
          .enum(["question", "revelation", "storytelling", "listicle"])
          .default("revelation"),
        sceneCount: z.number().int().min(3).max(8).default(5),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const script = await chatJSON<Script>(
      "google/gemini-3.7-flash",
      scriptSystemPrompt(data.kind, data.sceneCount, data.style),
      scriptUserPrompt(data.kind, data.topic),
    );
    script.scenes = (script.scenes ?? []).slice(0, data.sceneCount).map((s, i) => ({
      ...s,
      index: i,
    }));
    script.cta = SOPHIA_OUTRO;
    return script;
  });

export const generateSceneImage = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        imagePrompt: z.string().min(3).max(2000),
        visual: visualEnum.default("papercraft"),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const dataUrl = await generateImageDataUrl(coverPrompt(data.imagePrompt, data.visual));
    return { dataUrl };
  });

export const startSceneVideo = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        videoPrompt: z.string().min(3).max(2000),
        imageDataUrl: z.string().startsWith("data:image/").optional(),
        seconds: z.enum(["4", "6", "8"]).default("8"),
        orientation: z.enum(["vertical", "horizontal"]).default("vertical"),
        visual: visualEnum.default("papercraft"),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const job = await createVideoJob({
      prompt: motionPrompt(data.videoPrompt, data.visual),
      seconds: data.seconds,
      size: data.orientation === "vertical" ? "720x1280" : "1280x720",
      ...(data.imageDataUrl ? { inputReference: data.imageDataUrl } : {}),
    });
    return { id: job.id, status: job.status };
  });

export const pollSceneVideo = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ id: z.string().min(3) }).parse(input))
  .handler(async ({ data }) => {
    const job = await getVideoJob(data.id);
    return {
      id: job.id,
      status: job.status,
      progress: job.progress ?? 0,
      error: job.error?.message ?? null,
    };
  });
