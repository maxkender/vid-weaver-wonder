/**
 * Sauvegarde en ligne des vidéos exportées par le studio.
 *
 * Le navigateur assemble la vidéo, puis l'envoie DIRECTEMENT sur une URL
 * d'envoi signée du bucket privé `renders` : le fichier (20 Mo et plus) ne
 * transite jamais par le serveur de l'application, qui ne fait que signer.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Date du jour au format AAAA-MM-JJ. */
function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Garde-fou : seul un administrateur range une vidéo dans la diffusion. */
async function requireAdmin(context: unknown) {
  const ctx = context as { supabase: any; userId: string };
  const { data } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (!data) throw new Error("Accès réservé à l'administrateur.");
  return ctx.userId;
}


/** Chemin d'un export : studio/{projet}/{langue}.mp4 */
function exportPath(projectId: string, language: string) {
  const safe = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
  return `studio/${safe(projectId)}/${safe(language) || "fr"}.mp4`;
}

/** URL d'envoi signée (valable 2 h : largement de quoi téléverser 20-50 Mo). */
export const createExportUpload = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: z.string().min(1).max(128),
        language: z.string().min(2).max(5),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { admin, RENDER_BUCKET } = await import("./jobs/store.server");
    const db = await admin();
    const path = exportPath(data.projectId, data.language);
    const { data: res, error } = await db.storage
      .from(RENDER_BUCKET)
      .createSignedUploadUrl(path, { upsert: true });
    if (error || !res?.token) {
      throw new Error(`Envoi impossible : ${error?.message ?? "URL signée indisponible"}`);
    }
    return { path, token: res.token, bucket: RENDER_BUCKET };
  });

/** Lien de téléchargement signé, valable 7 jours par défaut. */
export const getExportDownloadUrl = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        path: z.string().min(1).max(300),
        days: z.number().int().min(1).max(30).default(7),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { signedUrl } = await import("./jobs/store.server");
    const url = await signedUrl(data.path, data.days * 24 * 60 * 60);
    return { url, expiresAt: Date.now() + data.days * 24 * 60 * 60 * 1000 };
  });

/**
 * RANGE UN EXPORT DANS LA DIFFUSION DU JOUR.
 *
 * Dès qu'une langue est montée puis envoyée dans le stockage, sa ligne
 * `daily_videos` du jour est créée ou mise à jour : c'est ce que le posteur
 * voit dans son espace. Le statut d'une journée déjà publiée n'est jamais
 * remis en brouillon par une simple resauvegarde.
 */
export const saveDailyExport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        language: z.string().min(2).max(5),
        path: z.string().min(1).max(300),
        durationSec: z.number().min(0).max(3600).default(0),
        title: z.string().max(200).default(""),
        caption: z.string().max(3000).default(""),
        hashtags: z.array(z.string().max(60)).max(40).default([]),
        renderId: z.string().max(128).optional(),
        date: z.string().length(10).optional(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin;
    const date = data.date ?? isoDay(new Date());

    const existing = await db
      .from("daily_videos")
      .select("id, status")
      .eq("publish_date", date)
      .eq("language", data.language)
      .maybeSingle();

    const row = {
      publish_date: date,
      language: data.language,
      storage_path: data.path,
      title: data.title,
      caption: data.caption,
      hashtags: data.hashtags.map((h) => h.trim().replace(/^#/, "")).filter(Boolean),
      duration_sec: data.durationSec,
      ...(data.renderId ? { render_id: data.renderId } : {}),
      status: existing.data?.status ?? "draft",
    };

    const { error } = await db
      .from("daily_videos")
      .upsert(row as never, { onConflict: "publish_date,language" });
    if (error) throw new Error(`Diffusion impossible : ${error.message}`);
    return { date, language: data.language, status: row.status };
  });
