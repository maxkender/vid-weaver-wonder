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
  TOPIC_BRIEF,
  TOPIC_INTRIGUE,
  TOPIC_VIRAL,

  type Script,
} from "./prompts.server";

import { estimateSpeechSeconds } from "./duration";
import { TOPIC_CATEGORIES, TOPIC_CATEGORY_IDS } from "./topic-categories";
import { LANGUAGE_IDS, languageName } from "./languages";


const visualEnum = z.enum(["papercraft", "cinematique", "documentaire", "retro"]);

export const generateScript = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        topic: z.string().max(5000).default(""),
        kind: z.enum(["faits", "culture", "pub"]),
        style: z
          .enum(["question", "revelation", "storytelling", "listicle", "mecanique"])
          .default("revelation"),
        sceneCount: z.number().int().min(3).max(8).default(5),
        /** Durée cible de la vidéo finale (secondes), CTA inclus. */
        targetSeconds: z.number().int().min(15).max(90).default(60),
        /** Toutes les langues produites : le budget de mots suit la plus rapide. */
        productionLanguages: z.array(z.enum(LANGUAGE_IDS)).default([]),
        /** Brief de narration personnalisé (page Paramètres). */
        styleBrief: z.string().max(4000).optional(),
        /** Densité du texte réglée dans Paramètres (mots par plan). */
        wordsBias: z.number().int().min(-6).max(6).default(0),
        /** Langue de la narration, des sous-titres et du CTA. */
        language: z.enum(LANGUAGE_IDS).default("fr"),
        /** Ajouter le plan CTA Sophia à la fin du script. */
        includeCta: z.boolean().default(true),
        /** Faits établis par la vérification : seule source autorisée. */
        facts: z.array(z.string().max(600)).max(20).default([]),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { buildScript } = await import("./script-core.server");
    return await buildScript(data);
  });


/**
 * MASTER MULTILINGUE : traduit UNIQUEMENT la partie parlée d'un script.
 * imagePrompt / videoPrompt / characters / palette ne sont même pas envoyés :
 * ils ont déjà servi à fabriquer les visuels et restent en anglais, inchangés.
 */
