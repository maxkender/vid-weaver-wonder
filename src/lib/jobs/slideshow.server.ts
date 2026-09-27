/**
 * CHAÎNE SLIDESHOW — séparée de la chaîne vidéo.
 *
 * Trois étapes : écriture (texte, aucune dépense d'image), images (UNE fois,
 * partagées par toutes les langues), publication (une ligne par langue).
 * Aucune voix, aucun clip animé, aucun service de rendu : le texte est incrusté
 * dans le navigateur au moment de l'export.
 *
 * Pause : ligne 2 de `job_control` uniquement. La ligne 1 (vidéo) n'est jamais
 * lue ni écrite ici.
 */
import { chatJSON, generateImageDataUrl } from "@/lib/ai-gateway.server";
import { languageName } from "@/lib/languages";
import {
  findOverlongSlides,
  MAX_MOTS_PAR_SLIDE,
  slideshowFormatById,
  slideshowWritingBrief,
  type SlideKind,
} from "@/lib/slideshow-formats";

import { normalizeSlideCount, normalizeSlideKind, slideImagePrompt } from "@/lib/slide-kind";

import { admin, uploadDataUrl } from "./store.server";

/** Même budget que la chaîne vidéo : on rend la main avant expiration. */
const TICK_BUDGET_MS = 42_000;
const outOfTime = (t0: number) => Date.now() - t0 > TICK_BUDGET_MS;
const CONTROL_ROW = 2;
const WRITING_MODEL = "google/gemini-3.7-flash";

/** Même détection que la vidéo : blocage crédits/politique. */
function isBlockingError(message: string) {
  return /\b(402|403)\b|credit|credits|payment required|insufficient|forbidden|disabled/i.test(
    message,
  );
}

export const IMAGE_STYLE =
  "Square 1:1 format. Polished editorial photography. One single huge subject, centered. Simple uncluttered background. Soft directional light. Absolutely no text, no letters, no numbers, no logos anywhere. The upper third of the image is intentionally calm and empty to leave room for overlaid text.";

export type SlideshowSlide = {
  index: number;
  kind: SlideKind;
  imagePrompt: string;
  imagePath?: string;
};

export type SlideshowTexte = {
  title: string;
  caption: string;
  hashtags: string[];
  slides: { index: number; text: string }[];
};

export type SlideshowJob = {
  id: string;
  publish_date: string | null;
  topic: string | null;
  topic_category: string | null;
  format: string;
  languages: string[];
  slide_count: number;
  slides: SlideshowSlide[];
  textes: Record<string, SlideshowTexte>;
  status: string;
  step: string | null;
  progress: number;
  error: string | null;
  attempts: number;
  lease_until: string | null;
  created_at: string;
};

async function logEvent(
  jobId: string,
  step: string,
  message: string,
  level: "info" | "warn" | "error" = "info",
) {
  const db = await admin();
  await db
    .from("slideshow_events")
    .insert({ slideshow_job_id: jobId, step, message: message.slice(0, 2000), level });
}

async function patch(jobId: string, values: Record<string, unknown>) {
  const db = await admin();
  const { error } = await db.from("slideshow_jobs").update(values).eq("id", jobId);
  if (error) throw new Error(`Écriture du slideshow impossible : ${error.message}`);
}

export async function isSlideshowPaused(): Promise<boolean> {
  const db = await admin();
  const { data } = await db.from("job_control").select("paused").eq("id", CONTROL_ROW).maybeSingle();
  return Boolean((data as { paused?: boolean } | null)?.paused);
}

async function pauseSlideshows(reason: string) {
  const db = await admin();
  await db
    .from("job_control")
    .update({ paused: true, paused_reason: reason.slice(0, 300), paused_at: new Date().toISOString() })
    .eq("id", CONTROL_ROW);
}

/** Bail + incrément des tentatives, avec écriture conditionnelle anti-course. */
async function claimSlideshowJob(leaseSeconds = 240): Promise<SlideshowJob | null> {
  const db = await admin();
  const nowIso = new Date().toISOString();
  const { data: candidates } = await db
    .from("slideshow_jobs")
    .select("id, attempts, lease_until")
    .not("status", "in", "(done,error,cancelled)")
    .or(`lease_until.is.null,lease_until.lt.${nowIso}`)
    .order("created_at", { ascending: true })
    .limit(3);
  for (const c of (candidates ?? []) as { id: string; attempts: number; lease_until: string | null }[]) {
    let q = db
      .from("slideshow_jobs")
      .update({
        lease_until: new Date(Date.now() + leaseSeconds * 1000).toISOString(),
        attempts: c.attempts + 1,
      })
      .eq("id", c.id)
      .eq("attempts", c.attempts);
    q = c.lease_until ? q.eq("lease_until", c.lease_until) : q.is("lease_until", null);
    const { data } = await q.select("*");
    const row = ((data ?? []) as SlideshowJob[])[0];
    if (row) return row;
  }
  return null;
}

// ---------- Étape 1 : écriture ----------

type WrittenSlide = { index: number; kind: SlideKind; text: string; imagePrompt: string };
type Written = { title: string; caption: string; hashtags: string[]; slides: WrittenSlide[] };

