/**
 * TABLEAU DE BORD ADMINISTRATEUR.
 *
 * Toutes les fonctions vérifient le rôle côté serveur (jamais depuis le client)
 * avant d'utiliser les droits d'administration. Aucun mot de passe de compte
 * tiers (Gmail, Instagram, TikTok) n'est jamais reçu ni stocké ici : seul le
 * mot de passe de connexion à CETTE plateforme est manipulé.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  DEFAULT_CONVENTIONS,
  conventionGmail,
  conventionHandle,
  defaultCountryFor,
  fillUpworkMessage,
  platformPassword,
  normalizeCountry,
  type ConventionRow,
} from "@/lib/conventions";

const LOGIN_DOMAIN = "sophia.com";
const RENDER_BUCKET = "renders";

/** Lien envoyé au posteur dans le message Upwork. */
export const PLATFORM_URL = "https://sophia-content-creation.lovable.app/connexion";

async function conventions(): Promise<ConventionRow> {
  const db = await adminDb();
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

type Ctx = { supabase: { rpc: (fn: never, args: never) => Promise<{ data: unknown }> }; userId: string };

async function adminDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Garde-fou : la fonction s'arrête si l'appelant n'est pas administrateur. */
async function requireAdmin(context: unknown) {
  const ctx = context as { supabase: any; userId: string };
  const { data } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (data !== true) throw new Error("Accès réservé à l'administrateur.");
  return ctx.userId;
}

async function audit(
  actorId: string,
  action: string,
  targetTable: string,
  targetId: string | null,
  payload: Record<string, unknown> = {},
) {
  const db = await adminDb();
  await db.from("audit_log").insert({
    actor_id: actorId,
    action,
    target_table: targetTable,
    target_id: targetId,
    payload: payload as never,
  });
}

/* ------------------------------------------------------- identifiants */

function slugName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

/**
 * Marie Dupont → maried@sophia.com (puis maried2@… en cas de collision).
 * Le nom de famille est facultatif : Lucia sans nom → lucia@sophia.com.
 */
export function buildLogin(firstName: string, lastName?: string) {
  const first = slugName(firstName);
  const initial = slugName(lastName ?? "").slice(0, 1);
  const base = `${first}${initial}` || "posteur";
  return `${base}@${LOGIN_DOMAIN}`;
}

export const suggestLogin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ firstName: z.string().max(80), lastName: z.string().max(80).optional() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    return { login: await freeLogin(data.firstName, data.lastName) };
  });

async function freeLogin(firstName: string, lastName?: string) {
  const db = await adminDb();
  const base = buildLogin(firstName, lastName);
  const [local] = base.split("@");
  const { data } = await db.from("profiles").select("email").ilike("email", `${local}%@${LOGIN_DOMAIN}`);
  const taken = new Set(((data ?? []) as { email: string }[]).map((r) => r.email.toLowerCase()));
  if (!taken.has(base)) return base;
  for (let i = 2; i < 200; i++) {
    const candidate = `${local}${i}@${LOGIN_DOMAIN}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${local}${Date.now()}@${LOGIN_DOMAIN}`;
}

/* ------------------------------------------- premier administrateur */

/** Vrai tant qu'aucun compte n'existe : la plateforme attend son administrateur. */
export const platformNeedsAdmin = createServerFn({ method: "GET" }).handler(async () => {
  const db = await adminDb();
  const { count } = await db.from("profiles").select("id", { count: "exact", head: true });
  return { needsAdmin: (count ?? 0) === 0 };
});

/**
 * Création du tout premier compte administrateur. Se referme d'elle-même :
 * dès qu'un profil existe, cette fonction refuse toute nouvelle création.
 */
export const bootstrapAdmin = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        email: z.string().email().max(160),
        password: z.string().min(8).max(72),
        fullName: z.string().min(2).max(120),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const db = await adminDb();
    const { count } = await db.from("profiles").select("id", { count: "exact", head: true });
    if ((count ?? 0) > 0) throw new Error("La plateforme a déjà un administrateur.");

    const created = await db.auth.admin.createUser({
      email: data.email.trim().toLowerCase(),
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName.trim() },
    });
    if (created.error || !created.data.user) {
      throw new Error(created.error?.message ?? "Création impossible");
    }
    const id = created.data.user.id;
    const { error } = await db.from("profiles").upsert({
      id,
      email: data.email.trim().toLowerCase(),
      full_name: data.fullName.trim(),
      role: "admin",
      status: "active",
    });
    if (error) throw new Error(error.message);
    await audit(id, "admin.bootstrap", "profiles", id, {});
    return { ok: true };
  });


