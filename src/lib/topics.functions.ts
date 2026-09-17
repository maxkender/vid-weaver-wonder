/**
 * FILE D'ATTENTE DE SUJETS — garde-fou qualité.
 *
 * Le client valide des sujets à l'avance ; rien ne part en production à partir
 * d'un sujet qui n'a pas le statut `valide`.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { TOPIC_CATEGORY_IDS } from "./topic-categories";

export type TopicStatus = "propose" | "valide" | "rejete" | "utilise" | "revoir";

export type QueuedTopic = {
  id: string;
  topic: string;
  angle: string | null;
  narration_style: string;
  category: string;
  status: TopicStatus;
  position: number;
  created_at: string;
  used_at: string | null;
  video_job_id: string | null;
};

const styleEnum = z.enum(["question", "revelation", "storytelling", "listicle", "mecanique"]);

/** Garde-fou : la file de sujets est réservée à l'administrateur. */
async function requireAdmin(context: unknown) {
  const ctx = context as { supabase: any; userId: string };
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (data !== true) throw new Error("Accès réservé à l'administrateur.");
}

async function db() {
  const { admin } = await import("./jobs/store.server");
  return await admin();
}

/** Tous les sujets, triés par statut puis position. */
export const listTopics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
  await requireAdmin(context);
  const client = await db();
  const { data, error } = await client
    .from("topic_queue")
    .select("*")
    .order("position", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return { topics: (data ?? []) as QueuedTopic[] };
});

/** Ajoute un sujet à la main (statut « validé » : c'est un choix humain). */
export const addTopic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        topic: z.string().min(4).max(300),
        angle: z.string().max(500).default(""),
        narrationStyle: styleEnum.default("revelation"),
        category: z.enum(TOPIC_CATEGORY_IDS).default("aleatoire"),
        status: z.enum(["propose", "valide"]).default("valide"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const client = await db();
    const { data: last } = await client
      .from("topic_queue")
      .select("position")
      .order("position", { ascending: false })
      .limit(1);
    const position = ((last?.[0]?.position as number | undefined) ?? 0) + 1;
    const { data: row, error } = await client
      .from("topic_queue")
      .insert({
        topic: data.topic.trim(),
        angle: data.angle.trim() || null,
        narration_style: data.narrationStyle,
        category: data.category,
        status: data.status,
        position,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { topic: row as QueuedTopic };
  });

/** Valider / rejeter un sujet proposé. */
export const setTopicStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["propose", "valide", "rejete", "utilise", "revoir"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const client = await db();
    const patch: Record<string, unknown> = { status: data.status };
    if (data.status === "utilise") patch['used_at'] = new Date().toISOString();
    const { error } = await client.from("topic_queue").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteTopic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const client = await db();
    const { error } = await client.from("topic_queue").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Réordonne un sujet validé : échange sa position avec son voisin. */
export const moveTopic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), direction: z.enum(["up", "down"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const client = await db();
    const { data: rows, error } = await client
      .from("topic_queue")
      .select("id, position")
      .eq("status", "valide")
      .order("position", { ascending: true });
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as { id: string; position: number }[];
    const i = list.findIndex((r) => r.id === data.id);
    const j = data.direction === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= list.length) return { ok: true };
    const a = list[i]!;
    const b = list[j]!;
    await client.from("topic_queue").update({ position: b.position }).eq("id", a.id);
    await client.from("topic_queue").update({ position: a.position }).eq("id", b.id);
    return { ok: true };
  });

/**
 * Prend le premier sujet VALIDÉ de la file (sans le consommer).
 * Le sujet n'est marqué « utilisé » qu'au lancement réel de la vidéo.
 */
export const nextValidatedTopic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
  await requireAdmin(context);
  const client = await db();
  const { data, error } = await client
    .from("topic_queue")
    .select("*")
    .eq("status", "valide")
    .order("position", { ascending: true })
    .limit(1);
  if (error) throw new Error(error.message);
  return { topic: ((data ?? [])[0] as QueuedTopic | undefined) ?? null };
});

