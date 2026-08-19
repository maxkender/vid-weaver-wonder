import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  chatJSON,
  createVideoJob,
  generateImageDataUrl,
  generateSpeechDataUrl,
  getVideoJob,
} from "./ai-gateway.server";
import {
  coverPrompt,
  motionPrompt,
  scriptSystemPrompt,
  scriptUserPrompt,
  SOPHIA_OUTRO,
  TOPIC_BRIEF,
  type Script,
} from "./prompts.server";
import { estimateSpeechSeconds } from "./duration";

const visualEnum = z.enum(["papercraft", "cinematique", "documentaire", "retro"]);

export const generateScript = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        topic: z.string().max(5000).default(""),
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
    const cta = (script.cta ?? "").trim() || SOPHIA_OUTRO;
    script.cta = cta;
    // Le CTA Sophia devient une vraie scène finale (narration + visuel + vidéo)
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
  });

export const generateSceneImage = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        imagePrompt: z.string().min(3).max(2000),
        visual: visualEnum.default("papercraft"),
        square: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const dataUrl = await generateImageDataUrl(
      coverPrompt(data.imagePrompt, data.visual, data.square),
    );
    return { dataUrl };
  });

export const startSceneVideo = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        videoPrompt: z.string().min(3).max(2000),
        imageDataUrl: z.string().startsWith("data:image/").optional(),
        seconds: z.enum(["4", "6", "8"]).optional(),
        narration: z.string().max(4000).default(""),
        orientation: z.enum(["vertical", "horizontal", "square"]).default("vertical"),
        visual: visualEnum.default("papercraft"),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const square = data.orientation === "square";
    const est = estimateSpeechSeconds(data.narration);
    const seconds = data.seconds ?? (est <= 4 ? "4" : est <= 6 ? "6" : "8");
    const job = await createVideoJob({
      prompt: motionPrompt(data.videoPrompt, data.visual, square),
      seconds,
      size: data.orientation === "horizontal" ? "1280x720" : "720x1280",
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

export const suggestTopic = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        avoid: z.array(z.string().max(300)).max(20).default([]),
        style: z
          .enum(["question", "revelation", "storytelling", "listicle"])
          .default("revelation"),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const res = await chatJSON<{ topic: string; angle: string }>(
      "google/gemini-3.7-flash",
      [
        "Tu proposes des sujets de vidéos courtes de culture générale en français.",
        TOPIC_BRIEF[data.style],
        "Le sujet doit être fascinant, vérifiable, et facile à raconter en 60 secondes.",
        "VOCABULAIRE SIMPLE : formule le sujet avec des mots du quotidien, compréhensibles par tout le monde. Pas de jargon, pas de noms d'opérations militaires, de traités ou de termes techniques. Le sujet doit se comprendre en une seconde.",
        "Reste sur des faits simples : une seule idée, rien de trop pointu ni de trop spécialisé.",
        "Évite les sujets ultra rebattus (pyramides, Titanic, Mozart enfant prodige, Grande Muraille visible de l'espace).",
        "Évite les marques, œuvres protégées et personnages de fiction récents.",
        'Réponds uniquement en JSON: {"topic": string (une phrase de 8 à 20 mots), "angle": string (une phrase expliquant l\'angle surprenant)}',
      ].join("\n"),
      data.avoid.length
        ? `Propose un sujet différent de ceux-ci : ${data.avoid.join(" | ")}`
        : "Propose un sujet.",
    );
    return { topic: res.topic?.trim() ?? "", angle: res.angle?.trim() ?? "" };
  });

export const generateSceneVoice = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        text: z.string().min(2).max(4000),
        voice: z.string().min(2).max(60).default("ballad"),
        engine: z.enum(["lovable", "elevenlabs"]).default("lovable"),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    if (data.engine === "elevenlabs") {
      const { generateElevenSpeechWithTimings } = await import("./elevenlabs.server");
      return await generateElevenSpeechWithTimings(data.text, data.voice);
    }
    const audioDataUrl = await generateSpeechDataUrl(data.text, data.voice);
    return { audioDataUrl, words: [] as { word: string; start: number; end: number }[] };
  });


/** Liste les voix du compte ElevenLabs connecté (pas seulement une sélection). */
export const listVoices = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { listElevenVoices } = await import("./elevenlabs.server");
    return { voices: await listElevenVoices() };
  } catch {
    return { voices: [] as { id: string; label: string }[] };
  }
});