/* ------------------------------------------------------------ posteurs */

export type AdminPoster = {
  id: string;
  email: string;
  full_name: string;
  country: string | null;
  language: string;
  status: string;
  role: string;
  gmail_address: string | null;
  created_at: string;
  accounts: number;
  has_contract: boolean;
  last_sign_in_at: string | null;
  last_download_at: string | null;
  last_post_at: string | null;
};

export const listPosters = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const db = await adminDb();

    const [{ data: profiles }, { data: accounts }, { data: contracts }, { data: downloads }] =
      await Promise.all([
        db.from("profiles").select("*").order("created_at", { ascending: false }),
        db.from("poster_accounts").select("poster_id"),
        db.from("contracts").select("poster_id"),
        db.from("video_downloads").select("poster_id, downloaded_at, posted_at"),
      ]);

    const signIn = new Map<string, string | null>();
    try {
      const users = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
      for (const u of users.data?.users ?? []) signIn.set(u.id, u.last_sign_in_at ?? null);
    } catch {
      /* la liste des connexions est un confort, pas un bloquant */
    }

    const accountCount = new Map<string, number>();
    for (const a of (accounts ?? []) as { poster_id: string }[]) {
      accountCount.set(a.poster_id, (accountCount.get(a.poster_id) ?? 0) + 1);
    }
    const signed = new Set(((contracts ?? []) as { poster_id: string }[]).map((c) => c.poster_id));
    const lastDownload = new Map<string, string>();
    const lastPost = new Map<string, string>();
    for (const d of (downloads ?? []) as {
      poster_id: string;
      downloaded_at: string;
      posted_at: string | null;
    }[]) {
      const prevD = lastDownload.get(d.poster_id);
      if (!prevD || d.downloaded_at > prevD) lastDownload.set(d.poster_id, d.downloaded_at);
      if (d.posted_at) {
        const prevP = lastPost.get(d.poster_id);
        if (!prevP || d.posted_at > prevP) lastPost.set(d.poster_id, d.posted_at);
      }
    }

    const posters: AdminPoster[] = ((profiles ?? []) as unknown as AdminPoster[]).map((p) => {
      const row = p;
      return {
        ...row,
        accounts: accountCount.get(row.id) ?? 0,
        has_contract: signed.has(row.id),
        last_sign_in_at: signIn.get(row.id) ?? null,
        last_download_at: lastDownload.get(row.id) ?? null,
        last_post_at: lastPost.get(row.id) ?? null,
      };
    });

    return { posters };
  });

/**
 * Création d'un accès posteur.
 *
 * Le mot de passe de la plateforme est GÉNÉRÉ, différent pour chaque posteur :
 * l'espace posteur affiche désormais le mot de passe des comptes sociaux, un
 * mot de passe commun devinable ouvrirait ces comptes à n'importe qui.
 * Un compte Instagram est créé du même coup, avec sa langue et son code pays.
 */
export const createPoster = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        firstName: z.string().min(1).max(80),
        lastName: z.string().max(80).optional().default(""),
        countryCode: z.string().max(4).optional(),
        language: z.enum(["fr", "en", "es", "de", "it"]).default("fr"),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const actor = await requireAdmin(context);
    const db = await adminDb();
    const email = await freeLogin(data.firstName, data.lastName);
    const fullName = `${data.firstName.trim()} ${(data.lastName ?? "").trim()}`.trim();
    const country = normalizeCountry(data.countryCode || defaultCountryFor(data.language));
    const conv = await conventions();
    const password = platformPassword(conv);

    const created = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (created.error || !created.data.user) {
      throw new Error(created.error?.message ?? "Création du compte impossible");
    }
    const id = created.data.user.id;

    const { error } = await db.from("profiles").upsert({
      id,
      email,
      full_name: fullName,
      country: country.toUpperCase(),
      language: data.language,
      role: "poster",
      status: "active",
    });
    if (error) {
      await db.auth.admin.deleteUser(id);
      throw new Error(error.message);
    }

    const handle = conventionHandle(conv, country);
    const gmail = conventionGmail(conv, country);
    await db.from("poster_accounts").insert({
      poster_id: id,
      platform: "instagram",
      language: data.language,
      country_code: country,
      handle,
      gmail_address: gmail,
      status: "pending",
    });

    const values = {
      prenom: data.firstName.trim(),
      lien: PLATFORM_URL,
      identifiant: email,
      motdepasse: password,
    };

    await audit(actor, "poster.created", "profiles", id, {
      email,
      language: data.language,
      country,
    });
    return {
      id,
      email,
      password,
      handle,
      gmail,
      country,
      messageFr: fillUpworkMessage(conv.upwork_message_fr, values),
      messageEn: fillUpworkMessage(conv.upwork_message_en, values),
    };
  });

