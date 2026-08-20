/**
 * Accès base + stockage pour la file d'attente de production vidéo.
 * Serveur uniquement (clé de service).
 */

export type JobStatus =
  | "queued"
  | "scripting"
  | "images"
  | "voice"
  | "clips"
  | "rendering"
  | "done"
  | "failed"
  | "cancelled";

export type JobScene = {
  index: number;
  narration: string;
  overlay?: string;
  imagePrompt: string;
  videoPrompt: string;
  /** Chemins dans le bucket privé `renders`. */
  imagePath?: string;
  clipPath?: string;
  audioPath?: string;
  /** Job vidéo du gateway en cours (reprise sans repayer). */
  clipJobId?: string;
  clipFailed?: boolean;
  words?: { word: string; start: number; end: number }[];
  audioDuration?: number;
};

export type RenderJob = {
  id: string;
  client_id: string | null;
  poster_id: string | null;
  language: string;
  narration_style: string;
  topic_category: string;
  visual_style: string;
  duration_sec: number;
  voice_id: string | null;
  voice_engine: string;
  topic: string | null;
  callback_url: string | null;
  status: JobStatus;
  step: string;
  progress: number;
  script: unknown;
  scenes: JobScene[];
  video_path: string | null;
  error: string | null;
  attempts: number;
  lease_until: string | null;
  created_at: string;
  updated_at: string;
};

export const RENDER_BUCKET = "renders";

export async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // Accès souple : les colonnes JSONB de la file sont manipulées dynamiquement.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return supabaseAdmin as unknown as import("@supabase/supabase-js").SupabaseClient<any>;
}

export async function logEvent(
  jobId: string,
  step: string,
  message: string,
  level: "info" | "error" | "warn" = "info",
) {
  const db = await admin();
  await db.from("job_events").insert({ job_id: jobId, step, message: message.slice(0, 2000), level });
}

export async function patchJob(jobId: string, patch: Record<string, unknown>) {
  const db = await admin();
  await db.from("render_jobs").update(patch).eq("id", jobId);
}

export async function getJob(jobId: string): Promise<RenderJob | null> {
  const db = await admin();
  const { data } = await db.from("render_jobs").select("*").eq("id", jobId).maybeSingle();
  return (data as RenderJob | null) ?? null;
}

/** Interrupteur global : coupe-circuit crédits IA. */
export async function isPaused(): Promise<{ paused: boolean; reason: string | null }> {
  const db = await admin();
  const { data } = await db.from("job_control").select("paused, paused_reason").eq("id", 1).maybeSingle();
  const row = data as { paused?: boolean; paused_reason?: string | null } | null;
  return { paused: Boolean(row?.paused), reason: row?.paused_reason ?? null };
}

export async function setPaused(paused: boolean, reason: string | null) {
  const db = await admin();
  await db
    .from("job_control")
    .update({ paused, paused_reason: reason, paused_at: paused ? new Date().toISOString() : null })
    .eq("id", 1);
}

/** Prend un job libre (verrou en base : jamais deux traitements en parallèle). */
export async function claimJob(leaseSeconds = 240): Promise<RenderJob | null> {
  const db = await admin();
  const { data, error } = await db.rpc("claim_render_job", { lease_seconds: leaseSeconds });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as RenderJob[];
  return rows[0] ?? null;
}

export async function releaseJob(jobId: string) {
  await patchJob(jobId, { lease_until: null });
}

// ---------- Stockage ----------

export async function uploadBytes(path: string, bytes: ArrayBuffer, contentType: string) {
  const db = await admin();
  const { error } = await db.storage
    .from(RENDER_BUCKET)
    .upload(path, bytes, { contentType, upsert: true });
  if (error) throw new Error(`Stockage (${path}) : ${error.message}`);
  return path;
}

export async function uploadDataUrl(path: string, dataUrl: string) {
  const match = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);
  if (!match) throw new Error("Data URL invalide.");
  const contentType = match[1]!;
  const binary = atob(match[2]!);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return uploadBytes(path, bytes.buffer, contentType);
}

export async function signedUrl(path: string, expiresIn = 60 * 60 * 24): Promise<string> {
  const db = await admin();
  const { data, error } = await db.storage.from(RENDER_BUCKET).createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) throw new Error(`URL signée (${path}) : ${error?.message ?? "échec"}`);
  return data.signedUrl;
}

export async function downloadAsDataUrl(path: string): Promise<string> {
  const db = await admin();
  const { data, error } = await db.storage.from(RENDER_BUCKET).download(path);
  if (error || !data) throw new Error(`Lecture (${path}) : ${error?.message ?? "échec"}`);
  const buf = new Uint8Array(await data.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    binary += String.fromCharCode(...buf.subarray(i, i + chunk));
  }
  return `data:${data.type || "application/octet-stream"};base64,${btoa(binary)}`;
}
