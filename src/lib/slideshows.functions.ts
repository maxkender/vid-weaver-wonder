/**
 * Chaîne SLIDESHOW — fonctions réservées à l'administrateur.
 * Aucun lien avec la chaîne vidéo : tables et pause (ligne 2) séparées.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { MASTER_LANGUAGE_IDS } from "@/lib/languages";

async function requireAdmin(context: unknown) {
  const ctx = context as { supabase: any; userId: string };
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (data !== true) throw new Error("Accès réservé à l'administrateur.");
}

async function db() {
  const { admin } = await import("./jobs/store.server");
  return await admin();
}

export type SlideshowJobRow = {
  id: string;
  publish_date: string | null;
  topic: string | null;
  format: string;
  languages: string[];
  slide_count: number;
  status: string;
  step: string | null;
  progress: number;
  error: string | null;
  attempts: number;
  created_at: string;
  images_done: number;
};

export const listSlideshowJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const client = await db();
    const { data, error } = await client
      .from("slideshow_jobs")
      .select("id, publish_date, topic, format, languages, slide_count, slides, status, step, progress, error, attempts, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    const { data: ctrl } = await client.from("job_control").select("paused, paused_reason").eq("id", 2).maybeSingle();
    const jobs: SlideshowJobRow[] = (data ?? []).map((j: any) => ({
      ...j,
      slides: undefined,
      progress: Number(j.progress ?? 0),
      images_done: Array.isArray(j.slides) ? j.slides.filter((s: any) => s?.imagePath).length : 0,
    }));
    return {
      jobs,
      paused: Boolean((ctrl as any)?.paused),
      pausedReason: ((ctrl as any)?.paused_reason ?? null) as string | null,
    };
  });

export const createSlideshowJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        topic: z.string().max(500).optional(),
        topicCategory: z.string().max(50).optional(),
        format: z.string().default("quiz"),
        languages: z.array(z.enum(MASTER_LANGUAGE_IDS)).min(1).default([...MASTER_LANGUAGE_IDS]),
        slideCount: z.number().int().min(3).max(20).default(11),
        publishDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const client = await db();
    let topic = (data.topic ?? "").trim();
    let category = data.topicCategory ?? null;
    if (!topic) {
      const { data: row } = await client
        .from("topic_queue")
        .select("topic, category")
        .eq("status", "valide")
        .in("format", ["slideshow", "both"])
        .order("position", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!row) throw new Error("Aucun sujet validé pour le format slideshow.");
      topic = (row as any).topic;
      category = (row as any).category ?? category;
    }
    // Le français est la langue source de l'écriture : toujours présent.
    const languages = Array.from(new Set(["fr", ...data.languages]));
    const { data: inserted, error } = await client
      .from("slideshow_jobs")
      .insert({
        topic,
        topic_category: category,
        format: data.format,
        languages,
        slide_count: data.slideCount,
        publish_date: data.publishDate ?? null,
        status: "queued",
        step: "queued",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (inserted as { id: string }).id };
  });

export const runSlideshowTickNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { runSlideshowTick } = await import("./jobs/slideshow.server");
    return await runSlideshowTick();
  });

export const deleteSlideshowJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const client = await db();
    const { error } = await client.from("slideshow_jobs").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