/** Régénère le mot de passe de la plateforme (jamais celui des comptes sociaux). */
export const resetPosterPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const actor = await requireAdmin(context);
    const db = await adminDb();
    const conv = await conventions();
    const password = platformPassword(conv);
    const res = await db.auth.admin.updateUserById(data.id, { password });
    if (res.error) throw new Error(res.error.message);
    await audit(actor, "poster.password_reset", "profiles", data.id);

    const profile = await db.from("profiles").select("email, full_name").eq("id", data.id).maybeSingle();
    const values = {
      prenom: (profile.data?.full_name ?? "").split(" ")[0] ?? "",
      lien: PLATFORM_URL,
      identifiant: profile.data?.email ?? "",
      motdepasse: password,
    };
    return {
      password,
      messageFr: fillUpworkMessage(conv.upwork_message_fr, values),
      messageEn: fillUpworkMessage(conv.upwork_message_en, values),
    };
  });

export const setPosterStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ id: z.string().uuid(), status: z.enum(["active", "suspended", "invited"]) })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const actor = await requireAdmin(context);
    const db = await adminDb();
    const { error } = await db.from("profiles").update({ status: data.status }).eq("id", data.id);
    if (error) throw new Error(error.message);
    // Suspendre coupe réellement l'accès : le compte est banni côté connexion.
    await db.auth.admin.updateUserById(data.id, {
      ban_duration: data.status === "suspended" ? "876000h" : "none",
    } as never);
    await audit(actor, "poster.status_changed", "profiles", data.id, { status: data.status });
    return { ok: true };
  });

export const deletePoster = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const actor = await requireAdmin(context);
    if (actor === data.id) throw new Error("Tu ne peux pas supprimer ton propre compte.");
    const db = await adminDb();
    await db.from("video_downloads").delete().eq("poster_id", data.id);
    await db.from("contracts").delete().eq("poster_id", data.id);
    await db.from("poster_accounts").delete().eq("poster_id", data.id);
    await db.from("profiles").delete().eq("id", data.id);
    const res = await db.auth.admin.deleteUser(data.id);
    if (res.error) throw new Error(res.error.message);
    await audit(actor, "poster.deleted", "profiles", data.id);
    return { ok: true };
  });

export const getPosterDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const db = await adminDb();
    const [profile, accounts, contract, downloads] = await Promise.all([
      db.from("profiles").select("*").eq("id", data.id).maybeSingle(),
      db.from("poster_accounts").select("*").eq("poster_id", data.id).order("created_at"),
      db
        .from("contracts")
        .select("*")
        .eq("poster_id", data.id)
        .order("signed_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      db
        .from("video_downloads")
        .select("id, daily_video_id, downloaded_at, posted_url, posted_at")
        .eq("poster_id", data.id)
        .order("downloaded_at", { ascending: false })
        .limit(60),
    ]);
    return {
      profile: profile.data,
      accounts: accounts.data ?? [],
      contract: contract.data,
      downloads: downloads.data ?? [],
    };
  });

/* -------------------------------------------------------------- comptes */

export const listAllAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const db = await adminDb();
    const [{ data: accounts }, { data: profiles }] = await Promise.all([
      db.from("poster_accounts").select("*").order("created_at", { ascending: false }),
      db.from("profiles").select("id, full_name, email, country, language"),
    ]);
    type PosterRef = {
      id: string;
      full_name: string;
      email: string;
      country: string | null;
      language: string;
    };
    const byId = new Map(((profiles ?? []) as PosterRef[]).map((p) => [p.id, p]));
    type AccountRow = {
      id: string;
      poster_id: string;
      platform: string;
      language: string;
      country_code: string;
      handle: string;
      gmail_address: string | null;
      status: string;
      followers: number;
      profile_url: string | null;
      notes: string | null;
      created_at: string;
      gmail_done_at: string | null;
      handle_done_at: string | null;
      photo_done_at: string | null;
      warmup_started_at: string | null;
      warmup_done_at: string | null;
    };
    const conv = await conventions();
    return {
      conventions: conv,
      accounts: ((accounts ?? []) as AccountRow[]).map((a) => ({
        ...a,
        expected_handle: conventionHandle(conv, a.country_code),
        expected_gmail: conventionGmail(conv, a.country_code),
        poster: byId.get(a.poster_id) ?? null,
      })),
    };
  });

