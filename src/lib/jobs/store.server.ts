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
  /** Travail maître dont ce travail réutilise images et clips (null = maître). */
  master_id: string | null;
  /** Sur le maître : toutes les langues à produire à partir des mêmes visuels. */
  languages: string[];
  /** Date de diffusion voulue (fuseau de diffusion), sinon le jour du rendu. */
  publish_date: string | null;
  narration_style: string;
  topic_category: string;
  visual_style: string;
  duration_sec: number;
  voice_id: string | null;
  voice_engine: string;
  topic: string | null;
  callback_url: string | null;
  /** Ajouter le plan CTA Sophia à la fin du script. */
  include_cta: boolean;
  status: JobStatus;
  step: string;
  progress: number;
  script: unknown;
  scenes: JobScene[];
  video_path: string | null;
  /** Dernier envoi du manifeste au service de rendu (attente du rappel). */
  rendering_sent_at: string | null;
  /** Nombre d'envois du manifeste (plafonné : jamais de boucle de rendu). */
  rendering_sends: number;
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

/**
 * Écriture CONDITIONNÉE au statut attendu : si le rappel du service de rendu
 * est arrivé entre-temps (le job est passé en `done`), l'écriture périmée du
 * tick est refusée. Le rappel gagne toujours.
 */
export async function patchJobIfStatus(
  jobId: string,
  expectedStatus: JobStatus | JobStatus[],
  patch: Record<string, unknown>,
): Promise<boolean> {
  const db = await admin();
  const expected = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
  const { data, error } = await db
    .from("render_jobs")
    .update(patch)
    .eq("id", jobId)
    .in("status", expected)
    .select("id");
  // Une écriture refusée par la base (colonne inconnue, contrainte) ne doit
  // jamais être confondue avec « le travail est déjà final ».
  if (error) throw new Error(`Écriture du travail impossible : ${error.message}`);
  return ((data ?? []) as unknown[]).length > 0;
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

/**
 * Libère UNIQUEMENT le bail. Ne touche jamais `status`, `step`, `progress`
 * ni `video_path` : un rappel arrivé pendant le tick ne doit pas être écrasé.
 */
export async function releaseJob(jobId: string) {
  const db = await admin();
  await db.from("render_jobs").update({ lease_until: null }).eq("id", jobId);
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
