/**
 * Plateforme de diffusion : profils, comptes des posteurs, parcours d'accueil,
 * contrats et vidéo du jour.
 *
 * L'unité de travail est le COMPTE, pas le posteur : un posteur peut gérer un
 * compte français et un compte espagnol, chacun avec sa vidéo, sa légende, son
 * parcours d'installation et son suivi de publication.
 *
 * Le mot de passe des comptes sociaux n'est jamais stocké par posteur : il vit
 * uniquement dans la table des conventions, comme un gabarit.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  DEFAULT_CONVENTIONS,
  conventionGmail,
  conventionHandle,
  type ConventionRow,
} from "@/lib/conventions";

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

export type WarmupChecks = Record<string, boolean>;

export type PosterAccount = {
  id: string;
  platform: "instagram" | "tiktok" | "youtube";
  language: string;
  country_code: string;
  handle: string;
  gmail_address: string | null;
  status: string;
  followers: number;
  profile_url: string | null;
  created_at: string;
  /** Valeurs attendues par la convention, pour signaler un écart. */
  expected_handle: string;
  expected_gmail: string;
  gmail_done_at: string | null;
  handle_done_at: string | null;
  photo_done_at: string | null;
  warmup_started_at: string | null;
  warmup_done_at: string | null;
  warmup_checks: WarmupChecks;
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
  account_id: string;
  downloaded_at: string | null;
  posted_url: string | null;
  posted_at: string | null;
};

/** Actions de chauffe cochables par le posteur pendant les 24 premières heures. */
export const WARMUP_TASKS: { id: string; label: string }[] = [
  { id: "scroll", label: "Scroller le fil et les Reels 15 à 20 minutes, 2 ou 3 fois dans la journée" },
  { id: "follow", label: "S'abonner à 30 ou 40 comptes de culture générale, sciences, histoire ou faits insolites, dans ta langue" },
  { id: "engage", label: "Aimer et commenter sincèrement quelques publications" },
  { id: "watch", label: "Regarder plusieurs Reels jusqu'au bout" },
  { id: "slow", label: "Ne jamais s'abonner à 100 comptes d'un coup : étaler dans la journée" },
];

export const WARMUP_HOURS = 24;

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

/** Conventions globales, lues avec les droits serveur (jamais exposées en table au posteur). */
async function readConventions(): Promise<ConventionRow> {
  const db = await admin();
  const { data } = await db.from("account_conventions").select("*").eq("id", 1).maybeSingle();
  if (!data) return DEFAULT_CONVENTIONS;
  return {
    instagram_template: data.instagram_template,
    gmail_template: data.gmail_template,
    social_password: data.social_password,
    platform_password:
      (data as { platform_password?: string }).platform_password ??
      DEFAULT_CONVENTIONS.platform_password,
    bio_text: data.bio_text,
    upwork_message_fr: data.upwork_message_fr,
    upwork_message_en: data.upwork_message_en,
  };
}

type AccountRow = {
  id: string;
  platform: string;
  language: string;
  country_code: string;
  handle: string;
  gmail_address: string | null;
  status: string;
  followers: number;
  profile_url: string | null;
  created_at: string;
  gmail_done_at: string | null;
  handle_done_at: string | null;
  photo_done_at: string | null;
  warmup_started_at: string | null;
  warmup_done_at: string | null;
  warmup_checks: unknown;
};

export function decorateAccount(row: AccountRow, conv: ConventionRow): PosterAccount {
  return {
    id: row.id,
    platform: row.platform as PosterAccount["platform"],
    language: row.language,
    country_code: row.country_code,
    handle: row.handle,
    gmail_address: row.gmail_address,
    status: row.status,
    followers: row.followers,
    profile_url: row.profile_url,
    created_at: row.created_at,
    expected_handle: conventionHandle(conv, row.country_code),
    expected_gmail: conventionGmail(conv, row.country_code),
    gmail_done_at: row.gmail_done_at,
    handle_done_at: row.handle_done_at,
    photo_done_at: row.photo_done_at,
    warmup_started_at: row.warmup_started_at,
    warmup_done_at: row.warmup_done_at,
    warmup_checks: (row.warmup_checks ?? {}) as WarmupChecks,
  };
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
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const patch: { full_name?: string; country?: string | null } = {};
    if (data.fullName !== undefined) patch["full_name"] = data.fullName.trim();
    if (data.country !== undefined) patch["country"] = data.country.trim().toUpperCase();
    const { error } = await context.supabase.from("profiles").update(patch).eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* --------------------------------------------------------- mes comptes */

/** Tout ce dont l'espace posteur a besoin : comptes, valeurs à recopier, contrat. */
export const getMySpace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const conv = await readConventions();
    const { data, error } = await context.supabase
      .from("poster_accounts")
      .select("*")
      .eq("poster_id", context.userId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);

    const accounts = ((data ?? []) as unknown as AccountRow[]).map((r) => decorateAccount(r, conv));
    return {
      accounts,
      socialPassword: conv.social_password,
      bio: conv.bio_text,
      warmupHours: WARMUP_HOURS,
    };
  });

