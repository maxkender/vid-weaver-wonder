/** Retour du service de rendu : MP4 final ou échec. */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import {
  getJob,
  patchJob,
  patchJobIfStatus,
  logEvent,
  uploadBytes,
} from "@/lib/jobs/store.server";
import { verifySignedBody } from "@/lib/jobs/signing.server";

const schema = z.object({
  jobId: z.string().uuid(),
  status: z.enum(["done", "failed"]),
  error: z.string().max(2000).optional(),
  /** URL temporaire du MP4 produit par le worker. */
  videoUrl: z.string().url().optional(),
  durationSec: z.number().optional(),
});

export const Route = createFileRoute("/api/public/jobs/render-callback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["RENDER_WORKER_SECRET"];
        if (!secret) return Response.json({ error: "worker not configured" }, { status: 500 });

        const raw = await request.text();
        const check = await verifySignedBody(request, raw, secret);
        if (!check.ok) return Response.json({ error: check.reason }, { status: 401 });

        let body: z.infer<typeof schema>;
        try {
          body = schema.parse(JSON.parse(raw));
        } catch (e) {
          return Response.json(
            { error: e instanceof Error ? e.message : "invalid body" },
            { status: 400 },
          );
        }

        const job = await getJob(body.jobId);
        if (!job) return Response.json({ error: "not found" }, { status: 404 });

        // RAPPEL IDEMPOTENT : un travail déjà terminé n'est jamais réécrit, et
        // la vidéo du jour n'est pas retouchée par un rappel en double.
        if (job.status === "done" || job.status === "cancelled") {
          await logEvent(
            job.id,
            "callback",
            `Rappel ignoré : travail déjà « ${job.status} »`,
            "warn",
          );
          return Response.json({ ok: true, ignored: job.status });
        }

        if (body.status === "failed" || !body.videoUrl) {
          await patchJob(job.id, {
            status: "failed",
            step: "failed",
            error: body.error?.slice(0, 1000) ?? "rendu échoué",
            lease_until: null,
          });
        } else {
          const res = await fetch(body.videoUrl);
          if (!res.ok) {
            await patchJob(job.id, {
              status: "failed",
              step: "failed",
              error: `téléchargement du MP4 impossible (${res.status})`,
              lease_until: null,
            });
          } else {
            const path = await uploadBytes(
              `jobs/${job.id}/final.mp4`,
              await res.arrayBuffer(),
              "video/mp4",
            );
            // Règle unique : tout travail qui n'est pas déjà terminé ou annulé
            // est finalisé par un rappel valide. Aucun autre critère ne bloque.
            const won = await patchJobIfStatus(
              job.id,
              ["queued", "scripting", "images", "voice", "clips", "rendering", "failed"],
              {
                status: "done",
                step: "done",
                progress: 1,
                video_path: path,
                error: null,
                lease_until: null,
              },
            );
            if (!won) {
              await logEvent(
                job.id,
                "callback",
                "Rappel refusé : le travail est passé à un état final pendant le traitement",
                "warn",
              );
              return Response.json({ ok: true, ignored: "already-final" });
            }
            await logEvent(job.id, "done", "Vidéo finale disponible");

            // La vidéo rejoint la diffusion du jour dans sa langue, en brouillon :
            // l'administrateur la relit et la publie depuis son tableau de bord.
            try {
              const { admin } = await import("@/lib/jobs/store.server");
              const db = await admin();
              // Date de diffusion : celle voulue par le travail si elle existe,
              // sinon le jour courant DANS LE FUSEAU de diffusion (un rendu
              // terminé à 23 h à Paris appartient au jour en cours, pas à la veille).
              const { data: settings } = await db
                .from("distribution_settings")
                .select("timezone")
                .eq("id", 1)
                .maybeSingle();
              const timeZone = (settings as { timezone?: string } | null)?.timezone ?? "Europe/Paris";
              const localDay = new Intl.DateTimeFormat("en-CA", {
                timeZone,
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
              }).format(new Date());
              await db.from("daily_videos").upsert(
                {
                  publish_date: job.publish_date ?? localDay,
                  language: job.language,
                  render_id: job.id,
                  storage_path: path,
                  title: job.topic ?? "",
                  duration_sec: body.durationSec ?? job.duration_sec ?? 0,
                  status: "draft",
                },
                { onConflict: "publish_date,language" },
              );
            } catch {
              /* l'assignation du jour ne doit jamais faire échouer le rendu */
            }
          }
        }

        const { notifyClient } = await import("@/lib/jobs/notify.server");
        await notifyClient(job.id);
        return Response.json({ ok: true });
      },
    },
  },
});