/** Ajoute un compte à un posteur existant (autre langue, autre plateforme). */
export const createAccountForPoster = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        posterId: z.string().uuid(),
        platform: z.enum(["instagram", "tiktok", "youtube"]).default("instagram"),
        language: z.enum(["fr", "en", "es", "de", "it"]),
        countryCode: z.string().max(4).optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const actor = await requireAdmin(context);
    const db = await adminDb();
    const country = normalizeCountry(data.countryCode || defaultCountryFor(data.language));
    const conv = await conventions();
    const { error } = await db.from("poster_accounts").insert({
      poster_id: data.posterId,
      platform: data.platform,
      language: data.language,
      country_code: country,
      handle: conventionHandle(conv, country),
      gmail_address: conventionGmail(conv, country),
      status: "pending",
    });
    if (error) throw new Error(error.message);
    await audit(actor, "account.created", "poster_accounts", data.posterId, {
      language: data.language,
      country,
    });
    return { ok: true };
  });

/** Remet une étape du parcours à zéro (le posteur devra la refaire). */
export const resetAccountStep = createServerFn({ method: "POST" })
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
    const actor = await requireAdmin(context);
    const db = await adminDb();
    const patch: Record<string, unknown> = {};
    if (data.step === "gmail") {
      Object.assign(patch, {
        gmail_done_at: null,
        handle_done_at: null,
        photo_done_at: null,
        warmup_started_at: null,
        warmup_done_at: null,
      });
    }
    if (data.step === "handle") {
      Object.assign(patch, {
        handle_done_at: null,
        photo_done_at: null,
        warmup_started_at: null,
        warmup_done_at: null,
      });
    }
    if (data.step === "photo") {
      Object.assign(patch, { photo_done_at: null, warmup_started_at: null, warmup_done_at: null });
    }
    if (data.step === "warmup") Object.assign(patch, { warmup_done_at: null });
    const { error } = await db.from("poster_accounts").update(patch as never).eq("id", data.accountId);
    if (error) throw new Error(error.message);
    await audit(actor, `onboarding.reset_${data.step}`, "poster_accounts", data.accountId);
    return { ok: true };
  });

/* --------------------------------------------------------- conventions */

export const getConventions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    return { conventions: await conventions() };
  });

export const updateConventions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        instagramTemplate: z.string().min(3).max(200).optional(),
        gmailTemplate: z.string().min(3).max(200).optional(),
        socialPassword: z.string().min(6).max(120).optional(),
        platformPassword: z.string().min(6).max(120).optional(),
        bioText: z.string().max(400).optional(),
        upworkMessageFr: z.string().max(4000).optional(),
        upworkMessageEn: z.string().max(4000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const actor = await requireAdmin(context);
    const db = await adminDb();
    const patch: Record<string, unknown> = {};
    if (data.instagramTemplate !== undefined) patch["instagram_template"] = data.instagramTemplate.trim();
    if (data.gmailTemplate !== undefined) patch["gmail_template"] = data.gmailTemplate.trim();
    if (data.socialPassword !== undefined) patch["social_password"] = data.socialPassword;
    if (data.platformPassword !== undefined) patch["platform_password"] = data.platformPassword;
    if (data.bioText !== undefined) patch["bio_text"] = data.bioText;
    if (data.upworkMessageFr !== undefined) patch["upwork_message_fr"] = data.upworkMessageFr;
    if (data.upworkMessageEn !== undefined) patch["upwork_message_en"] = data.upworkMessageEn;
    const { error } = await db
      .from("account_conventions")
      .upsert({ id: 1, ...patch } as never, { onConflict: "id" });
    if (error) throw new Error(error.message);
    await audit(actor, "conventions.updated", "account_conventions", "1", patch);
    return { ok: true };
  });

export const updateAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["pending", "active", "suspended", "recovered"]).optional(),
        followers: z.number().int().min(0).max(100_000_000).optional(),
        handle: z.string().min(1).max(80).optional(),
        gmail: z.string().max(160).optional(),
        language: z.enum(["fr", "en", "es", "de", "it"]).optional(),
        countryCode: z.string().max(4).optional(),
        profileUrl: z.string().max(300).optional(),
        notes: z.string().max(2000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const actor = await requireAdmin(context);
    const db = await adminDb();
    const patch: Record<string, unknown> = {};
    if (data.status !== undefined) patch["status"] = data.status;
    if (data.followers !== undefined) patch["followers"] = data.followers;
    if (data.handle !== undefined) patch["handle"] = data.handle.trim().replace(/^@/, "");
    if (data.gmail !== undefined) patch["gmail_address"] = data.gmail.trim().toLowerCase() || null;
    if (data.language !== undefined) patch["language"] = data.language;
    if (data.countryCode !== undefined) patch["country_code"] = normalizeCountry(data.countryCode);
    if (data.profileUrl !== undefined) patch["profile_url"] = data.profileUrl.trim() || null;
    if (data.notes !== undefined) patch["notes"] = data.notes.trim() || null;
    const { error } = await db.from("poster_accounts").update(patch as never).eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(actor, "account.updated", "poster_accounts", data.id, patch);
    return { ok: true };
  });

