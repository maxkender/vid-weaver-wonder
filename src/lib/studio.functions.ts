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
    // ~2,4 mots/seconde en lecture naturelle (voix off posée).
    const totalWords = Math.round(narrationSeconds * 2.4);
    // Un plan dure 8 s max (~19 mots) : on ajoute des scènes si la durée
    // demandée ne tient pas dans le nombre de plans choisi.
    const sceneCount = Math.min(
      14,
      Math.max(data.sceneCount, Math.ceil(totalWords / 19)),
    );
    const wordsPerScene = Math.min(
      22,
      Math.max(8, Math.round(totalWords / sceneCount) + data.wordsBias),
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
        avoid: z.array(z.string().max(300)).max(60).default([]),
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
      "une arnaque, un mensonge ou un canular resté dans l'histoire",
      "une loi, une règle ou une tradition absurde mais réelle",
      "un jeu vidéo, une BD ou un dessin animé et la réalité derrière",
      "la médecine et le corps : une découverte ou une pratique stupéfiante",
      "l'argent, le commerce, une marque connue et son histoire cachée",
      "une catastrophe naturelle ou un accident qui a changé le monde",
      "un lieu abandonné, interdit ou impossible à visiter",
      "la technologie du quotidien (téléphone, internet, GPS) et son origine étonnante",
      "un fait sur la mer, les profondeurs ou un naufrage",
      "un exploit humain fou (survie, record, voyage)",
    ];
    // Deux axes de hasard : le domaine ET l'angle → deux clics ne peuvent quasi
    // jamais retomber sur la même formulation.
    const ANGLES = [
      "un détail que presque personne ne remarque",
      "une erreur ou un raté qui a tout changé",
      "un chiffre qui paraît impossible mais qui est vrai",
      "une croyance très répandue qui est fausse",
      "une conséquence inattendue encore visible aujourd'hui",
      "une coïncidence troublante",
      "quelque chose d'interdit, de caché ou de longtemps gardé secret",
      "le point de vue d'une personne ordinaire qui y était",
      "une comparaison surprenante avec notre vie actuelle",
      "un objet banal au cœur d'une grande histoire",
    ];
    const ERAS = [
      "l'Antiquité",
      "le Moyen Âge",
      "l'époque moderne (XVIe-XVIIIe)",
      "le XIXe siècle",
      "le XXe siècle",
      "les 30 dernières années",
      "aujourd'hui",
      "peu importe l'époque",
    ];
    const PLACES = [
      "l'Europe",
      "l'Afrique",
      "l'Asie",
      "les Amériques",
      "l'Océanie ou les pôles",
      "les océans",
      "l'espace",
      "peu importe le lieu",
    ];
    const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)]!;
    const chosen = TOPIC_CATEGORIES.find((c) => c.id === data.category)?.brief;
    const domain = chosen || pick(DOMAINS);
    const angle = pick(ANGLES);
    const era = pick(ERAS);
    const place = pick(PLACES);
    const seed = Math.random().toString(36).slice(2, 10);

    const res = await chatJSON<{ topic: string; angle: string }>(
      "google/gemini-3.7-flash",
      [
        "Tu proposes des sujets de vidéos courtes de culture générale en français.",
        TOPIC_BRIEF[data.style],
        `DOMAINE IMPOSÉ POUR CETTE PROPOSITION : ${domain}. Reste dans ce domaine.`,
        `TYPE D'ANGLE IMPOSÉ : ${angle}.`,
        `ÉPOQUE PRIVILÉGIÉE : ${era}. ZONE PRIVILÉGIÉE : ${place}.`,
        `Graine d'aléatoire (ne la mentionne jamais) : ${seed}. Utilise-la pour t'éloigner du sujet le plus évident : ne propose PAS le premier exemple qui vient à l'esprit dans ce domaine, va chercher le deuxième ou le troisième.`,
        "Le sujet doit être fascinant, vérifiable, et facile à raconter en 60 secondes.",
        "Le sujet peut porter sur des choses très connues du grand public (films, monuments, animaux, pays) tant que l'angle est surprenant.",
        "VOCABULAIRE SIMPLE : formule le sujet avec des mots du quotidien, compréhensibles par tout le monde. Pas de jargon, pas de noms d'opérations militaires, de traités ou de termes techniques. Le sujet doit se comprendre en une seconde.",
        "Reste sur des faits simples : une seule idée, rien de trop pointu ni de trop spécialisé.",
        "Évite les sujets ultra rebattus (pyramides, Titanic, Mozart enfant prodige, Grande Muraille visible de l'espace, Mur de Berlin, Cléopâtre, Einstein mauvais élève).",
        'Réponds uniquement en JSON: {"topic": string (une phrase de 8 à 20 mots), "angle": string (une phrase expliquant l\'angle surprenant)}',
      ].join("\n"),
      data.avoid.length
        ? `INTERDIT : ne propose ni ces sujets, ni un sujet qui parle du même événement, du même lieu ou du même personnage :\n- ${data.avoid.join(
            "\n- ",
          )}`
        : "Propose un sujet.",
      1.15,
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

/** Recherche de narrateurs par nom dans la bibliothèque ElevenLabs. */
export const searchVoices = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ query: z.string().min(1).max(80) }).parse(input),
  )
  .handler(async ({ data }) => {
    try {
      const { searchElevenVoices } = await import("./elevenlabs.server");
      return { voices: await searchElevenVoices(data.query) };
    } catch {
      return { voices: [] as { id: string; label: string }[] };
    }
  });
