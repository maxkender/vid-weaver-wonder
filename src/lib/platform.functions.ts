/**
 * Plateforme de diffusion : profils, comptes des posteurs, contrats et vidéo du jour.
 * Aucun mot de passe de compte tiers (Gmail, Instagram, TikTok) n'est jamais reçu,
 * transmis ni stocké par ces fonctions.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PlatformRole = "admin" | "poster";

export type PlatformProfile = {
  id: string;
  role: PlatformRole;
  full_name: string;
  email: string;
  country: string | null;
  language: string;
  status: string;
  gmail_address: string | null;
  created_at: string;
};

export type PosterAccount = {
  id: string;
  platform: "instagram" | "tiktok" | "youtube";
  handle: string;
  gmail_address: string | null;
  status: string;
  followers: number;
  profile_url: string | null;
  created_at: string;
};

export type SignedContract = {
  id: string;
  version: number;
  body: string;
  signed_full_name: string;
  signed_at: string;
};

export type DailyVideo = {
  id: string;
  publish_date: string;
  language: string;
  title: string;
  caption: string;
  hashtags: string[];
  duration_sec: number;
  storage_path: string | null;
  downloaded_at: string | null;
  posted_url: string | null;
  posted_at: string | null;
};

const RENDER_BUCKET = "renders";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function logAudit(
  actorId: string,
  action: string,
  targetTable: string,
  targetId: string | null,
  payload: Record<string, unknown> = {},
) {
  const db = await admin();
  await db.from("audit_log").insert({
    actor_id: actorId,
    action,
    target_table: targetTable,
    target_id: targetId,
    payload: payload as never,
  });
}

/**
 * Renvoie le profil de l'utilisateur connecté, en le créant à la première visite.
 * Le tout premier compte de la plateforme devient administrateur, les suivants
 * sont des posteurs. Le rôle n'est jamais transmis par le client.
 */
async function ensureProfile(userId: string, email: string): Promise<PlatformProfile> {
  const db = await admin();
  const existing = await db.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data) return existing.data as PlatformProfile;

  const { count, error: countError } = await db
    .from("profiles")
    .select("id", { count: "exact", head: true });
  if (countError) throw new Error(countError.message);

  const role: PlatformRole = (count ?? 0) === 0 ? "admin" : "poster";
  const inserted = await db
    .from("profiles")
    .insert({ id: userId, email, role, status: "active" })
    .select("*")
    .single();
  if (inserted.error) throw new Error(inserted.error.message);
  await logAudit(userId, "profile.created", "profiles", userId, { role });
  return inserted.data as PlatformProfile;
}

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const email = String((context.claims as Record<string, unknown>)["email"] ?? "");
    return await ensureProfile(context.userId, email);
  });

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        fullName: z.string().max(120).optional(),
        country: z.string().max(4).optional(),
        language: z.enum(["fr", "en", "es", "de", "it"]).optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const patch: Record<string, unknown> = {};
    if (data.fullName !== undefined) patch["full_name"] = data.fullName.trim();
    if (data.country !== undefined) patch["country"] = data.country.trim().toUpperCase();
    if (data.language !== undefined) patch["language"] = data.language;
    const { error } = await context.supabase.from("profiles").update(patch).eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Étape 1 du parcours : adresse Gmail dédiée. Jamais de mot de passe. */
export const saveGmailAddress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ gmail: z.string().email().max(160) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const gmail = data.gmail.trim().toLowerCase();
    const { error } = await context.supabase
      .from("profiles")
      .update({ gmail_address: gmail })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    await logAudit(context.userId, "profile.gmail_saved", "profiles", context.userId, { gmail });
    return { ok: true };
  });

export const listMyAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("poster_accounts")
      .select("id, platform, handle, gmail_address, status, followers, profile_url, created_at")
      .eq("poster_id", context.userId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return { accounts: (data ?? []) as PosterAccount[] };
  });

export const addMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        platform: z.enum(["instagram", "tiktok", "youtube"]),
        handle: z.string().min(2).max(80),
        profileUrl: z.string().max(300).optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const profile = await context.supabase
      .from("profiles")
      .select("gmail_address")
      .eq("id", context.userId)
      .maybeSingle();
    const { error } = await context.supabase.from("poster_accounts").insert({
      poster_id: context.userId,
      platform: data.platform,
      handle: data.handle.trim().replace(/^@/, ""),
      gmail_address: profile.data?.gmail_address ?? null,
      profile_url: data.profileUrl?.trim() || null,
      status: "pending",
    });
    if (error) throw new Error(error.message);
    await logAudit(context.userId, "poster_account.created", "poster_accounts", null, {
      platform: data.platform,
      handle: data.handle,
    });
    return { ok: true };
  });

export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("poster_accounts")
      .delete()
      .eq("id", data.id)
      .eq("poster_id", context.userId);
    if (error) throw new Error(error.message);
    await logAudit(context.userId, "poster_account.deleted", "poster_accounts", data.id);
    return { ok: true };
  });

export const getActiveContractTemplate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("contract_templates")
      .select("version, title, body")
      .eq("is_active", true)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { template: data ?? null };
  });

