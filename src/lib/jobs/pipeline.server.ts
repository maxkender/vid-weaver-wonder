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
import { TOPIC_CATEGORIES } from "../topic-categories";
import { languageName } from "../languages";
import { DEFAULT_MOTION, DEFAULT_QUALITY, DEFAULT_VISUAL_BRIEF } from "../style-presets";
import type { VisualStyleId } from "../style-presets";
import {
  claimJob,
  getJob,
  isPaused,
  logEvent,
  patchJob,
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
  const script = await buildScript({
    topic: job.topic ?? "",
    kind: "culture",
    style: job.narration_style as "revelation",
    sceneCount: 5,
    targetSeconds: job.duration_sec,
    language: job.language,
  });
  const scenes: JobScene[] = (script.scenes ?? []).map((s, i) => ({
    index: i,
    narration: s.narration ?? "",
    overlay: s.overlay ?? "",
    imagePrompt: s.imagePrompt ?? "",
    videoPrompt: s.videoPrompt ?? s.imagePrompt ?? "",
  }));
  if (!scenes.length) throw new Error("Script vide.");
  await patchJob(job.id, { script, scenes, status: "images", step: "images", progress: 0.15 });
  await logEvent(job.id, "script", `${scenes.length} plans — ${script.title ?? ""}`);
}

// ---------------------------------------------------------------- étape 3

