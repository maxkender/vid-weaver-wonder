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
import { TOPIC_CATEGORIES, TOPIC_CATEGORY_IDS } from "./topic-categories";


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
        /** Durée cible de la vidéo finale (secondes), CTA inclus. */
        targetSeconds: z.number().int().min(15).max(90).default(35),
        /** Brief de narration personnalisé (page Paramètres). */
        styleBrief: z.string().max(4000).optional(),
        /** Densité du texte réglée dans Paramètres (mots par plan). */
        wordsBias: z.number().int().min(-6).max(6).default(0),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    // Le CTA final ajoute une scène : on réserve ~7 s pour lui.
    const narrationSeconds = Math.max(8, data.targetSeconds - 7);
    // ~2,5 mots/seconde en lecture naturelle.
    const wordsPerScene = Math.min(
      28,
      Math.max(8, Math.round((narrationSeconds * 2.5) / data.sceneCount) + data.wordsBias),
    );
    const script = await chatJSON<Script>(
      "google/gemini-3.7-flash",
      scriptSystemPrompt(
        data.kind,
        data.sceneCount,
        data.style,
        wordsPerScene,
        data.styleBrief,
      ),
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
        /** Bible visuelle (personnages + palette) répétée sur chaque plan. */
        bible: z.string().max(4000).optional(),
        visualBrief: z.string().max(4000).optional(),
        quality: z.string().max(2000).optional(),
        /** Contexte narratif : plans précédents + plan suivant. */
        story: z.string().max(4000).optional(),
        /** Image de référence (plan 1 = style) pour garder les mêmes personnages. */
        referenceImage: z.string().startsWith("data:image/").optional(),
        /** Image du plan précédent : continuité immédiate de l'histoire. */
        previousImage: z.string().startsWith("data:image/").optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const base = coverPrompt(data.imagePrompt, data.visual, data.square, {
      bible: data.bible,
      visualBrief: data.visualBrief,
      quality: data.quality,
      story: data.story,
    });
    const refs = [data.referenceImage, data.previousImage].filter(
      (r): r is string => typeof r === "string" && r.length > 0,
    );
    // Évite d'envoyer deux fois la même image (économie de tokens/crédits).
    const unique = refs.filter((r, i) => refs.indexOf(r) === i);
    const prompt = unique.length
      ? `${base}\n\nThe attached image${unique.length > 1 ? "s are" : " is"} a STYLE AND CHARACTER REFERENCE${
          unique.length > 1
            ? " (first = the opening shot of the story, second = the immediately previous shot)"
            : ""
        }: keep EXACTLY the same characters (same faces, same hair, same clothing shapes and colours), the same materials and paper textures, the same colour palette, the same lighting and the same art direction, so the video reads as one single illustrated story. Do not copy the composition — render the new scene described above as the next shot of that same story.`
      : base;
    const dataUrl = await generateImageDataUrl(prompt, unique);
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
        bible: z.string().max(4000).optional(),
        visualBrief: z.string().max(4000).optional(),
        quality: z.string().max(2000).optional(),
        motion: z.string().max(2000).optional(),
        /** Contexte narratif : plans précédents + plan suivant. */
        story: z.string().max(4000).optional(),
        /** 1080p : le modèle n'accepte cette définition que sur des plans de 8 s. */
        hd: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const square = data.orientation === "square";
    const est = estimateSpeechSeconds(data.narration);
    // Économie de crédits : on ne paie jamais plus de secondes que nécessaire.
    // Le 1080p n'existe qu'en 8 s : si le plan est plus court, on reste en 720p
    // (upscalé à l'export) au lieu de payer un clip 8 s HD inutile.
    const needed: "4" | "6" | "8" = est <= 4 ? "4" : est <= 6 ? "6" : "8";
    const seconds = data.seconds ?? needed;
    const hd = data.hd && seconds === "8";
    const job = await createVideoJob({
      prompt: motionPrompt(data.videoPrompt, data.visual, square, {
        bible: data.bible,
        visualBrief: data.visualBrief,
        quality: data.quality,
        motion: data.motion,
        story: data.story,
      }),
      seconds,
      size: hd
        ? data.orientation === "horizontal"
          ? "1920x1080"
          : "1080x1920"
        : data.orientation === "horizontal"
          ? "1280x720"
          : "720x1280",
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
        category: z.enum(TOPIC_CATEGORY_IDS).default("aleatoire"),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    // Rotation de domaines : garantit une vraie variété d'un clic à l'autre.
    const DOMAINS = [
      "un film ou une série récente très connue (expliquer le vrai fait historique ou scientifique derrière)",
      "une légende ou un mythe (Odyssée, Atlantide, loups-garous…) et son origine réelle",
      "un fait historique marquant, raconté par un détail méconnu",
      "la géographie : une frontière, une île, un fleuve, une ville avec une bizarrerie surprenante",
      "un fait scientifique du quotidien (corps humain, météo, physique simple)",
      "un animal ou la nature : un comportement incroyable mais vrai",
      "l'espace et l'univers, expliqué simplement",
      "l'origine d'un objet, d'un mot ou d'une habitude que tout le monde utilise",
      "un personnage célèbre vu sous un angle inattendu",
      "la nourriture, le sport ou la musique : une histoire surprenante derrière quelque chose de banal",
      "une invention ou une découverte due au hasard",
      "un mystère non résolu ou une théorie célèbre, expliqué avec des faits",
    ];
    const chosen = TOPIC_CATEGORIES.find((c) => c.id === data.category)?.brief;
    const domain = chosen || DOMAINS[Math.floor(Math.random() * DOMAINS.length)]!;

    const res = await chatJSON<{ topic: string; angle: string }>(
      "google/gemini-3.7-flash",
      [
        "Tu proposes des sujets de vidéos courtes de culture générale en français.",
        TOPIC_BRIEF[data.style],
        `DOMAINE IMPOSÉ POUR CETTE PROPOSITION : ${domain}. Reste dans ce domaine.`,
        "Le sujet doit être fascinant, vérifiable, et facile à raconter en 60 secondes.",
        "Le sujet peut porter sur des choses très connues du grand public (films, monuments, animaux, pays) tant que l'angle est surprenant.",
        "VOCABULAIRE SIMPLE : formule le sujet avec des mots du quotidien, compréhensibles par tout le monde. Pas de jargon, pas de noms d'opérations militaires, de traités ou de termes techniques. Le sujet doit se comprendre en une seconde.",
        "Reste sur des faits simples : une seule idée, rien de trop pointu ni de trop spécialisé.",
        "Évite les sujets ultra rebattus (pyramides, Titanic, Mozart enfant prodige, Grande Muraille visible de l'espace).",
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