/** Marque un sujet comme utilisé et le relie à la vidéo produite. */
export const markTopicUsed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ id: z.string().uuid(), videoJobId: z.string().max(200).default("") })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const client = await db();
    const { error } = await client
      .from("topic_queue")
      .update({
        status: "utilise",
        used_at: new Date().toISOString(),
        video_job_id: data.videoJobId || null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Propose 20 sujets d'un coup (une seule requête texte, aucun média payant).
 * Les sujets déjà en file ou déjà utilisés sont passés en interdits.
 */
export const proposeTopicBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        count: z.number().int().min(5).max(30).default(20),
        narrationStyle: styleEnum.default("revelation"),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { chatJSON } = await import("./ai-gateway.server");
    const { TOPIC_BRIEF, TOPIC_INTRIGUE, TOPIC_VIRAL } = await import("./prompts.server");
    const client = await db();

    const { data: existing } = await client
      .from("topic_queue")
      .select("topic")
      .order("created_at", { ascending: false })
      .limit(200);
    const avoid = ((existing ?? []) as { topic: string }[]).map((r) => r.topic);

    const res = await chatJSON<{
      topics: { topic: string; angle: string; lever: string; category: string }[];
    }>(
      "google/gemini-3.7-flash",
      [
        "Tu proposes des sujets de vidéos courtes de culture générale pour TikTok, en français.",
        TOPIC_BRIEF[data.narrationStyle],
        TOPIC_INTRIGUE,
        TOPIC_VIRAL,
        `Propose exactement ${data.count} sujets DIFFÉRENTS : au moins les deux tiers dans les familles TOI, CEUX QUE TU AIMES, LE VERTIGE et HISTOIRES VRAIES, le reste réparti sur les trois autres familles validées.`,
        "Chaque sujet est formulé comme la première phrase de la vidéo : une seule phrase de 8 à 20 mots, mots du quotidien.",
        "RÈGLE ÉLIMINATOIRE : le spectateur doit avoir DÉJÀ EU LA QUESTION EN TÊTE et croire connaître la réponse. Pour chaque sujet, tu nommes dans « lever » la RÉPONSE COMMUNE que le spectateur a dans la tête et que la vidéo va lui retirer. Si tu ne peux pas la nommer, change de sujet.",
        "Évite les sujets ultra rebattus traités mille fois à l'identique (pyramides, Mozart enfant prodige, Grande Muraille visible de l'espace, Einstein mauvais élève).",
        "CHAQUE sujet doit avoir de quoi DÉROULER 60 secondes : un mécanisme en plusieurs étapes. Avant de retenir un sujet, écris mentalement ses trois étapes de déroulé ; si tu n'en trouves pas trois qui apportent chacune une information nouvelle, remplace-le.",
        'Réponds uniquement en JSON: {"topics": [{"topic": string, "angle": string (la vraie explication en une phrase), "lever": string (la réponse commune fausse ou incomplète que la vidéo retire), "category": "psycho" | "vertige" | "science" | "episodes" | "mythes" | "pop" (psycho pour TOI et CEUX QUE TU AIMES, vertige pour LE VERTIGE, episodes pour les HISTOIRES VRAIES, pop pour la POP CULTURE, mythes pour les MYTHES, science pour le QUOTIDIEN et les DEBUNKS)}]}',

      ].join("\n"),
      avoid.length
        ? `INTERDIT : ne propose ni ces sujets, ni un sujet qui parle du même événement, du même lieu, du même personnage ou de la même œuvre :\n- ${avoid
            .slice(0, 120)
            .join("\n- ")}`
        : `Propose ${data.count} sujets.`,
      1.15,
    );

    const seen = new Set(avoid.map((t) => t.toLowerCase()));
    const fresh = (res.topics ?? [])
      .map((t) => ({
        topic: String(t.topic ?? "").trim(),
        angle: String(t.angle ?? "").trim(),
        lever: String(t.lever ?? "").trim(),
        category: ["psycho", "vertige", "science", "episodes", "mythes", "pop"].includes(t.category)
          ? t.category
          : "aleatoire",
      }))
      .filter((t) => {
        const key = t.topic.toLowerCase();
        if (t.topic.length < 8 || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    if (!fresh.length) return { inserted: 0 };

    const { data: last } = await client
      .from("topic_queue")
      .select("position")
      .order("position", { ascending: false })
      .limit(1);
    let position = ((last?.[0]?.position as number | undefined) ?? 0) + 1;

    const { error } = await client.from("topic_queue").insert(
      fresh.map((t) => ({
        topic: t.topic,
        angle: [t.angle, t.lever ? `Levier : ${t.lever}` : ""].filter(Boolean).join(" — "),
        narration_style: data.narrationStyle,
        category: t.category,
        status: "propose",
        position: position++,
      })),
    );
    if (error) throw new Error(error.message);
    return { inserted: fresh.length };
  });
