/**
 * Machine à étapes de la file d'attente : script → images → voix → clips → rendu.
 *
 * Chaque appel (`runTick`) traite UN seul job pendant un budget de temps borné,
 * puis enregistre l'avancement. Un job repris ne repaie jamais ce qui existe
 * déjà (image, voix, clip) : tout est marqué en base au moment où c'est produit.
 */

import {
  chatJSON,
  createVideoJob,
  fetchVideoContent,
  generateImageDataUrl,
  getVideoJob,
} from "../ai-gateway.server";
import { coverPrompt, motionPrompt, TOPIC_BRIEF, type Script } from "../prompts.server";
import { estimateSpeechSeconds } from "../duration";
import { defaultVoiceFor } from "../voices";
import { TOPIC_CATEGORIES } from "../topic-categories";
import { languageName } from "../languages";
import {
  DEFAULT_MOTION,
  DEFAULT_OPENING_IMAGE,
  DEFAULT_OPENING_MOTION,
  DEFAULT_QUALITY,
  DEFAULT_VISUAL_BRIEF,
  V2_WRITING_BRIEF,
} from "../style-presets";
import type { VisualStyleId } from "../style-presets";
import {
  claimJob,
  getJob,
  isPaused,
  logEvent,
  patchJob,
  patchJobIfStatus,
  releaseJob,
  setPaused,
  signedUrl,
  uploadBytes,
  uploadDataUrl,
  downloadAsDataUrl,
  type JobScene,
  type RenderJob,
} from "./store.server";
import { signedHeaders } from "./signing.server";

/** Budget de temps par appel : on rend la main avant que la requête n'expire. */
const TICK_BUDGET_MS = 42_000;

const started = () => Date.now();
const outOfTime = (t0: number) => Date.now() - t0 > TICK_BUDGET_MS;

/** Détecte un blocage crédits/politique : coupe-circuit global. */
function isBlockingError(message: string) {
  return /\b(402|403)\b|credit|credits|payment required|insufficient|forbidden|disabled/i.test(
    message,
  );
}

function bibleOf(script: Script | null): string {
  if (!script) return "";
  const chars = Array.isArray(script.characters)
    ? script.characters
        .map((c) => `${c?.name ?? ""} : ${c?.description ?? ""}`)
        .filter((s) => s.trim() !== " : ")
        .join(" | ")

    : "";
  return [chars, script.palette].filter(Boolean).join(" — ");
}