export const getMyContract = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("contracts")
      .select("id, version, body, signed_full_name, signed_at")
      .eq("poster_id", context.userId)
      .order("signed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { contract: (data ?? null) as SignedContract | null };
  });

export const signContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ fullName: z.string().min(3).max(120), accepted: z.literal(true) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const tpl = await context.supabase
      .from("contract_templates")
      .select("version, body")
      .eq("is_active", true)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (tpl.error) throw new Error(tpl.error.message);
    if (!tpl.data) throw new Error("Aucun modèle de contrat actif n'est disponible.");

    const request = getRequest();
    const ip =
      request?.headers.get("cf-connecting-ip") ||
      request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      null;
    const userAgent = request?.headers.get("user-agent") ?? null;

    const { error } = await context.supabase.from("contracts").insert({
      poster_id: context.userId,
      version: tpl.data.version,
      body: tpl.data.body,
      signed_full_name: data.fullName.trim(),
      signed_ip: ip,
      signed_user_agent: userAgent,
    });
    if (error) throw new Error(error.message);
    await context.supabase.from("profiles").update({ status: "active" }).eq("id", context.userId);
    await logAudit(context.userId, "contract.signed", "contracts", context.userId, {
      version: tpl.data.version,
      signed_full_name: data.fullName.trim(),
    });
    return { ok: true };
  });

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Vidéo du jour dans la langue du posteur + historique des 30 derniers jours. */
export const listMyVideos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const profile = await context.supabase
      .from("profiles")
      .select("language")
      .eq("id", context.userId)
      .maybeSingle();
    const language = profile.data?.language ?? "fr";

    const since = new Date();
    since.setDate(since.getDate() - 30);

    const { data, error } = await context.supabase
      .from("daily_videos")
      .select(
        "id, publish_date, language, title, caption, hashtags, duration_sec, storage_path, status",
      )
      .eq("language", language)
      .eq("status", "published")
      .gte("publish_date", isoDay(since))
      .order("publish_date", { ascending: false });
    if (error) throw new Error(error.message);

    const rows = data ?? [];
    const downloads = await context.supabase
      .from("video_downloads")
      .select("daily_video_id, downloaded_at, posted_url, posted_at")
      .eq("poster_id", context.userId);

    const byVideo = new Map<string, { downloaded_at: string; posted_url: string | null; posted_at: string | null }>();
    for (const d of downloads.data ?? []) {
      const prev = byVideo.get(d.daily_video_id);
      if (!prev || (d.posted_url && !prev.posted_url)) {
        byVideo.set(d.daily_video_id, {
          downloaded_at: d.downloaded_at,
          posted_url: d.posted_url,
          posted_at: d.posted_at,
        });
      }
    }

    const videos: DailyVideo[] = rows.map((r) => ({
      id: r.id,
      publish_date: r.publish_date,
      language: r.language,
      title: r.title,
      caption: r.caption,
      hashtags: r.hashtags ?? [],
      duration_sec: Number(r.duration_sec ?? 0),
      storage_path: r.storage_path,
      downloaded_at: byVideo.get(r.id)?.downloaded_at ?? null,
      posted_url: byVideo.get(r.id)?.posted_url ?? null,
      posted_at: byVideo.get(r.id)?.posted_at ?? null,
    }));

    return { language, today: isoDay(new Date()), videos };
  });

/** Lien de lecture/téléchargement signé + trace du téléchargement. */
export const getVideoLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ videoId: z.string().uuid(), track: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const video = await context.supabase
      .from("daily_videos")
      .select("id, storage_path, status")
      .eq("id", data.videoId)
      .maybeSingle();
    if (video.error) throw new Error(video.error.message);
    if (!video.data?.storage_path) throw new Error("Cette vidéo n'a pas encore de fichier.");

    const db = await admin();
    const signed = await db.storage
      .from(RENDER_BUCKET)
      .createSignedUrl(video.data.storage_path, 60 * 60);
    if (signed.error) throw new Error(signed.error.message);

    if (data.track) {
      await context.supabase
        .from("video_downloads")
        .insert({ daily_video_id: data.videoId, poster_id: context.userId });
      await logAudit(context.userId, "video.downloaded", "daily_videos", data.videoId);
    }

    return { url: signed.data.signedUrl };
  });

export const markPosted = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ videoId: z.string().uuid(), url: z.string().url().max(500) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const existing = await context.supabase
      .from("video_downloads")
      .select("id")
      .eq("daily_video_id", data.videoId)
      .eq("poster_id", context.userId)
      .order("downloaded_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing.data) {
      const { error } = await context.supabase
        .from("video_downloads")
        .update({ posted_url: data.url, posted_at: new Date().toISOString() })
        .eq("id", existing.data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase.from("video_downloads").insert({
        daily_video_id: data.videoId,
        poster_id: context.userId,
        posted_url: data.url,
        posted_at: new Date().toISOString(),
      });
      if (error) throw new Error(error.message);
    }
    await logAudit(context.userId, "video.posted", "daily_videos", data.videoId, { url: data.url });
    return { ok: true };
  });