/* --------------------------------------------------------- vue d'ensemble */

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

export const getOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const db = await adminDb();
    const today = isoDay(new Date());
    const since30 = new Date();
    since30.setDate(since30.getDate() - 29);

    const [{ data: profiles }, { data: accounts }, { data: videos }, { data: downloads }, { data: contracts }] =
      await Promise.all([
        db.from("profiles").select("id, role, status, language, full_name, email"),
        db.from("poster_accounts").select("id, platform, status, language, warmup_done_at"),
        db.from("daily_videos").select("id, publish_date, language, status"),
        db
          .from("video_downloads")
          .select("poster_id, account_id, daily_video_id, downloaded_at, posted_at")
          .gte("downloaded_at", `${isoDay(since30)}T00:00:00Z`),
        db.from("contracts").select("poster_id"),
      ]);

    const posters = ((profiles ?? []) as { id: string; role: string; status: string }[]).filter(
      (p) => p.role === "poster",
    );
    const activePosters = posters.filter((p) => p.status === "active");

    const accountRows = (accounts ?? []) as {
      id: string;
      platform: string;
      status: string;
      language: string;
      warmup_done_at: string | null;
    }[];
    const byPlatform: Record<string, number> = {};
    for (const a of accountRows) {
      byPlatform[a.platform] = (byPlatform[a.platform] ?? 0) + 1;
    }

    const todayVideos = ((videos ?? []) as { publish_date: string; language: string; status: string }[])
      .filter((v) => v.publish_date === today);

    const todayIds = new Set(
      ((videos ?? []) as { id: string; publish_date: string }[])
        .filter((v) => v.publish_date === today)
        .map((v) => v.id),
    );
    const dl = (downloads ?? []) as {
      poster_id: string;
      account_id: string | null;
      daily_video_id: string;
      downloaded_at: string;
      posted_at: string | null;
    }[];
    // La mesure se fait au niveau du COMPTE : c'est lui qui publie.
    const todayLanguages = new Set(todayVideos.map((v) => v.language));
    const expectedAccounts = accountRows.filter(
      (a) => a.warmup_done_at && todayLanguages.has(a.language),
    ).length;
    const downloadedToday = new Set(
      dl.filter((d) => todayIds.has(d.daily_video_id) && d.account_id).map((d) => d.account_id!),
    );
    const postedToday = new Set(
      dl
        .filter((d) => todayIds.has(d.daily_video_id) && d.posted_at && d.account_id)
        .map((d) => d.account_id!),
    );

    // Publications par jour sur 30 jours.
    const series: { day: string; count: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = isoDay(d);
      series.push({
        day: key,
        count: dl.filter((x) => x.posted_at && x.posted_at.slice(0, 10) === key).length,
      });
    }

    // Posteurs silencieux depuis 3 jours ou plus.
    const lastPost = new Map<string, string>();
    for (const d of dl) {
      if (!d.posted_at) continue;
      const prev = lastPost.get(d.poster_id);
      if (!prev || d.posted_at > prev) lastPost.set(d.poster_id, d.posted_at);
    }
    const limit = Date.now() - 3 * 86400_000;
    const nameById = new Map(
      ((profiles ?? []) as { id: string; full_name: string; email: string }[]).map((p) => [
        p.id,
        { name: p.full_name || p.email, email: p.email },
      ]),
    );
    const silent = activePosters
      .map((p) => ({
        id: p.id,
        name: nameById.get(p.id)?.name ?? "",
        email: nameById.get(p.id)?.email ?? "",
        last: lastPost.get(p.id) ?? null,
      }))
      .filter((p) => !p.last || new Date(p.last).getTime() < limit)
      .sort((a, b) => (a.last ?? "").localeCompare(b.last ?? ""));

    const signed = new Set(((contracts ?? []) as { poster_id: string }[]).map((c) => c.poster_id));

    return {
      today,
      activePosters: activePosters.length,
      totalPosters: posters.length,
      byPlatform,
      videosToday: todayVideos.length,
      videosTodayByLanguage: todayVideos.map((v) => ({ language: v.language, status: v.status })),
      downloadRate: { done: downloadedToday.size, total: expectedAccounts },
      postRate: { done: postedToday.size, total: expectedAccounts },
      contracts: { signed: signed.size, expected: posters.length },
      series,
      silent,
    };
  });