export const translateScript = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        title: z.string().max(300).default(""),
        hook: z.string().max(1000).default(""),
        cta: z.string().max(1000).default(""),
        scenes: z
          .array(
            z.object({
              index: z.number().int(),
              narration: z.string().max(2000),
              overlay: z.string().max(300).default(""),
            }),
          )
          .min(1)
          .max(20),
        language: z.enum(LANGUAGE_IDS),
        /** Durée maximale d'un plan (secondes) : plafond de mots par scène. */
        maxSceneSeconds: z.number().min(2).max(12).default(8),
        /** Cible de durée TOTALE de la version traduite (secondes). */
        minTotalSeconds: z.number().min(10).max(180).default(60),
        maxTotalSeconds: z.number().min(10).max(180).default(66),
        /** Passe de correction de durée : le texte est déjà dans la langue cible. */
        adjust: z.boolean().default(false),
        /**
         * FENÊTRE DE CARACTÈRES calculée sur le débit MESURÉ de la voix de cette
         * langue (caractères par seconde, jamais des mots). C'est la contrainte
         * de longueur prioritaire : cible + bornes basse et haute.
         */
        charTarget: z.number().int().min(80).max(6000).optional(),
        charMin: z.number().int().min(80).max(6000).optional(),
        charMax: z.number().int().min(80).max(6000).optional(),
        /** Sens de la correction demandée quand le texte est hors fenêtre. */
        charMode: z.enum(["ok", "shorten", "lengthen"]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { translationSystemPrompt } = await import("./prompts.server");
    const { maxWordsForSeconds } = await import("./duration");
    const maxWords = maxWordsForSeconds(data.maxSceneSeconds, data.language);
    const usageOut: { usage?: import("./usage").TokenUsage | undefined } = {};
    const res = await chatJSON<{
      title?: string;
      hook?: string;
      cta?: string;
      scenes?: { index: number; narration: string; overlay?: string }[];
    }>(
      "google/gemini-3.7-flash",
      translationSystemPrompt(
        languageName(data.language),
        data.scenes.length,
        maxWords,
        data.maxSceneSeconds,
        {
          minSeconds: data.minTotalSeconds,
          maxSeconds: data.maxTotalSeconds,
          minWords: maxWordsForSeconds(data.minTotalSeconds, data.language),
          maxWords: maxWordsForSeconds(data.maxTotalSeconds, data.language),
        },
        data.adjust,
        data.charBudget
          ? {
              total: data.charBudget,
              perScene: Math.max(20, Math.round(data.charBudget / Math.max(1, data.scenes.length))),
            }
          : undefined,
      ),
      JSON.stringify({
        title: data.title,
        hook: data.hook,
        cta: data.cta,
        scenes: data.scenes,
      }),
      0.4,
      usageOut,
    );
    // Sécurité : on réaligne sur les index source, jamais sur l'ordre du modèle.
    const byIndex = new Map((res.scenes ?? []).map((s) => [s.index, s]));
    const scenes = data.scenes.map((s, i) => {
      const t = byIndex.get(s.index) ?? (res.scenes ?? [])[i];
      return {
        index: s.index,
        narration: (t?.narration ?? s.narration).trim(),
        overlay: (t?.overlay ?? s.overlay).trim(),
      };
    });
    return {
      title: res.title?.trim() || data.title,
      hook: res.hook?.trim() || data.hook,
      cta: data.cta ? (res.cta?.trim() || data.cta) : "",
      scenes,
      usage: usageOut.usage ?? null,
    };
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
        /** Consigne propre au plan 1 (accroche). */
        opening: z.string().max(2000).optional(),
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
      opening: data.opening,
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
    const usageOut: { usage?: import("./usage").TokenUsage | undefined } = {};
    const dataUrl = await generateImageDataUrl(prompt, unique, usageOut);
    return { dataUrl, usage: usageOut.usage ?? null };
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
        /** Consigne de mouvement propre au plan 1 (accroche). */
        opening: z.string().max(2000).optional(),
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
        opening: data.opening,
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

export type FactCheck = {
  correctedTopic: string;
  verdict: "ok" | "revoir";
  note: string;
  facts: string[];
  discarded: string[];
};

/**
 * VÉRIFICATION DES FAITS : tourne entre la validation du sujet et l'écriture
 * du script. Ne coûte que du texte, et évite d'écrire (puis d'illustrer) un
 * script bâti sur un chiffre faux.
 */
export const verifyTopicFacts = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        topic: z.string().min(3).max(2000),
        angle: z.string().max(2000).default(""),
        language: z.enum(LANGUAGE_IDS).default("fr"),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<FactCheck> => {
    const { factCheckSystemPrompt } = await import("./prompts.server");
    const res = await chatJSON<Partial<FactCheck>>(
      "google/gemini-3.7-flash",
      factCheckSystemPrompt(languageName(data.language)),
      `Sujet : ${data.topic}\nAngle : ${data.angle || "(aucun)"}`,
    );
    return {
      correctedTopic: (res.correctedTopic ?? data.topic).trim(),
      verdict: res.verdict === "revoir" ? "revoir" : "ok",
      note: (res.note ?? "").trim(),
      facts: (res.facts ?? []).filter((f) => typeof f === "string" && f.trim()).slice(0, 20),
      discarded: (res.discarded ?? []).filter((f) => typeof f === "string" && f.trim()).slice(0, 20),
    };
  });

