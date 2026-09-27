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

/**
 * BANC D'ESSAI : UNIQUEMENT l'étape d'écriture (même appel que l'étape 1 de
 * `runSlideshowTick`). N'écrit rien en base, ne génère aucune image.
 */
export const previewSlideshowWriting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        topic: z.string().min(3).max(500),
        format: z.string().default("quiz"),
        slideCount: z.number().int().min(3).max(20).default(11),
        language: z.enum(MASTER_LANGUAGE_IDS).default("fr"),
        brief: z.string().max(20000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const { chatJSON } = await import("./ai-gateway.server");
    const { slideshowFormatById, slideshowWritingBrief } = await import("./slideshow-formats");
    const { languageName } = await import("./languages");
    const format = slideshowFormatById(data.format);
    if (!format) throw new Error(`Format de slideshow inconnu : ${data.format}`);
    const n =
      data.slideCount >= format.slides.min && data.slideCount <= format.slides.max
        ? data.slideCount
        : format.slides.min;
    const client = await db();
    const { data: row } = await client
      .from("topic_queue")
      .select("angle")
      .eq("topic", data.topic.trim())
      .limit(1)
      .maybeSingle();
    const angle = (row as { angle?: string | null } | null)?.angle ?? null;
    const langLine =
      data.language === "fr" ? "français de France" : languageName(data.language);
    const userPrompt = `Sujet : ${data.topic.trim()}${angle ? `\nAngle : ${angle}` : ""}\nLangue du texte : ${langLine}.`;
    const written = await chatJSON<{
      title: string;
      caption: string;
      hashtags: string[];
      slides: { index: number; kind: string; text: string; imagePrompt: string }[];
    }>(
      "google/gemini-3.7-flash",
      data.brief?.trim() ? data.brief : slideshowWritingBrief(format, n),
      userPrompt,
      1.0,
    );
    return {
      title: String(written.title ?? ""),
      caption: String(written.caption ?? ""),
      hashtags: Array.isArray(written.hashtags) ? written.hashtags.map(String) : [],
      slides: (written.slides ?? []).slice(0, n).map((s, i) => ({
        index: i,
        kind: String(s.kind ?? ""),
        text: String(s.text ?? "").trim(),
        imagePrompt: String(s.imagePrompt ?? "").trim(),
      })),
    };
  });

// ---------- Écran Slideshows : détail, édition, régénération ----------

/** Premier sujet validé au format slideshow (lecture seule, gratuit). */
export const pickSlideshowTopic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const client = await db();
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
    return { topic: (row as any).topic as string, category: ((row as any).category ?? null) as string | null };
  });

/** Langues actives (réglages) pour pré-cocher le formulaire. */
export const listActiveSlideshowLanguages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const client = await db();
    const { data } = await client.from("language_settings").select("language, enabled");
    const ids = ((data ?? []) as { language: string; enabled: boolean }[])
      .filter((r) => r.enabled && (MASTER_LANGUAGE_IDS as readonly string[]).includes(r.language))
      .map((r) => r.language);
    return { languages: ids.length ? ids : [...MASTER_LANGUAGE_IDS] };
  });

export type SlideshowJobDetail = {
  id: string;
  topic: string | null;
  topic_category: string | null;
  format: string;
  languages: string[];
  slide_count: number;
  publish_date: string | null;
  status: string;
  step: string | null;
  progress: number;
  error: string | null;
  attempts: number;
  slides: { index: number; kind: string | null; imagePrompt: string; imagePath: string | null; imageUrl: string | null }[];
  textes: Record<string, { title: string; caption: string; hashtags: string[]; slides: { index: number; text: string }[] }>;
  published: boolean;
};

export const getSlideshowJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }): Promise<SlideshowJobDetail> => {
    await requireAdmin(context);
    const client = await db();
    const { data: j, error } = await client.from("slideshow_jobs").select("*").eq("id", data.id).single();
    if (error || !j) throw new Error("Slideshow introuvable.");
    const job = j as any;
    const rawSlides: any[] = Array.isArray(job.slides) ? job.slides : [];
    const paths = rawSlides.map((s) => s?.imagePath).filter(Boolean) as string[];
    const urls = new Map<string, string>();
    if (paths.length) {
      const { data: signed } = await client.storage.from("renders").createSignedUrls(paths, 60 * 60);
      for (const s of signed ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
    }
    const { count } = await client
      .from("daily_slideshows")
      .select("id", { count: "exact", head: true })
      .eq("slideshow_job_id", data.id);
    return {
      id: job.id,
      topic: job.topic,
      topic_category: job.topic_category,
      format: job.format,
      languages: job.languages ?? [],
      slide_count: job.slide_count,
      publish_date: job.publish_date,
      status: job.status,
      step: job.step,
      progress: Number(job.progress ?? 0),
      error: job.error,
      attempts: job.attempts,
      slides: rawSlides.map((s, i) => ({
        index: Number(s?.index ?? i),
        kind: s?.kind ?? null,
        imagePrompt: String(s?.imagePrompt ?? ""),
        imagePath: s?.imagePath ?? null,
        imageUrl: s?.imagePath ? urls.get(s.imagePath) ?? null : null,
      })),
      textes: (job.textes ?? {}) as SlideshowJobDetail["textes"],
      published: (count ?? 0) > 0,
    };
  });

