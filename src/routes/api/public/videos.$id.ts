/** API publique : statut d'un job + lien de téléchargement signé. */
import { createFileRoute } from "@tanstack/react-router";

import { admin, getJob, signedUrl } from "@/lib/jobs/store.server";
import { sha256Hex } from "@/lib/jobs/signing.server";

async function clientFromKey(request: Request) {
  const apiKey = request.headers.get("x-api-key");
  if (!apiKey) return null;
  const db = await admin();
  const { data } = await db
    .from("api_clients")
    .select("id, active")
    .eq("key_hash", await sha256Hex(apiKey))
    .maybeSingle();
  const row = data as { id: string; active: boolean } | null;
  return row?.active ? row : null;
}

export const Route = createFileRoute("/api/public/videos/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const client = await clientFromKey(request);
        if (!client) return Response.json({ error: "unauthorized" }, { status: 401 });

        const job = await getJob(params.id);
        if (!job || job.client_id !== client.id) {
          return Response.json({ error: "not found" }, { status: 404 });
        }
        return Response.json({
          jobId: job.id,
          posterId: job.poster_id,
          language: job.language,
          status: job.status,
          step: job.step,
          progress: Number(job.progress),
          topic: job.topic,
          error: job.error,
          downloadUrl: job.video_path ? await signedUrl(job.video_path, 60 * 60 * 24) : null,
        });
      },
      DELETE: async ({ request, params }) => {
        const client = await clientFromKey(request);
        if (!client) return Response.json({ error: "unauthorized" }, { status: 401 });
        const job = await getJob(params.id);
        if (!job || job.client_id !== client.id) {
          return Response.json({ error: "not found" }, { status: 404 });
        }
        if (job.status === "done") return Response.json({ status: "done" });
        const db = await admin();
        await db
          .from("render_jobs")
          .update({ status: "cancelled", step: "cancelled", lease_until: null })
          .eq("id", job.id);
        return Response.json({ status: "cancelled" });
      },
    },
  },
});