async function topicAngle(topic: string): Promise<string | null> {
  const db = await admin();
  const { data } = await db
    .from("topic_queue")
    .select("angle")
    .eq("topic", topic)
    .limit(1)
    .maybeSingle();
  return (data as { angle?: string | null } | null)?.angle ?? null;
}

async function stepWriting(job: SlideshowJob) {
  const format = slideshowFormatById(job.format);
  if (!format) throw new Error(`Format de slideshow inconnu : ${job.format}`);
  const n = normalizeSlideCount(format, job.slide_count);
  if (n !== job.slide_count) {
    await logEvent(
      job.id,
      "ecriture",
      `Nombre de slides ${job.slide_count} invalide pour « ${format.label} » (bornes ${format.slides.min}-${format.slides.max}${format.id === "quiz" ? ", pair" : ""}) : ramené à ${n}.`,
      "warn",
    );
  }
  const topic = (job.topic ?? "").trim();
  if (!topic) throw new Error("Aucun sujet pour ce slideshow.");
  const angle = await topicAngle(topic);
  const userPrompt = `Sujet : ${topic}${angle ? `\nAngle : ${angle}` : ""}\nLangue du texte : français de France.`;

  await patch(job.id, { step: "ecriture", progress: 0.05 });
  const written = await chatJSON<Written>(
    WRITING_MODEL,
    slideshowWritingBrief(format, n),
    userPrompt,
    1.0,
  );
  const slides: WrittenSlide[] = (written.slides ?? [])
    .slice(0, n)
    .map((s, i) => ({
      index: i,
      kind: normalizeSlideKind(s.kind, i, Math.min(n, (written.slides ?? []).length)),
      text: String(s.text ?? "").trim(),
      imagePrompt: String(s.imagePrompt ?? "").trim(),
    }));
  if (slides.length < 3) throw new Error("Écriture du slideshow vide.");

  // Garde-fou de longueur : UNE seule réécriture des slides fautives.
  const trop = findOverlongSlides(slides);
  if (trop.length) {
    try {
      const fautives = slides.filter((s) => trop.some((t) => t.index === s.index));
      const rewrite = await chatJSON<{ slides: { index: number; text: string }[] }>(
        WRITING_MODEL,
        `Tu raccourcis des textes de slides. ${MAX_MOTS_PAR_SLIDE} MOTS MAXIMUM par slide, viser dix. Garde le sens, le ton et l'information. Réponds uniquement en JSON : {"slides":[{"index":number,"text":string}]} avec exactement les mêmes index.`,
        JSON.stringify({ slides: fautives.map((s) => ({ index: s.index, text: s.text })) }),
      );
      for (const r of rewrite.slides ?? []) {
        const target = slides.find((s) => s.index === r.index);
        const text = String(r.text ?? "").trim();
        if (!target || !text) continue;
        const before = findOverlongSlides([target])[0]?.mots ?? 0;
        const after = findOverlongSlides([{ index: r.index, text }], 0)[0]?.mots ?? 0;
        if (after < before) target.text = text;
      }
    } catch (e) {
      await logEvent(job.id, "ecriture", `Réécriture de longueur impossible : ${e instanceof Error ? e.message : e}`, "warn");
    }
    const encore = findOverlongSlides(slides);
    if (encore.length) {
      await logEvent(
        job.id,
        "ecriture",
        `Slides encore trop longues : ${encore.map((e) => `#${e.index} (${e.mots} mots)`).join(", ")}`,
        "warn",
      );
    }
  }

  const textes: Record<string, SlideshowTexte> = {
    fr: {
      title: String(written.title ?? ""),
      caption: String(written.caption ?? ""),
      hashtags: Array.isArray(written.hashtags) ? written.hashtags.map(String) : [],
      slides: slides.map((s) => ({ index: s.index, text: s.text })),
    },
  };

  // Traduction : UN appel pour toutes les autres langues. Jamais d'imagePrompt.
  const autres = job.languages.filter((l) => l !== "fr");
  if (autres.length) {
    await patch(job.id, { step: "traduction", progress: 0.15 });
    const translated = await chatJSON<Record<string, SlideshowTexte>>(
      WRITING_MODEL,
      [
        "Tu traduis le texte d'un slideshow TikTok/Instagram, du français vers d'autres langues.",
        `Langues cibles (clés JSON) : ${autres.map((l) => `"${l}" = ${languageName(l)}`).join(", ")}.`,
        `LIMITE ÉLIMINATOIRE, identique dans chaque langue : ${MAX_MOTS_PAR_SLIDE} MOTS MAXIMUM par slide, viser dix. Adapte plutôt que de traduire mot à mot.`,
        "Traduis title, caption, hashtags (sans #, localisés) et le text de chaque slide, en gardant exactement les mêmes index.",
        'Réponds uniquement en JSON : {"<langue>":{"title":string,"caption":string,"hashtags":string[],"slides":[{"index":number,"text":string}]}}',
      ].join("\n"),
      JSON.stringify(textes["fr"]),
    );
    for (const lang of autres) {
      const t = translated?.[lang];
      if (!t || !Array.isArray(t.slides)) {
        await logEvent(job.id, "traduction", `Traduction manquante pour ${lang} : repli sur le français.`, "warn");
        textes[lang] = textes["fr"]!;
        continue;
      }
      textes[lang] = {
        title: String(t.title ?? ""),
        caption: String(t.caption ?? ""),
        hashtags: Array.isArray(t.hashtags) ? t.hashtags.map(String) : [],
        slides: slides.map((s) => ({
          index: s.index,
          text: String(t.slides.find((x) => x.index === s.index)?.text ?? s.text).trim(),
        })),
      };
      const long = findOverlongSlides(textes[lang]!.slides);
      if (long.length) {
        await logEvent(job.id, "traduction", `${lang} : ${long.length} slide(s) au-delà de ${MAX_MOTS_PAR_SLIDE} mots.`, "warn");
      }
    }
  }

  await patch(job.id, {
    slides: slides.map(({ index, kind, imagePrompt }) => ({ index, kind, imagePrompt })),
    textes,
    slide_count: slides.length,
    status: "images",
    step: "images",
    progress: 0.2,
  });
  await logEvent(job.id, "ecriture", `${slides.length} slides écrites, ${Object.keys(textes).length} langue(s).`);
}