/* ------------------------------------------------------------ diffusion */

export const getDistribution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ date: z.string().length(10).optional() }).parse(d ?? {}),
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const db = await adminDb();
    const date = data.date ?? isoDay(new Date());

    const [{ data: settings }, { data: videos }, { data: jobs }, { data: languages }] =
      await Promise.all([
        db.from("distribution_settings").select("*").eq("id", 1).maybeSingle(),
        db.from("daily_videos").select("*").eq("publish_date", date),
        db
          .from("render_jobs")
          .select("id, language, topic, status, video_path, duration_sec, created_at")
          .eq("status", "done")
          .order("created_at", { ascending: false })
          .limit(80),
        db.from("language_settings").select("*").order("language"),
      ]);

    return {
      date,
      settings: settings ?? null,
      videos: videos ?? [],
      renders: jobs ?? [],
      languages: languages ?? [],
    };
  });

export const updateDistributionSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        autoEnabled: z.boolean().optional(),
        autoPublish: z.boolean().optional(),
        runHour: z.number().int().min(0).max(23).optional(),
        languages: z.array(z.string().min(2).max(5)).max(10).optional(),
        onFailure: z.enum(["replay", "skip"]).optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const actor = await requireAdmin(context);
    const db = await adminDb();
    const patch: Record<string, unknown> = {};
    if (data.autoEnabled !== undefined) patch["auto_enabled"] = data.autoEnabled;
    if (data.runHour !== undefined) patch["run_hour"] = data.runHour;
    if (data.languages !== undefined) patch["languages"] = data.languages;
    if (data.onFailure !== undefined) patch["on_failure"] = data.onFailure;
    const { error } = await db.from("distribution_settings").update(patch as never).eq("id", 1);
    if (error) throw new Error(error.message);
    await audit(actor, "distribution.settings_updated", "distribution_settings", "1", patch);
    return { ok: true };
  });

export const updateDailyVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        title: z.string().max(200).optional(),
        caption: z.string().max(3000).optional(),
        hashtags: z.array(z.string().max(60)).max(40).optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const actor = await requireAdmin(context);
    const db = await adminDb();
    const patch: Record<string, unknown> = {};
    if (data.title !== undefined) patch["title"] = data.title;
    if (data.caption !== undefined) patch["caption"] = data.caption;
    if (data.hashtags !== undefined) {
      patch["hashtags"] = data.hashtags.map((h) => h.trim().replace(/^#/, "")).filter(Boolean);
    }
    const { error } = await db.from("daily_videos").update(patch as never).eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(actor, "daily_video.updated", "daily_videos", data.id, patch);
    return { ok: true };
  });

export const setDailyVideoStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ id: z.string().uuid(), status: z.enum(["draft", "published", "archived"]) })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const actor = await requireAdmin(context);
    const db = await adminDb();
    const { error } = await db.from("daily_videos").update({ status: data.status }).eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(
      actor,
      data.status === "published" ? "daily_video.published" : "daily_video.unpublished",
      "daily_videos",
      data.id,
      { status: data.status },
    );
    return { ok: true };
  });

/** Assigne (ou remplace) la vidéo d'une langue pour une date, à partir d'un rendu. */
export const assignDailyVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        date: z.string().length(10),
        language: z.string().min(2).max(5),
        jobId: z.string().uuid(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const actor = await requireAdmin(context);
    const db = await adminDb();
    const job = await db
      .from("render_jobs")
      .select("id, topic, video_path, duration_sec, language")
      .eq("id", data.jobId)
      .maybeSingle();
    if (job.error) throw new Error(job.error.message);
    if (!job.data?.video_path) throw new Error("Ce rendu n'a pas de fichier vidéo.");

    const { error } = await db.from("daily_videos").upsert(
      {
        publish_date: data.date,
        language: data.language,
        render_id: job.data.id,
        storage_path: job.data.video_path,
        title: job.data.topic ?? "",
        duration_sec: job.data.duration_sec ?? 0,
        status: "draft",
      },
      { onConflict: "publish_date,language" },
    );
    if (error) throw new Error(error.message);
    await audit(actor, "daily_video.assigned", "daily_videos", data.jobId, {
      date: data.date,
      language: data.language,
    });
    return { ok: true };
  });

/** Lien signé d'aperçu pour l'administrateur (1 heure). */
export const getAdminVideoLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ path: z.string().min(3).max(400) }).parse(d))
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const db = await adminDb();
    const signed = await db.storage.from(RENDER_BUCKET).createSignedUrl(data.path, 3600);
    if (signed.error) throw new Error(signed.error.message);
    return { url: signed.data.signedUrl };
  });

