/** Webhook signé vers l'OS marketing quand un job change d'état final. */

import { admin, getJob, signedUrl } from "./store.server";
import { signedHeaders } from "./signing.server";

export async function notifyClient(jobId: string) {
  const job = await getJob(jobId);
  if (!job?.callback_url) return;

  let secret = "";
  if (job.client_id) {
    const db = await admin();
    const { data } = await db
      .from("api_clients")
      .select("webhook_secret")
      .eq("id", job.client_id)
      .maybeSingle();
    secret = (data as { webhook_secret?: string } | null)?.webhook_secret ?? "";
  }
  if (!secret) return;

  const payload = {
    jobId: job.id,
    posterId: job.poster_id,
    language: job.language,
    status: job.status,
    topic: job.topic,
    error: job.error,
    downloadUrl: job.video_path ? await signedUrl(job.video_path, 60 * 60 * 24) : null,
    expiresInSeconds: job.video_path ? 60 * 60 * 24 : null,
  };
  const body = JSON.stringify(payload);
  try {
    await fetch(job.callback_url, {
      method: "POST",
      headers: await signedHeaders(secret, body),
      body,
    });
  } catch {
    // Le webhook est best-effort : l'OS peut toujours interroger GET /api/public/videos/{id}.
  }
}