const patchSchema = z
  .object({
    topic: z.string().max(500).optional(),
    slide_count: z.number().int().min(3).max(20).optional(),
    languages: z.array(z.enum(MASTER_LANGUAGE_IDS)).min(1).optional(),
    imagePrompts: z.array(z.object({ index: z.number().int().min(0), imagePrompt: z.string().max(4000) })).optional(),
    textes: z
      .record(
        z.string(),
        z
          .object({
            title: z.string().max(500).optional(),
            caption: z.string().max(5000).optional(),
            hashtags: z.array(z.string().max(100)).max(40).optional(),
            slides: z.array(z.object({ index: z.number().int().min(0), text: z.string().max(1000) })).optional(),
          })
          .strict(),
      )
      .optional(),
  })
  .strict();

/**
 * Modifie un job slideshow. Champs autorisés UNIQUEMENT : topic, slide_count,
 * languages, slides[i].imagePrompt, textes[langue].slides[i].text,
 * textes[langue].title/caption/hashtags. `propagate` répercute les textes sur
 * daily_slideshows quand le job est déjà publié.
 */
export const updateSlideshowJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ jobId: z.string().uuid(), patch: patchSchema, propagate: z.boolean().default(false) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const client = await db();
    const { data: j, error } = await client.from("slideshow_jobs").select("*").eq("id", data.jobId).single();
    if (error || !j) throw new Error("Slideshow introuvable.");
    const job = j as any;
    const values: Record<string, unknown> = {};
    const p = data.patch;
    if (p.topic !== undefined) values["topic"] = p.topic.trim() || null;
    if (p.slide_count !== undefined) values["slide_count"] = p.slide_count;
    if (p.languages) values["languages"] = Array.from(new Set(["fr", ...p.languages]));
    if (p.imagePrompts?.length) {
      const slides = (Array.isArray(job.slides) ? job.slides : []).map((s: any) => ({ ...s }));
      for (const ip of p.imagePrompts) {
        const s = slides.find((x: any) => Number(x.index) === ip.index);
        if (s) s.imagePrompt = ip.imagePrompt;
      }
      values["slides"] = slides;
    }
    if (p.textes) {
      const textes = JSON.parse(JSON.stringify(job.textes ?? {}));
      for (const [lang, t] of Object.entries(p.textes)) {
        const cur = textes[lang] ?? { title: "", caption: "", hashtags: [], slides: [] };
        if (t.title !== undefined) cur.title = t.title;
        if (t.caption !== undefined) cur.caption = t.caption;
        if (t.hashtags !== undefined) cur.hashtags = t.hashtags;
        for (const st of t.slides ?? []) {
          const s = (cur.slides as any[]).find((x) => Number(x.index) === st.index);
          if (s) s.text = st.text;
          else cur.slides.push({ index: st.index, text: st.text });
        }
        textes[lang] = cur;
      }
      values["textes"] = textes;
    }
    if (!Object.keys(values).length) return { ok: true, propagated: 0 };
    const { error: upErr } = await client.from("slideshow_jobs").update(values).eq("id", data.jobId);
    if (upErr) throw new Error(upErr.message);

    let propagated = 0;
    if (data.propagate && (p.textes || p.imagePrompts)) {
      const { data: rows } = await client.from("daily_slideshows").select("id, language, slides").eq("slideshow_job_id", data.jobId);
      const textes = (values["textes"] ?? job.textes ?? {}) as any;
      for (const r of (rows ?? []) as any[]) {
        const t = textes[r.language];
        if (!t) continue;
        const slides = (Array.isArray(r.slides) ? r.slides : []).map((s: any) => ({
          ...s,
          text: t.slides?.find((x: any) => Number(x.index) === Number(s.index))?.text ?? s.text,
        }));
        const { error: e2 } = await client
          .from("daily_slideshows")
          .update({ title: t.title ?? "", caption: t.caption ?? "", hashtags: t.hashtags ?? [], slides })
          .eq("id", r.id);
        if (!e2) propagated++;
      }
    }
    return { ok: true, propagated };
  });

/** (Ré)génère UNE image de slide. Coût : 1 image. Écrase l'ancienne. */
export const regenerateSlideshowImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ jobId: z.string().uuid(), index: z.number().int().min(0) }).parse(d))
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const { regenerateOneSlideImage } = await import("./jobs/slideshow.server");
    const path = await regenerateOneSlideImage(data.jobId, data.index);
    return { path };
  });