export const listMyAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const conv = await readConventions();
    const { data, error } = await context.supabase
      .from("poster_accounts")
      .select("*")
      .eq("poster_id", context.userId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return { accounts: ((data ?? []) as unknown as AccountRow[]).map((r) => decorateAccount(r, conv)) };
  });

/**
 * Le posteur corrige une valeur (pseudo déjà pris, adresse refusée…).
 * L'écart avec la convention est visible immédiatement côté administration.
 */
export const updateMyAccountIdentity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        accountId: z.string().uuid(),
        handle: z.string().min(2).max(80).optional(),
        gmail: z.string().email().max(160).optional(),
        profileUrl: z.string().max(300).optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const patch: Record<string, unknown> = {};
    if (data.handle !== undefined) patch["handle"] = data.handle.trim().replace(/^@/, "");
    if (data.gmail !== undefined) patch["gmail_address"] = data.gmail.trim().toLowerCase();
    if (data.profileUrl !== undefined) patch["profile_url"] = data.profileUrl.trim() || null;
    const { error } = await context.supabase
      .from("poster_accounts")
      .update(patch as never)
      .eq("id", data.accountId)
      .eq("poster_id", context.userId);
    if (error) throw new Error(error.message);
    await logAudit(context.userId, "account.identity_updated", "poster_accounts", data.accountId, patch);
    return { ok: true };
  });

/** Validation d'une étape du parcours, compte par compte. */
export const confirmAccountStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        accountId: z.string().uuid(),
        step: z.enum(["gmail", "handle", "photo", "warmup"]),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const current = await context.supabase
      .from("poster_accounts")
      .select("*")
      .eq("id", data.accountId)
      .eq("poster_id", context.userId)
      .maybeSingle();
    if (current.error) throw new Error(current.error.message);
    if (!current.data) throw new Error("Ce compte est introuvable.");
    const row = current.data as unknown as AccountRow;

    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {};

    if (data.step === "gmail") {
      if (!row.gmail_address) throw new Error("Renseigne d'abord l'adresse Gmail utilisée.");
      patch["gmail_done_at"] = now;
    }
    if (data.step === "handle") {
      if (!row.gmail_done_at) throw new Error("Termine d'abord l'étape 1.");
      if (!row.handle) throw new Error("Renseigne d'abord le pseudo du compte.");
      patch["handle_done_at"] = now;
    }
    if (data.step === "photo") {
      if (!row.handle_done_at) throw new Error("Termine d'abord l'étape 2.");
      patch["photo_done_at"] = now;
      // La chauffe de 24 heures démarre à la validation de l'étape 3.
      patch["warmup_started_at"] = row.warmup_started_at ?? now;
    }
    if (data.step === "warmup") {
      const started = row.warmup_started_at ? new Date(row.warmup_started_at).getTime() : 0;
      if (!started) throw new Error("Termine d'abord l'étape 3.");
      if (Date.now() - started < WARMUP_HOURS * 3600_000) {
        throw new Error("Les 24 heures de chauffe ne sont pas terminées.");
      }
      patch["warmup_done_at"] = now;
      patch["status"] = "active";
    }

    const { error } = await context.supabase
      .from("poster_accounts")
      .update(patch as never)
      .eq("id", data.accountId)
      .eq("poster_id", context.userId);
    if (error) throw new Error(error.message);
    await logAudit(context.userId, `onboarding.${data.step}_done`, "poster_accounts", data.accountId);
    return { ok: true };
  });

export const setWarmupCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        accountId: z.string().uuid(),
        key: z.string().max(40),
        value: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const current = await context.supabase
      .from("poster_accounts")
      .select("warmup_checks")
      .eq("id", data.accountId)
      .eq("poster_id", context.userId)
      .maybeSingle();
    if (current.error) throw new Error(current.error.message);
    const checks = { ...((current.data?.warmup_checks ?? {}) as WarmupChecks), [data.key]: data.value };
    const { error } = await context.supabase
      .from("poster_accounts")
      .update({ warmup_checks: checks as never })
      .eq("id", data.accountId)
      .eq("poster_id", context.userId);
    if (error) throw new Error(error.message);
    return { checks };
  });

/* ------------------------------------------------------------- contrat */

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

/* --------------------------------------------------------- vidéo du jour */

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

/**
 * Une vidéo par COMPTE : un posteur avec un compte français et un compte
 * espagnol voit deux vidéos, chacune avec sa légende dans sa langue.
 */