export const suggestTopic = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        avoid: z.array(z.string().max(300)).max(60).default([]),
        style: z
          .enum(["question", "revelation", "storytelling", "listicle", "mecanique"])
          .default("revelation"),
        category: z.enum(TOPIC_CATEGORY_IDS).default("aleatoire"),
        language: z.enum(LANGUAGE_IDS).default("fr"),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    // Rotation de domaines : garantit une vraie variété d'un clic à l'autre.
    const DOMAINS = [
      "un film ou une série récente très connue (expliquer le vrai fait historique ou scientifique derrière)",
      "une légende ou un mythe (Odyssée, Atlantide, loups-garous…) et son origine réelle",
      "un fait historique marquant, raconté par un détail méconnu",
      "un épisode historique dont tout le monde connaît le nom (Tchernobyl, Pompéi, le Titanic, le Hindenburg, Apollo 13, la peste noire, Hiroshima, Fukushima, la mutinerie du Bounty), raconté par une heure, une décision, un homme ou un objet précis",
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
      "un mécanisme caché qu'on explique rouage par rouage",
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
        "Tu proposes des sujets de vidéos courtes de culture générale.",
        `LANGUE DE SORTIE : écris topic et angle en ${languageName(data.language)}. Adapte les références au public de cette langue.`,
        TOPIC_BRIEF[data.style],
        TOPIC_INTRIGUE,
        TOPIC_VIRAL,

        `DOMAINE IMPOSÉ POUR CETTE PROPOSITION : ${domain}. Reste dans ce domaine.`,
        `TYPE D'ANGLE IMPOSÉ : ${angle}.`,
        `ÉPOQUE PRIVILÉGIÉE : ${era}. ZONE PRIVILÉGIÉE : ${place}.`,
        `Graine d'aléatoire (ne la mentionne jamais) : ${seed}. Utilise-la pour t'éloigner du sujet le plus évident : ne propose PAS le premier exemple qui vient à l'esprit dans ce domaine, va chercher le deuxième ou le troisième.`,
        "Le sujet doit être fascinant, vérifiable, et surtout AVOIR DE QUOI DÉROULER pendant 60 secondes : un mécanisme en plusieurs étapes ou une enquête qui avance. Un fait isolé qui tient entier dans la phrase d'accroche est refusé.",
        "Le sujet peut porter sur des choses très connues du grand public (films, monuments, animaux, pays) tant que l'angle est surprenant.",
        "VOCABULAIRE SIMPLE : formule le sujet avec des mots du quotidien, compréhensibles par tout le monde. Pas de jargon, pas de noms d'opérations militaires, de traités ou de termes techniques. Le sujet doit se comprendre en une seconde.",
        "Reste sur des faits simples : une seule idée, rien de trop pointu ni de trop spécialisé.",
        "Évite les ANGLES ultra rebattus (les pyramides construites par des esclaves, Mozart enfant prodige, la Grande Muraille visible de l'espace, Einstein mauvais élève). Un événement très connu (Tchernobyl, le Titanic, Pompéi) reste autorisé À CONDITION que l'angle soit un détail précis et peu connu, jamais un résumé de l'événement.",
        "INTERDIT — LE SON ET LE BRUITAGE : aucun sujet sur la fabrication d'un cri, d'un rugissement, d'une musique ou d'un bruitage de film (cri de Godzilla, sabre laser, cri Wilhelm). Sans extrait sonore, la vidéo ne peut rien démontrer.",
        "INTERDIT — L'INCONNU : le sujet principal (lieu, personne, œuvre, événement) doit être reconnu immédiatement par le grand public. Si le spectateur peut se demander « c'est quoi ça ? », change de sujet.",
        "AVANT DE RÉPONDRE : écris mentalement les trois étapes du déroulé. Si tu n'en trouves pas trois qui apportent chacune une information nouvelle, change de sujet.",
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
        language: z.enum(LANGUAGE_IDS).default("fr"),
        /** Rythme de lecture (Paramètres) : identique pour toutes les langues. */
        speed: z.number().min(0.9).max(1.15).default(1.05),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    if (data.engine === "elevenlabs") {
      const { generateElevenSpeechWithTimings } = await import("./elevenlabs.server");
      return await generateElevenSpeechWithTimings(
        data.text,
        data.voice,
        data.language,
        undefined,
        data.speed,
      );
    }
    const audioDataUrl = await generateSpeechDataUrl(
      data.text,
      data.voice,
      languageName(data.language),
    );
    return {
      audioDataUrl,
      words: [] as { word: string; start: number; end: number }[],
      characters: data.text.length,
    };
  });


/** Liste les voix du compte ElevenLabs, priorisées pour la langue demandée. */
export const listVoices = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ language: z.string().min(2).max(5).default("fr") }).parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    try {
      const { listElevenVoices } = await import("./elevenlabs.server");
      return { voices: await listElevenVoices(data.language) };
    } catch {
      return { voices: [] as { id: string; label: string }[] };
    }
  });

/** Recherche de narrateurs par nom dans la bibliothèque ElevenLabs. */
export const searchVoices = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        query: z.string().min(1).max(80),
        language: z.string().min(2).max(5).default("fr"),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    try {
      const { searchElevenVoices } = await import("./elevenlabs.server");
      return { voices: await searchElevenVoices(data.query, data.language) };
    } catch {
      return { voices: [] as { id: string; label: string }[] };
    }
  });
