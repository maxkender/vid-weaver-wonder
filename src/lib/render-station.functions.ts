/**
 * Station de rendu intégrée : le montage final est fait par le navigateur
 * (page /station) au lieu d'un service Docker externe. Ces fonctions serveur
 * distribuent le travail et récupèrent le MP4.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type StationScene = {
  index: number;
  narration: string;
  videoUrl: string | null;
  imageUrl: string | null;
  audioUrl: string | null;
  words: { word: string; start: number; end: number }[];
  duration: number;
};

export type StationTask = {
  jobId: string;
  title: string;
  language: string;
  visualStyle: string;
  squareMask: boolean;
  uploadUrl: string;
  uploadToken: string;
  path: string;
  scenes: StationScene[];
};

/** Prend un job prêt à monter et renvoie tout ce qu'il faut au navigateur. */
export const claimStationTask = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ task: StationTask | null; pending: number }> => {
    const { admin, signedUrl, RENDER_BUCKET, logEvent, patchJob } = await import(
      "@/lib/jobs/store.server"
    );
    const db = await admin();

    const { data: rows } = await db
      .from("render_jobs")
      .select("*")
      .eq("status", "rendering")
      .order("created_at", { ascending: true })
      .limit(20);
    const list = (rows ?? []) as Array<Record<string, unknown>>;
    const now = Date.now();
    const free = list.filter((j) => {
      const lease = j["lease_until"] as string | null;
      return !lease || new Date(lease).getTime() < now;
    });
    if (!free.length) return { task: null, pending: list.length };

    const job = free[0] as unknown as import("@/lib/jobs/store.server").RenderJob;
    // Bail de 20 min : deux onglets ouverts ne montent jamais le même job.
    await patchJob(job.id, {
      lease_until: new Date(now + 20 * 60 * 1000).toISOString(),
      step: "rendering",
    });

    const scenes: StationScene[] = await Promise.all(
      (job.scenes ?? []).map(async (s) => ({
        index: s.index,
        narration: s.narration,
        videoUrl: s.clipPath ? await signedUrl(s.clipPath, 60 * 60 * 6) : null,
        imageUrl: s.imagePath ? await signedUrl(s.imagePath, 60 * 60 * 6) : null,
        audioUrl: s.audioPath ? await signedUrl(s.audioPath, 60 * 60 * 6) : null,
        words: s.words ?? [],
        duration: s.audioDuration ?? 0,
      })),
    );

    const path = `jobs/${job.id}/final.mp4`;
    const { data: up, error } = await db.storage
      .from(RENDER_BUCKET)
      .createSignedUploadUrl(path, { upsert: true });
    if (error || !up) throw new Error(`Upload impossible : ${error?.message ?? "échec"}`);

    await logEvent(job.id, "rendering", "Montage pris en charge par la station locale");

    const script = job.script as { title?: string } | null;
    return {
      task: {
        jobId: job.id,
        title: script?.title ?? job.topic ?? "Vidéo",
        language: job.language,
        visualStyle: job.visual_style,
        squareMask: job.visual_style === "papercraft",
        uploadUrl: up.signedUrl,
        uploadToken: up.token,
        path,
        scenes,
      },
      pending: list.length,
    };
  },
);

/** Le MP4 est déjà déposé dans le stockage : on clôture le job et on prévient l'OS. */
export const finishStationTask = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      jobId: z.string().uuid(),
      path: z.string().min(1),
      durationSec: z.number().nonnegative().optional(),
    }).parse,
  )
  .handler(async ({ data }) => {
    const { patchJob, logEvent } = await import("@/lib/jobs/store.server");
    await patchJob(data.jobId, {
      status: "done",
      step: "done",
      progress: 1,
      video_path: data.path,
      error: null,
      lease_until: null,
    });
    await logEvent(data.jobId, "done", "Vidéo finale montée par la station locale");
    const { notifyClient } = await import("@/lib/jobs/notify.server");
    await notifyClient(data.jobId);
    return { ok: true };
  });

/** Échec du montage : on libère le job pour une nouvelle tentative. */
export const failStationTask = createServerFn({ method: "POST" })
  .inputValidator(z.object({ jobId: z.string().uuid(), message: z.string().max(1000) }).parse)
  .handler(async ({ data }) => {
    const { patchJob, logEvent, getJob } = await import("@/lib/jobs/store.server");
    const job = await getJob(data.jobId);
    await logEvent(data.jobId, "rendering", data.message, "error");
    if ((job?.attempts ?? 0) >= 3) {
      await patchJob(data.jobId, {
        status: "failed",
        step: "failed",
        error: data.message.slice(0, 1000),
        lease_until: null,
      });
      const { notifyClient } = await import("@/lib/jobs/notify.server");
      await notifyClient(data.jobId);
    } else {
      await patchJob(data.jobId, { error: data.message.slice(0, 1000), lease_until: null });
    }
    return { ok: true };
  });

/** Vue d'ensemble de la file pour le tableau de bord de la station. */
export const stationQueue = createServerFn({ method: "GET" }).handler(async () => {
  const { admin, signedUrl } = await import("@/lib/jobs/store.server");
  const db = await admin();
  const { data } = await db
    .from("render_jobs")
    .select("id, poster_id, language, status, step, progress, topic, video_path, error, created_at")
    .order("created_at", { ascending: false })
    .limit(30);
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  return Promise.all(
    rows.map(async (r) => ({
      id: r["id"] as string,
      posterId: (r["poster_id"] as string | null) ?? null,
      language: r["language"] as string,
      status: r["status"] as string,
      step: r["step"] as string,
      progress: Number(r["progress"] ?? 0),
      topic: (r["topic"] as string | null) ?? null,
      error: (r["error"] as string | null) ?? null,
      createdAt: r["created_at"] as string,
      downloadUrl: r["video_path"]
        ? await signedUrl(r["video_path"] as string, 60 * 60 * 6)
        : null,
    })),
  );
});