// ---------- Étape 2 : images ----------

async function stepImages(job: SlideshowJob, t0: number) {
  const slides = [...job.slides];
  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i]!;
    if (slide.imagePath) continue; // reprise : jamais repayer une image
    if (outOfTime(t0)) return;
    const kind = normalizeSlideKind(slide.kind, i, slides.length);
    const dataUrl = await generateImageDataUrl(slideImagePrompt(slide.imagePrompt, kind, IMAGE_STYLE));
    const path = await uploadDataUrl(`slideshows/${job.id}/slide-${slide.index}.png`, dataUrl);
    slides[i] = { ...slide, imagePath: path };
    const done = slides.filter((s) => s.imagePath).length;
    await patch(job.id, { slides, progress: 0.2 + 0.7 * (done / slides.length) });
  }
  await patch(job.id, { status: "publication", step: "publication", progress: 0.9 });
  await logEvent(job.id, "images", `${slides.length} images prêtes.`);
}

// ---------- Étape 3 : publication ----------

function parisToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function stepPublication(job: SlideshowJob) {
  const db = await admin();
  const day = job.publish_date ?? parisToday();
  const rows = job.languages.map((lang) => {
    const t = job.textes[lang] ?? job.textes["fr"];
    return {
      slideshow_job_id: job.id,
      publish_date: day,
      language: lang,
      format: job.format,
      title: t?.title ?? "",
      caption: t?.caption ?? "",
      hashtags: t?.hashtags ?? [],
      slides: job.slides.map((s) => ({
        index: s.index,
        kind: normalizeSlideKind(s.kind, s.index, job.slides.length),
        text: t?.slides.find((x) => x.index === s.index)?.text ?? "",
        imagePath: s.imagePath ?? null,
      })),
      status: "published",
    };
  });
  const { error } = await db
    .from("daily_slideshows")
    .upsert(rows, { onConflict: "publish_date,language,format" });
  if (error) throw new Error(`Publication impossible : ${error.message}`);

  if (job.topic) {
    await db
      .from("topic_queue")
      .update({ status: "utilise", used_at: new Date().toISOString() })
      .eq("topic", job.topic)
      .eq("status", "valide");
  }
  await patch(job.id, { status: "done", step: "done", progress: 1, lease_until: null, publish_date: day });
  await logEvent(job.id, "publication", `Publié pour ${job.languages.join(", ")} le ${day}.`);
}

export async function runSlideshowTick(): Promise<{
  jobId?: string;
  status?: string;
  paused?: boolean;
  idle?: boolean;
  error?: string;
}> {
  const t0 = Date.now();
  if (await isSlideshowPaused()) return { paused: true };
  const job = await claimSlideshowJob();
  if (!job) return { idle: true };

  try {
    let current: SlideshowJob = job;
    const db = await admin();
    const reload = async () => {
      const { data } = await db.from("slideshow_jobs").select("*").eq("id", job.id).single();
      current = data as SlideshowJob;
    };
    while (!outOfTime(t0)) {
      if (current.status === "queued") await stepWriting(current);
      else if (current.status === "images") await stepImages(current, t0);
      else if (current.status === "publication") await stepPublication(current);
      else break;
      await reload();
      if ((current.status as string) === "done") break;
    }
    await db.from("slideshow_jobs").update({ lease_until: null }).eq("id", job.id);
    return { jobId: job.id, status: current.status };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await patch(job.id, { status: "error", error: message.slice(0, 2000), lease_until: null });
    await logEvent(job.id, current_step(job), message, "error");
    if (isBlockingError(message)) {
      await pauseSlideshows(`Blocage crédits/politique : ${message}`);
    }
    return { jobId: job.id, status: "error", error: message };
  }
}

function current_step(job: SlideshowJob) {
  return job.step ?? job.status;
}