function storyOf(scenes: JobScene[], index: number) {
  const before = scenes
    .slice(Math.max(0, index - 3), index)
    .map((s, k) => `${index - Math.min(3, index) + k + 1}. ${s.narration}`)
    .join(" ");
  const next = scenes[index + 1]?.narration;
  return [
    before ? `Previously: ${before}` : "",
    `Now: ${scenes[index]?.narration ?? ""}`,
    next ? `Next: ${next}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function isPapercraftSquare(visual: string) {
  return visual === "papercraft" || visual === "papercraft_v2";
}

// ---------------------------------------------------------------- étape 1

async function stepTopic(job: RenderJob) {
  if (job.topic?.trim()) return;
  const brief =
    TOPIC_CATEGORIES.find((c) => c.id === job.topic_category)?.brief ??
    "un fait fascinant de culture générale";
  const seed = Math.random().toString(36).slice(2, 10);
  const res = await chatJSON<{ topic: string }>(
    "google/gemini-3.7-flash",
    [
      "Tu proposes des sujets de vidéos courtes de culture générale.",
      `LANGUE DE SORTIE : ${languageName(job.language)}.`,
      TOPIC_BRIEF[job.narration_style as keyof typeof TOPIC_BRIEF] ?? TOPIC_BRIEF.revelation,
      `DOMAINE IMPOSÉ : ${brief}.`,
      `Graine d'aléatoire (ne la mentionne jamais) : ${seed}. Ne propose pas l'exemple le plus évident du domaine.`,
      "Vocabulaire simple, une seule idée, vérifiable, racontable en 60 secondes.",
      'Réponds uniquement en JSON: {"topic": string}',
    ].join("\n"),
    "Propose un sujet.",
    1.15,
  );
  const topic = res.topic?.trim();
  if (!topic) throw new Error("Sujet vide.");
  await patchJob(job.id, { topic });
  job.topic = topic;
  await logEvent(job.id, "topic", topic);
}

// ---------------------------------------------------------------- étape 2

async function stepScript(job: RenderJob) {
  const { buildScript } = await import("../script-core.server");
  const isV2 = job.visual_style === "papercraft_v2";

  // ---- v2 : PASSAGE 2 — le script est déjà écrit, on ne fait que le storyboard.
  if (isV2 && job.script && job.scenes?.length) {
    const script = job.script as Script;
    let scenes: JobScene[] = job.scenes;
    // Garde-fou compté sur les SEULES tentatives de storyboard (jamais sur
    // `attempts`, qui cumule toutes les réclamations du job depuis sa création)
    // : après 3 essais, on ne repaie plus le storyboard et on garde les plans
    // v1 tels quels — le job n'échoue jamais ici.
    const tries = Number((script as { v2StoryboardTries?: number }).v2StoryboardTries ?? 0);
    if (tries >= 3) {
      await logEvent(
        job.id,
        "script",
        "Storyboard v2 abandonné après plusieurs essais : plans v1 conservés",
        "warn",
      );
    } else {
      // Sur l'objet script (pas une copie) : le patchJob final réécrit `script`
      // avec la palette, il doit conserver le compteur.
      script.v2StoryboardTries = tries + 1;
      await patchJob(job.id, { script });
      const { storyboardV2 } = await import("./storyboard-v2.server");
      scenes = await storyboardV2(job, script, scenes);
    }
    await patchJob(job.id, {
      script,
      scenes,
      status: "images",
      step: "images",
      progress: 0.15,
    });
    await logEvent(job.id, "script", `${scenes.length} plans — ${script.title ?? ""}`);
    return;
  }

  // Le script source est calibré pour TOUTES les langues de la production :
  // c'est ce qui permet de n'écrire qu'une fois et de ne traduire ensuite.
  const productionLanguages = [
    job.language,
    ...(Array.isArray(job.languages) ? job.languages : []),
  ].filter((l, i, a) => l && a.indexOf(l) === i);
  const script = await buildScript({
    topic: job.topic ?? "",
    kind: "culture",
    style: job.narration_style as "revelation",
    sceneCount: isV2 ? 6 : 5,
    targetSeconds: job.duration_sec,
    language: job.language,
    // Papier v2 : jamais de plan CTA (choix client), quel que soit le réglage du job.
    includeCta: isV2 ? false : job.include_cta !== false,
    productionLanguages,
    extraBrief: isV2 ? V2_WRITING_BRIEF : undefined,
  });
  let scenes: JobScene[] = (script.scenes ?? []).map((s, i) => ({
    index: i,
    narration: s.narration ?? "",
    overlay: s.overlay ?? "",
    imagePrompt: s.imagePrompt ?? "",
    videoPrompt: s.videoPrompt ?? s.imagePrompt ?? "",
  }));
  if (!scenes.length) throw new Error("Script vide.");

  // ---- v2 : PASSAGE 1 — on persiste le script tout de suite, le storyboard
  // viendra au prochain passage. Si la plateforme tue la fonction, rien n'est
  // perdu : le script et la légende sont déjà en base.
  if (isV2) {
    scenes = await fixMechanicalMetaphors(job, script, scenes);
    const { buildSocialCopy } = await import("../social-copy");
    const social = buildSocialCopy({
      caption: (script as { caption?: string }).caption,
      hashtags: script.hashtags,
      hook: script.hook || scenes[0]?.narration || "",
      language: job.language,
    });
    await patchJob(job.id, {
      script,
      scenes,
      caption: social.caption,
      hashtags: social.hashtags,
      status: "scripting",
      step: "storyboard",
      progress: 0.1,
    });
    await logEvent(
      job.id,
      "script",
      `Script écrit (${scenes.length} scènes) — storyboard au prochain passage`,
    );
    return;
  }

  // ---- v1 : comportement historique, inchangé (un seul passage).
  const { buildSocialCopy } = await import("../social-copy");
  const social = buildSocialCopy({
    caption: (script as { caption?: string }).caption,
    hashtags: script.hashtags,
    hook: script.hook || scenes[0]?.narration || "",
    language: job.language,
  });
  await patchJob(job.id, {
    script,
    scenes,
    caption: social.caption,
    hashtags: social.hashtags,
    status: "images",
    step: "images",
    progress: 0.15,
  });
  await logEvent(job.id, "script", `${scenes.length} plans — ${script.title ?? ""}`);
}

// ---------------------------------------------------------------- étape 3

async function stepImages(job: RenderJob, t0: number) {
  const script = job.script as Script | null;
  const visual = job.visual_style as VisualStyleId;
  const isV2 = job.visual_style === "papercraft_v2";
  const square = isPapercraftSquare(visual);
  const scenes = job.scenes;
  const bible = bibleOf(script);

  for (let i = 0; i < scenes.length; i++) {
    if (outOfTime(t0)) return false;
    const scene = scenes[i]!;
    if (scene.imagePath) continue;

    const refs: string[] = [];
    if (scenes[0]?.imagePath) refs.push(await downloadAsDataUrl(scenes[0].imagePath));
    if (!isV2) {
      const prev = scenes[i - 1]?.imagePath;
      if (prev && prev !== scenes[0]?.imagePath) refs.push(await downloadAsDataUrl(prev));
    }

    const base = coverPrompt(scene.imagePrompt || scene.narration, visual, square, {
      bible,
      visualBrief: DEFAULT_VISUAL_BRIEF[visual],
      quality: DEFAULT_QUALITY[visual],
      // Plan 1 : composition d'accroche (affiche, sujet unique, énorme).
      ...(i === 0 ? { opening: DEFAULT_OPENING_IMAGE } : {}),
      story: storyOf(scenes, i),
    });
    const prompt = refs.length
      ? `${base}\n\n${
          isV2
            ? "The attached image is a STYLE REFERENCE ONLY: reuse its paper material, its exact palette, its lighting and its single faceless red paper silhouette (same simple body shape). Do NOT reuse its composition, its framing, its camera distance, its background layout or any frame or border: build a completely different composition for the new scene described above, filling the whole square edge to edge."
            : `The attached image${refs.length > 1 ? "s are" : " is"} a STYLE AND CHARACTER REFERENCE: keep EXACTLY the same characters (same faces, same hair, same clothing shapes and colours), the same materials, palette and lighting, so the video reads as one single illustrated story. Do not copy the composition — render the new scene described above as the next shot of that same story.`
        }`
      : base;

    const dataUrl = await generateImageDataUrl(prompt, refs);
    scene.imagePath = await uploadDataUrl(`jobs/${job.id}/img-${i}.png`, dataUrl);
    await patchJob(job.id, {
      scenes,
      progress: 0.15 + 0.25 * ((i + 1) / scenes.length),
    });
  }
  await patchJob(job.id, { status: "voice", step: "voice", progress: 0.42 });
  await logEvent(job.id, "images", `${scenes.length} images prêtes`);
  return true;
}

// ---------------------------------------------------------------- étape 4

/**
 * Réglage de langue piloté depuis l'administration (table `language_settings`).
 * Les valeurs codées en dur ne servent que si la table est vide.
 */
async function languageSetting(language: string) {
  try {
    const { admin } = await import("./store.server");
    const db = await admin();
    const { data } = await db
      .from("language_settings")
      .select("eleven_voice_id, voice_speed")
      .eq("language", language)
      .maybeSingle();
    return data as { eleven_voice_id: string | null; voice_speed: number } | null;
  } catch {
    return null;
  }
}

async function stepVoice(job: RenderJob, t0: number) {
  const { generateElevenSpeechWithTimings, clampVoiceSpeed } = await import("../elevenlabs.server");
  const scenes = job.scenes;
  const setting = await languageSetting(job.language);
  const voice =
    job.voice_id ?? setting?.eleven_voice_id ?? defaultVoiceFor("elevenlabs", job.language);
  // Vitesse figée à 1,0 : la longueur du texte est déjà calée sur la durée.
  const speed = clampVoiceSpeed(Number(setting?.voice_speed ?? 1));

  for (let i = 0; i < scenes.length; i++) {
    if (outOfTime(t0)) return false;
    const scene = scenes[i]!;
    if (scene.audioPath) continue;
    if (!scene.narration.trim()) continue;

    const { audioDataUrl, words } = await generateElevenSpeechWithTimings(
      scene.narration,
      voice,
      job.language,
      `plan ${i + 1}`,
      speed,
    );
    scene.audioPath = await uploadDataUrl(`jobs/${job.id}/voice-${i}.mp3`, audioDataUrl);
    scene.words = words;
    scene.audioDuration = words.length
      ? Math.max(...words.map((w) => w.end)) + 0.3
      : estimateSpeechSeconds(scene.narration, job.language);
    // Débit réel de cette voix, mémorisé dans la même table que le studio.
    try {
      const { recordVoiceTake } = await import("../voice-rate.server");
      await recordVoiceTake(voice, job.language, scene.narration.trim().length, scene.audioDuration);
    } catch {
      /* une mesure ne doit jamais faire échouer une production */
    }
    await patchJob(job.id, { scenes, progress: 0.42 + 0.18 * ((i + 1) / scenes.length) });
  }
  await patchJob(job.id, { status: "clips", step: "clips", progress: 0.6 });
  await logEvent(job.id, "voice", `${scenes.length} voix off prêtes`);
  return true;
}

// ---------------------------------------------------------------- étape 5

async function stepClips(job: RenderJob, t0: number) {
  const visual = job.visual_style as VisualStyleId;
  const isV2 = job.visual_style === "papercraft_v2";
  const square = isPapercraftSquare(visual);
  const scenes = job.scenes;
  const bible = bibleOf(job.script as Script | null);

  for (let i = 0; i < scenes.length; i++) {
    if (outOfTime(t0)) return false;
    const scene = scenes[i]!;
    // En v2, tous les plans reçoivent un clip animé. Le garde « still »
    // reste pour les jobs existants déjà marqués.
    if (scene.clipPath || scene.clipFailed || scene.motion === "still") continue;

    // Un seul clip en vol à la fois : le gateway limite fortement la vidéo.
    if (!scene.clipJobId) {
      const est = scene.audioDuration ?? estimateSpeechSeconds(scene.narration, job.language);
      const seconds: "4" | "6" | "8" = est <= 4 ? "4" : est <= 6 ? "6" : "8";
      const hd = seconds === "8";
      // TODO (file serveur) : en mode carré, le studio pré-compose l'image carrée
      // au centre d'un cadre 9:16 noir (src/lib/square-frame.ts) avant de l'envoyer
      // au modèle vidéo, pour que le cadrage ne bouge plus d'un plan à l'autre.
      // Ici, pas de canvas côté serveur : si une bibliothèque d'images s'installe
      // proprement dans ce runtime, refaire la même composition avant l'envoi.
      // En attendant, le chemin serveur reste inchangé (image carrée brute).
      const image = scene.imagePath ? await downloadAsDataUrl(scene.imagePath) : undefined;
      const created = await createVideoJob({
        prompt: motionPrompt(scene.videoPrompt || scene.narration, visual, square, {
          bible,
          visualBrief: DEFAULT_VISUAL_BRIEF[visual],
          quality: DEFAULT_QUALITY[visual],
          motion: DEFAULT_MOTION[visual],
          // Plan 1 : événement visuel dès la première image.
          ...(i === 0 ? { opening: DEFAULT_OPENING_MOTION } : {}),
          story: storyOf(scenes, i),
        }),
        seconds,
        size: hd ? "1080x1920" : "720x1280",
        ...(image ? { inputReference: image } : {}),
      });
      scene.clipJobId = created.id;
      await patchJob(job.id, { scenes });
    }

    // Attente bornée par le budget du tick : le prochain appel reprendra le poll.
    while (!outOfTime(t0)) {
      const poll = await getVideoJob(scene.clipJobId!);
      if (poll.status === "completed") {
        const res = await fetchVideoContent(scene.clipJobId!);
        const bytes = await res.arrayBuffer();
        scene.clipPath = await uploadBytes(`jobs/${job.id}/clip-${i}.mp4`, bytes, "video/mp4");
        delete scene.clipJobId;
        await patchJob(job.id, { scenes, progress: 0.6 + 0.3 * ((i + 1) / scenes.length) });
        break;
      }
      if (poll.status === "failed") {
        // Le plan n'est jamais supprimé : l'image fixe prendra le relais au rendu.
        scene.clipFailed = true;
        delete scene.clipJobId;
        await patchJob(job.id, { scenes });
        await logEvent(
          job.id,
          "clips",
          `Plan ${i + 1} : clip animé impossible (${poll.error ?? "échec"}) → image fixe`,
          "warn",
        );
        break;
      }
      await new Promise((r) => setTimeout(r, 6000));
    }
    if (!scene.clipPath && !scene.clipFailed) return false; // budget épuisé, on reprendra
  }

  // PARTAGE DES VISUELS : les langues supplémentaires sont créées ICI, une fois
  // les clips payés, en recopiant les mêmes fichiers. Elles ne referont que la
  // voix off et le montage.
  if (!job.master_id) {
    const { fanOutLanguages } = await import("./master.server");
    await fanOutLanguages(job);
  }

  await patchJob(job.id, { status: "rendering", step: "rendering", progress: 0.9 });
  await logEvent(job.id, "clips", "Tous les plans sont prêts");
  return true;
}

// ---------------------------------------------------------------- étape 6

/** Envoie le manifeste au service de rendu (Node + ffmpeg). */
async function stepRender(job: RenderJob, origin: string) {
  const url = process.env["RENDER_WORKER_URL"];
  const secret = process.env["RENDER_WORKER_SECRET"];

  // Un manifeste n'est JAMAIS renvoyé tant que le rappel peut encore arriver.
  const { decideRenderSend } = await import("./render-dispatch");
  const decision = decideRenderSend({
    sends: job.rendering_sends ?? 0,
    sentAt: job.rendering_sent_at ?? null,
  });
  if (decision.action === "wait") {
    return;
  }
  if (decision.action === "giveup") {
    const ok = await patchJobIfStatus(job.id, "rendering", {
      status: "failed",
      step: "failed",
      error: decision.message,
      lease_until: null,
    });
    if (ok) {
      await logEvent(job.id, "rendering", decision.message, "error");
      const { notifyClient } = await import("./notify.server");
      await notifyClient(job.id);
    }
    return;
  }

  if (!url || !secret) {
    // Pas de service externe : le montage est assuré par la station intégrée
    // (page /station). Le job reste en « rendering » jusqu'à sa prise en charge.
    await logEvent(job.id, "rendering", "En attente de la station de montage (page /station)");
    return;
  }


  const scenes = await Promise.all(
    job.scenes.map(async (s) => ({
      index: s.index,
      narration: s.narration,
      videoUrl: s.clipPath ? await signedUrl(s.clipPath, 60 * 60 * 6) : null,
      imageUrl: s.imagePath ? await signedUrl(s.imagePath, 60 * 60 * 6) : null,
      audioUrl: s.audioPath ? await signedUrl(s.audioPath, 60 * 60 * 6) : null,
      words: s.words ?? [],
      duration: s.audioDuration ?? estimateSpeechSeconds(s.narration, job.language),
    })),
  );

  // Musique de fond : même banque partagée que le studio (bucket `music`,
  // table `music_tracks`), un morceau au hasard parmi ceux du style de
  // narration, atténué au même volume (0,22).
  let music = null as { url: string; gainDb: number | null } | null;
  try {
    const { admin } = await import("./store.server");
    const db = await admin();
    const { data: tracks } = await db
      .from("music_tracks")
      .select("path, styles, gain_db");
    const rows = (tracks ?? []) as { path: string; styles: string[] | null; gain_db: number | null }[];
    const pool = rows.filter((t) => (t.styles ?? []).includes(job.narration_style));
    const picked = (pool.length ? pool : rows)[Math.floor(Math.random() * (pool.length || rows.length || 1))];
    if (picked) {
      const { data: signed } = await db.storage
        .from("music")
        .createSignedUrl(picked.path, 60 * 60 * 6);
      if (signed?.signedUrl) {
        music = { url: signed.signedUrl, gainDb: picked.gain_db === null ? null : Number(picked.gain_db) };
      }
    }
  } catch {
    /* la musique ne doit jamais faire échouer un montage */
  }

  const body = JSON.stringify({
    jobId: job.id,
    width: 1080,
    height: 1920,
    visualStyle: job.visual_style,
    squareMask: isPapercraftSquare(job.visual_style),
    callbackUrl: `${origin}/api/public/jobs/render-callback`,
    scenes,
    ...(music ? { musicUrl: music.url, musicVolume: 0.22, ...(music.gainDb !== null ? { musicGainDb: music.gainDb } : {}) } : {}),
    ...(job.visual_style === "papercraft_v2" ? { squareMarginRatio: 0.10, squareCenterOffsetRatio: 0, loudnessTarget: -14, captionScale: 1.3 } : {}),
  });

  const res = await fetch(`${url.replace(/\/$/, "")}/render`, {
    method: "POST",
    headers: await signedHeaders(secret, body),
    body,
  });
  if (!res.ok) {
    throw new Error(`Service de rendu [${res.status}] : ${(await res.text()).slice(0, 400)}`);
  }
  // Envoi mémorisé : la file n'y reviendra qu'après le délai franc, et jamais
  // si le rappel a déjà terminé le travail entre-temps.
  const sends = (job.rendering_sends ?? 0) + 1;
  await patchJobIfStatus(job.id, "rendering", {
    rendering_sent_at: new Date().toISOString(),
    rendering_sends: sends,
  });
  job.rendering_sends = sends;
  await logEvent(
    job.id,
    "rendering",
    `Manifeste envoyé au service de rendu (envoi ${sends}/3)`,
  );
}

// ---------------------------------------------------------------- boucle

/** Sentinelle d'arrêt : levée si le job est annulé ou la file mise en pause. */
class Stopped extends Error {}

/**
 * Vérifié ENTRE CHAQUE ÉTAPE : dès qu'un arrêt est demandé, on rend la main
 * sans lancer le moindre appel IA payant supplémentaire. Rien n'est effacé :
 * les images, voix et clips déjà produits sont conservés en base.
 */
async function assertRunning(jobId: string) {
  const control = await isPaused();
  if (control.paused) throw new Stopped(control.reason ?? "Pipeline en pause");
  const fresh = await getJob(jobId);
  if (!fresh || fresh.status === "cancelled") throw new Stopped("Job annulé");
}

export async function runTick(origin: string) {
  const control = await isPaused();
  if (control.paused) {
    // Pause crédits/politique : une seule sonde par exécution pour détecter la reprise.
    return { skipped: true, reason: control.reason ?? "en pause" };
  }

  const job = await claimJob();
  if (!job) return { idle: true };

  const t0 = started();
  try {
    if (job.status === "queued") {
      await assertRunning(job.id);
      await stepTopic(job);
      await patchJobIfStatus(job.id, "queued", {
        status: "scripting",
        step: "scripting",
        progress: 0.05,
      });
      job.status = "scripting";
    }
    if (job.status === "scripting") {
      await assertRunning(job.id);
      await stepScript(job);
      const fresh = await getJob(job.id);
      if (fresh) Object.assign(job, fresh);
    }
    if (job.status === "images" && !outOfTime(t0)) {
      await assertRunning(job.id);
      if (await stepImages(job, t0)) job.status = "voice";
    }
    if (job.status === "voice" && !outOfTime(t0)) {
      await assertRunning(job.id);
      if (await stepVoice(job, t0)) job.status = "clips";
    }
    if (job.status === "clips" && !outOfTime(t0)) {
      await assertRunning(job.id);
      if (await stepClips(job, t0)) job.status = "rendering";
    }
    if (job.status === "rendering" && !outOfTime(t0)) {
      await assertRunning(job.id);
      await stepRender(job, origin);
    }
    await releaseJob(job.id);
    return { jobId: job.id, status: job.status };
  } catch (e) {
    if (e instanceof Stopped) {
      // Arrêt propre : le bail est libéré, aucun actif n'est supprimé.
      await patchJob(job.id, { lease_until: null });
      await logEvent(job.id, job.status, `Arrêt : ${e.message}`, "warn");
      return { jobId: job.id, stopped: true, reason: e.message };
    }
    const message = e instanceof Error ? e.message : String(e);
    await logEvent(job.id, job.status, message, "error");
    if (isBlockingError(message)) {
      await setPaused(true, message.slice(0, 500));
      await patchJob(job.id, { error: message.slice(0, 1000), lease_until: null });
      return { jobId: job.id, paused: true, error: message };
    }
    // Une seule tentative payante par job : au premier échec, on s'arrête.
    // Écriture conditionnée : un rappel arrivé entre-temps (job « done ») gagne.
    const marked = await patchJobIfStatus(
      job.id,
      ["queued", "scripting", "images", "voice", "clips", "rendering"],
      {
        status: "failed",
        step: "failed",
        error: message.slice(0, 1000),
        lease_until: null,
      },
    );
    if (marked) {
      const { notifyClient } = await import("./notify.server");
      await notifyClient(job.id);
    }
    return { jobId: job.id, error: message };
  }
}