export const listMyVideos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const accounts = await context.supabase
      .from("poster_accounts")
      .select("id, language, handle, platform, warmup_done_at")
      .eq("poster_id", context.userId)
      .order("created_at", { ascending: true });
    if (accounts.error) throw new Error(accounts.error.message);
    const rows = (accounts.data ?? []) as {
      id: string;
      language: string;
      handle: string;
      platform: string;
      warmup_done_at: string | null;
    }[];
    // TOUS les comptes reçoivent la vidéo du jour de leur langue : la chauffe
    // reste obligatoire dans le parcours mais ne conditionne plus l'accès.
    const ready = rows;
    const languages = Array.from(new Set(ready.map((a) => a.language)));

    const since = new Date();
    since.setDate(since.getDate() - 30);

    const videos =
      languages.length === 0
        ? []
        : ((
            await context.supabase
              .from("daily_videos")
              .select(
                "id, publish_date, language, title, caption, hashtags, duration_sec, storage_path, status",
              )
              .in("language", languages)
              .eq("status", "published")
              .gte("publish_date", isoDay(since))
              .order("publish_date", { ascending: false })
          ).data ?? []);

    const downloads = await context.supabase
      .from("video_downloads")
      .select("daily_video_id, account_id, downloaded_at, posted_url, posted_at")
      .eq("poster_id", context.userId);

    const key = (videoId: string, accountId: string) => `${videoId}:${accountId}`;
    const byKey = new Map<
      string,
      { downloaded_at: string; posted_url: string | null; posted_at: string | null }
    >();
    for (const d of downloads.data ?? []) {
      if (!d.account_id) continue;
      byKey.set(key(d.daily_video_id, d.account_id), {
        downloaded_at: d.downloaded_at,
        posted_url: d.posted_url,
        posted_at: d.posted_at,
      });
    }

    const list: DailyVideo[] = [];
    for (const account of ready) {
      for (const v of videos) {
        if (v.language !== account.language) continue;
        const tracked = byKey.get(key(v.id, account.id));
        list.push({
          id: v.id,
          publish_date: v.publish_date,
          language: v.language,
          title: v.title,
          caption: v.caption,
          hashtags: v.hashtags ?? [],
          duration_sec: Number(v.duration_sec ?? 0),
          storage_path: v.storage_path,
          account_id: account.id,
          downloaded_at: tracked?.downloaded_at ?? null,
          posted_url: tracked?.posted_url ?? null,
          posted_at: tracked?.posted_at ?? null,
        });
      }
    }

    return {
      today: isoDay(new Date()),
      accounts: rows.map((a) => ({
        id: a.id,
        language: a.language,
        handle: a.handle,
        platform: a.platform,
        ready: Boolean(a.warmup_done_at),
      })),
      videos: list,
    };
  });

/** Lien de lecture/téléchargement signé + trace du téléchargement, par compte. */
export const getVideoLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        videoId: z.string().uuid(),
        accountId: z.string().uuid(),
        track: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const account = await context.supabase
      .from("poster_accounts")
      .select("id")
      .eq("id", data.accountId)
      .eq("poster_id", context.userId)
      .maybeSingle();
    if (!account.data) throw new Error("Ce compte n'est pas le tien.");

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
      const existing = await context.supabase
        .from("video_downloads")
        .select("id")
        .eq("daily_video_id", data.videoId)
        .eq("account_id", data.accountId)
        .maybeSingle();
      if (!existing.data) {
        await context.supabase.from("video_downloads").insert({
          daily_video_id: data.videoId,
          account_id: data.accountId,
          poster_id: context.userId,
        });
      }
      await logAudit(context.userId, "video.downloaded", "daily_videos", data.videoId, {
        account_id: data.accountId,
      });
    }

    return { url: signed.data.signedUrl };
  });

export const markPosted = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        videoId: z.string().uuid(),
        accountId: z.string().uuid(),
        url: z.string().url().max(500),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const account = await context.supabase
      .from("poster_accounts")
      .select("id")
      .eq("id", data.accountId)
      .eq("poster_id", context.userId)
      .maybeSingle();
    if (!account.data) throw new Error("Ce compte n'est pas le tien.");

    const existing = await context.supabase
      .from("video_downloads")
      .select("id")
      .eq("daily_video_id", data.videoId)
      .eq("account_id", data.accountId)
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
        account_id: data.accountId,
        poster_id: context.userId,
        posted_url: data.url,
        posted_at: new Date().toISOString(),
      });
      if (error) throw new Error(error.message);
    }
    await logAudit(context.userId, "video.posted", "daily_videos", data.videoId, {
      url: data.url,
      account_id: data.accountId,
    });
    return { ok: true };
  });
