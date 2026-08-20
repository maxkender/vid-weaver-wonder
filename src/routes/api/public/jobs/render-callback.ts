/** Retour du service de rendu : MP4 final ou échec. */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { getJob, patchJob, logEvent, uploadBytes } from "@/lib/jobs/store.server";
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
            await patchJob(job.id, {
              status: "done",
              step: "done",
              progress: 1,
              video_path: path,
              video_duration: body.durationSec ?? null,
              error: null,
              lease_until: null,
            });
            await logEvent(job.id, "done", "Vidéo finale disponible");
          }
        }

        const { notifyClient } = await import("@/lib/jobs/notify.server");
        await notifyClient(job.id);
        return Response.json({ ok: true });
      },
    },
  },
});