/** Estimation AVANT dépense : quantités et coût indicatif d'une production. */
export const estimateProduction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        languages: z.array(z.string().min(2).max(5)).min(1).max(6),
        durationSec: z.number().int().min(60).max(90).default(62),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const scenes = Math.max(8, Math.round(data.durationSec / 7));
    // Vérité du pipeline maître : un seul jeu d'images et de clips pour toute
    // la production ; seule la voix off est refaite langue par langue.
    return {
      videos: data.languages.length,
      scenes,
      clipSeconds: scenes * 7,
      images: scenes,
      voiceLanguages: data.languages.length,
      voiceTakes: scenes * data.languages.length,
      note: "Un seul jeu d'images et de clips, partagé par toutes les langues : les langues supplémentaires ne coûtent que la voix off et le montage.",
    };
  });

/** Lance une production immédiate : UN maître, les autres langues en dérivent. */
export const produceNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        languages: z.array(z.string().min(2).max(5)).min(1).max(6),
        durationSec: z.number().int().min(60).max(90).default(62),
        publishDate: z.string().length(10).optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const actor = await requireAdmin(context);
    const db = await adminDb();

    const topicRow = await db
      .from("topic_queue")
      .select("*")
      .eq("status", "valide")
      .order("position", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (topicRow.error) throw new Error(topicRow.error.message);
    if (!topicRow.data) throw new Error("Aucun sujet validé dans la file : valide un sujet d'abord.");

    const { data: langRows } = await db.from("language_settings").select("*");
    const settings = new Map(
      ((langRows ?? []) as Record<string, unknown>[]).map((r) => [String(r["language"]), r]),
    );

    // Langue source : le français s'il est demandé, sinon la première.
    const langs = data.languages.filter((l, i, a) => a.indexOf(l) === i);
    const source = langs.includes("fr") ? "fr" : langs[0]!;
    const s = settings.get(source);

    const { data: job, error } = await db
      .from("render_jobs")
      .insert({
        language: source,
        languages: langs,
        master_id: null,
        publish_date: data.publishDate ?? null,
        narration_style: String(s?.["narration_style"] ?? topicRow.data.narration_style),
        visual_style: String(s?.["visual_style"] ?? "papercraft"),
        topic_category: topicRow.data.category,
        topic: topicRow.data.topic,
        duration_sec: data.durationSec,
        voice_id: (s?.["eleven_voice_id"] as string | null) ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const created = [(job as { id: string }).id];

    await db
      .from("topic_queue")
      .update({
        status: "utilise",
        used_at: new Date().toISOString(),
        video_job_id: created[0] ?? null,
      })
      .eq("id", topicRow.data.id);

    await db
      .from("distribution_settings")
      .update({
        last_run_at: new Date().toISOString(),
        last_run_result: `Lancement manuel : 1 production, ${langs.length} langue(s)`,
      })
      .eq("id", 1);

    await audit(actor, "distribution.produce_now", "render_jobs", created[0] ?? null, {
      languages: langs,
      topic: topicRow.data.topic,
    });
    return { jobIds: created, topic: topicRow.data.topic as string };
  });

/** Travaux en échec, pour relance manuelle depuis l'administration. */
export const listFailedJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const db = await adminDb();
    const { data, error } = await db
      .from("render_jobs")
      .select("id, language, topic, status, step, error, master_id, updated_at")
      .eq("status", "failed")
      .order("updated_at", { ascending: false })
      .limit(40);
    if (error) throw new Error(error.message);
    return (data ?? []) as {
      id: string;
      language: string;
      topic: string | null;
      status: string;
      step: string;
      error: string | null;
      master_id: string | null;
      updated_at: string;
    }[];
  });

/**
 * Relance un travail en échec À L'ÉTAPE ÉCHOUÉE : rien de déjà produit n'est
 * repayé (les gardes du pipeline sautent image, voix et clip existants).
 */
export const retryJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const actor = await requireAdmin(context);
    const db = await adminDb();
    const { data: row, error } = await db
      .from("render_jobs")
      .select("id, status, scenes, script, topic")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Travail introuvable.");

    const scenes = (Array.isArray(row.scenes) ? row.scenes : []) as {
      imagePath?: string;
      audioPath?: string;
      clipPath?: string;
      clipFailed?: boolean;
      narration?: string;
    }[];

    let status = "queued";
    if (!row.topic) status = "queued";
    else if (!scenes.length) status = "scripting";
    else if (scenes.some((s) => !s.imagePath)) status = "images";
    else if (scenes.some((s) => (s.narration ?? "").trim() && !s.audioPath)) status = "voice";
    else if (scenes.some((s) => !s.clipPath && !s.clipFailed)) status = "clips";
    else status = "rendering";

    const { error: upErr } = await db
      .from("render_jobs")
      .update({
        status,
        step: status,
        error: null,
        lease_until: null,
        // Relance manuelle : le compteur d'envois au service de rendu repart à zéro.
        rendering_sent_at: null,
        rendering_sends: 0,
      })
      .eq("id", data.id);
    if (upErr) throw new Error(upErr.message);

    await audit(actor, "render_job.retried", "render_jobs", data.id, { status });
    return { ok: true, status };
  });

