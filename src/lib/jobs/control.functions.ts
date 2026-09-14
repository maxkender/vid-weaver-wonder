/**
 * Contrôle de sécurité de la file de production : arrêt d'un job, mise en
 * pause / reprise globale du pipeline.
 *
 * Un arrêt ne détruit rien : images, clips et voix déjà produits restent en
 * base et ne seront jamais repayés lors d'une reprise.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Passe un job en `cancelled` et libère son bail. */
export const cancelJob = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ jobId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { patchJob, logEvent, getJob } = await import("./store.server");
    const job = await getJob(data.jobId);
    if (!job) return { ok: false as const, reason: "Job introuvable." };
    if (job.status === "done" || job.status === "cancelled") {
      return { ok: true as const, status: job.status };
    }
    await patchJob(data.jobId, {
      status: "cancelled",
      step: "cancelled",
      lease_until: null,
    });
    await logEvent(data.jobId, "cancelled", "Arrêt demandé — aucun actif supprimé", "warn");
    return { ok: true as const, status: "cancelled" as const };
  });

/** Coupe-circuit global : plus aucun appel IA payant n'est lancé. */
export const stopPipeline = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ reason: z.string().max(300).optional() }).parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { setPaused } = await import("./store.server");
    await setPaused(true, data.reason ?? "Arrêt manuel depuis le studio");
    return { paused: true as const };
  });

/** Relance la file : les jobs reprennent là où ils s'étaient arrêtés. */
export const resumePipeline = createServerFn({ method: "POST" }).handler(async () => {
  const { setPaused } = await import("./store.server");
  await setPaused(false, null);
  return { paused: false as const };
});

/** État du coupe-circuit, pour afficher le bouton « Reprendre ». */
export const pipelineState = createServerFn({ method: "GET" }).handler(async () => {
  const { isPaused } = await import("./store.server");
  return await isPaused();
});