async function stepImages(job: RenderJob, t0: number) {
  const script = job.script as Script | null;
  const visual = job.visual_style as VisualStyleId;
  const square = visual === "papercraft";
  const scenes = job.scenes;
  const bible = bibleOf(script);

  for (let i = 0; i < scenes.length; i++) {
    if (outOfTime(t0)) return false;
    const scene = scenes[i]!;
    if (scene.imagePath) continue;

    const refs: string[] = [];
    if (scenes[0]?.imagePath) refs.push(await downloadAsDataUrl(scenes[0].imagePath));
    const prev = scenes[i - 1]?.imagePath;
    if (prev && prev !== scenes[0]?.imagePath) refs.push(await downloadAsDataUrl(prev));

    const base = coverPrompt(scene.imagePrompt || scene.narration, visual, square, {
      bible,
      visualBrief: DEFAULT_VISUAL_BRIEF[visual],
      quality: DEFAULT_QUALITY[visual],
      story: storyOf(scenes, i),
    });
    const prompt = refs.length
      ? `${base}\n\nThe attached image${refs.length > 1 ? "s are" : " is"} a STYLE AND CHARACTER REFERENCE: keep EXACTLY the same characters (same faces, same hair, same clothing shapes and colours), the same materials, palette and lighting, so the video reads as one single illustrated story. Do not copy the composition — render the new scene described above as the next shot of that same story.`
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

async function stepVoice(job: RenderJob, t0: number) {
  const { generateElevenSpeechWithTimings } = await import("../elevenlabs.server");
  const scenes = job.scenes;
  const voice = job.voice_id ?? "3HZyQcLKlT0a3RDeXVsP";

  for (let i = 0; i < scenes.length; i++) {
    if (outOfTime(t0)) return false;
    const scene = scenes[i]!;
    if (scene.audioPath) continue;
    if (!scene.narration.trim()) continue;

    const { audioDataUrl, words } = await generateElevenSpeechWithTimings(
      scene.narration,
      voice,
      job.language,
    );
    scene.audioPath = await uploadDataUrl(`jobs/${job.id}/voice-${i}.mp3`, audioDataUrl);
    scene.words = words;
    scene.audioDuration = words.length
      ? Math.max(...words.map((w) => w.end)) + 0.3
      : estimateSpeechSeconds(scene.narration);
    await patchJob(job.id, { scenes, progress: 0.42 + 0.18 * ((i + 1) / scenes.length) });
  }
  await patchJob(job.id, { status: "clips", step: "clips", progress: 0.6 });
  await logEvent(job.id, "voice", `${scenes.length} voix off prêtes`);
  return true;
}

// ---------------------------------------------------------------- étape 5

async function stepClips(job: RenderJob, t0: number) {
  const visual = job.visual_style as VisualStyleId;
  const square = visual === "papercraft";
  const scenes = job.scenes;
  const bible = bibleOf(job.script as Script | null);

  for (let i = 0; i < scenes.length; i++) {
    if (outOfTime(t0)) return false;
    const scene = scenes[i]!;
    if (scene.clipPath || scene.clipFailed) continue;

    // Un seul clip en vol à la fois : le gateway limite fortement la vidéo.
    if (!scene.clipJobId) {
      const est = scene.audioDuration ?? estimateSpeechSeconds(scene.narration);
      const seconds: "4" | "6" | "8" = est <= 4 ? "4" : est <= 6 ? "6" : "8";
      const hd = seconds === "8";
      const image = scene.imagePath ? await downloadAsDataUrl(scene.imagePath) : undefined;
      const created = await createVideoJob({
        prompt: motionPrompt(scene.videoPrompt || scene.narration, visual, square, {
          bible,
          visualBrief: DEFAULT_VISUAL_BRIEF[visual],
          quality: DEFAULT_QUALITY[visual],
          motion: DEFAULT_MOTION[visual],
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

  await patchJob(job.id, { status: "rendering", step: "rendering", progress: 0.9 });
  await logEvent(job.id, "clips", "Tous les plans sont prêts");
  return true;
}

// ---------------------------------------------------------------- étape 6

/** Envoie le manifeste au service de rendu (Node + ffmpeg). */
async function stepRender(job: RenderJob, origin: string) {
  const url = process.env["RENDER_WORKER_URL"];
  const secret = process.env["RENDER_WORKER_SECRET"];
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
      duration: s.audioDuration ?? estimateSpeechSeconds(s.narration),
    })),
  );

  const body = JSON.stringify({
    jobId: job.id,
    width: 1080,
    height: 1920,
    visualStyle: job.visual_style,
    squareMask: job.visual_style === "papercraft",
    callbackUrl: `${origin}/api/public/jobs/render-callback`,
    scenes,
  });

  const res = await fetch(`${url.replace(/\/$/, "")}/render`, {
    method: "POST",
    headers: await signedHeaders(secret, body),
    body,
  });
  if (!res.ok) {
    throw new Error(`Service de rendu [${res.status}] : ${(await res.text()).slice(0, 400)}`);
  }
  await logEvent(job.id, "rendering", "Manifeste envoyé au service de rendu");
}

// ---------------------------------------------------------------- boucle

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
      await stepTopic(job);
      await patchJob(job.id, { status: "scripting", step: "scripting", progress: 0.05 });
      job.status = "scripting";
    }
    if (job.status === "scripting") {
      await stepScript(job);
      const fresh = await getJob(job.id);
      if (fresh) Object.assign(job, fresh);
    }
    if (job.status === "images" && !outOfTime(t0)) {
      if (await stepImages(job, t0)) job.status = "voice";
    }
    if (job.status === "voice" && !outOfTime(t0)) {
      if (await stepVoice(job, t0)) job.status = "clips";
    }
    if (job.status === "clips" && !outOfTime(t0)) {
      if (await stepClips(job, t0)) job.status = "rendering";
    }
    if (job.status === "rendering" && !outOfTime(t0)) {
      await stepRender(job, origin);
    }
    await releaseJob(job.id);
    return { jobId: job.id, status: job.status };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await logEvent(job.id, job.status, message, "error");
    if (isBlockingError(message)) {
      await setPaused(true, message.slice(0, 500));
      await patchJob(job.id, { error: message.slice(0, 1000), lease_until: null });
      return { jobId: job.id, paused: true, error: message };
    }
    // 3 tentatives, puis échec définitif (l'OS est prévenu par le webhook).
    if (job.attempts >= 3) {
      await patchJob(job.id, {
        status: "failed",
        step: "failed",
        error: message.slice(0, 1000),
        lease_until: null,
      });
      const { notifyClient } = await import("./notify.server");
      await notifyClient(job.id);
    } else {
      await patchJob(job.id, { error: message.slice(0, 1000), lease_until: null });
    }
    return { jobId: job.id, error: message };
  }
}