/* --------------------------------------------------- réglages de contenu */

export const listLanguageSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const db = await adminDb();
    const { data, error } = await db.from("language_settings").select("*").order("language");
    if (error) throw new Error(error.message);
    return { languages: data ?? [] };
  });

export const updateLanguageSetting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        language: z.string().min(2).max(5),
        enabled: z.boolean().optional(),
        elevenVoiceId: z.string().max(60).optional(),
        voiceSpeed: z.number().min(0.95).max(1.15).optional(),
        narrationStyle: z.string().max(40).optional(),
        visualStyle: z.string().max(40).optional(),
        musicStyle: z.string().max(40).optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const actor = await requireAdmin(context);
    const db = await adminDb();
    const patch: Record<string, unknown> = {};
    if (data.enabled !== undefined) patch["enabled"] = data.enabled;
    if (data.elevenVoiceId !== undefined) patch["eleven_voice_id"] = data.elevenVoiceId.trim() || null;
    if (data.voiceSpeed !== undefined) patch["voice_speed"] = data.voiceSpeed;
    if (data.narrationStyle !== undefined) patch["narration_style"] = data.narrationStyle;
    if (data.visualStyle !== undefined) patch["visual_style"] = data.visualStyle;
    if (data.musicStyle !== undefined) patch["music_style"] = data.musicStyle;
    const { error } = await db
      .from("language_settings")
      .upsert({ language: data.language, ...patch } as never, { onConflict: "language" });
    if (error) throw new Error(error.message);
    await audit(actor, "language_settings.updated", "language_settings", data.language, patch);
    return { ok: true };
  });

/* ------------------------------------------------------------- contrat */

export const listContractTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const db = await adminDb();
    const { data, error } = await db
      .from("contract_templates")
      .select("*")
      .order("version", { ascending: false });
    if (error) throw new Error(error.message);
    return { templates: data ?? [] };
  });

/** Nouvelle version : les signatures déjà enregistrées ne bougent jamais. */
export const createContractVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ title: z.string().min(3).max(200), body: z.string().min(50).max(60000) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const actor = await requireAdmin(context);
    const db = await adminDb();
    const last = await db
      .from("contract_templates")
      .select("version")
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const version = ((last.data?.version as number | undefined) ?? 0) + 1;
    await db.from("contract_templates").update({ is_active: false }).eq("is_active", true);
    const { error } = await db
      .from("contract_templates")
      .insert({ version, title: data.title.trim(), body: data.body, is_active: true });
    if (error) throw new Error(error.message);
    await audit(actor, "contract_template.created", "contract_templates", String(version), {
      version,
    });
    return { version };
  });

/* -------------------------------------------------------------- journal */

export const listAuditLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        action: z.string().max(80).optional(),
        table: z.string().max(80).optional(),
        limit: z.number().int().min(10).max(500).default(200),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const db = await adminDb();
    let query = db.from("audit_log").select("*").order("created_at", { ascending: false });
    if (data.action) query = query.ilike("action", `%${data.action}%`);
    if (data.table) query = query.eq("target_table", data.table);
    const { data: rows, error } = await query.limit(data.limit);
    if (error) throw new Error(error.message);

    const { data: profiles } = await db.from("profiles").select("id, full_name, email");
    const byId = new Map(
      ((profiles ?? []) as { id: string; full_name: string; email: string }[]).map((p) => [
        p.id,
        p.full_name || p.email,
      ]),
    );
    type AuditRow = {
      id: number;
      actor_id: string | null;
      action: string;
      target_table: string | null;
      target_id: string | null;
      payload: unknown;
      created_at: string;
    };
    return {
      entries: ((rows ?? []) as AuditRow[]).map((r) => ({
        id: r.id,
        action: r.action,
        target_table: r.target_table,
        target_id: r.target_id,
        payload: JSON.stringify(r.payload ?? {}),
        created_at: r.created_at,
        actor: byId.get(String(r.actor_id)) ?? "système",
      })),
    };
  });

export type { Ctx };
