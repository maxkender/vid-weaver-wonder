import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DEFAULT_SLIDE_STYLE, type SlideStyle } from "./slide-compose";
import { SLIDESHOW_FORMATS } from "./slideshow-formats";

export const DEFAULT_IMAGE_STYLE = "Square 1:1 format. Polished editorial photography. One single huge subject, centered. Simple uncluttered background. Soft directional light. Absolutely no text, no letters, no numbers, no logos anywhere. The upper third of the image is intentionally calm and empty to leave room for overlaid text.";
export type SlideshowSettings = SlideStyle & {
  formats_actifs: string[]; slide_count_defaut: number; langues: string[]; image_style: string;
};
export const DEFAULT_SLIDESHOW_SETTINGS: SlideshowSettings = {
  ...DEFAULT_SLIDE_STYLE,
  formats_actifs: SLIDESHOW_FORMATS.map((f) => f.id),
  slide_count_defaut: 12,
  langues: ["fr", "en", "es", "de", "it"],
  image_style: DEFAULT_IMAGE_STYLE,
};

export const FONT_OPTIONS = ["Anton", "Archivo Black", "Bebas Neue", "Oswald", "Montserrat", "Inter", "Poppins", "Playfair Display"] as const;
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const settingsSchema = z.object({
  formats_actifs: z.array(z.enum(["quiz", "histoire", "debunk", "classement", "vrai_faux", "echelle"])).min(1),
  slide_count_defaut: z.number().int().min(3).max(20),
  langues: z.array(z.enum(["fr", "en", "es", "de", "it"])).min(1),
  image_style: z.string().max(4000),
  police: z.enum(FONT_OPTIONS), graisse: z.number().int().min(100).max(900),
  taille_ratio: z.number().min(0.04).max(0.10), majuscules: z.boolean(),
  position_texte: z.enum(["haut", "milieu", "bas"]), largeur_max_ratio: z.number().min(0.3).max(1),
  interligne: z.number().min(0.8).max(2), couleur_texte: hex,
  fond_texte: z.enum(["aucun", "contour", "ombre", "bandeau", "boite"]),
  fond_couleur: hex, fond_opacite: z.number().min(0).max(1), lignes_max: z.number().int().min(1).max(12),
});

export function parseSlideshowSettings(row: Record<string, unknown> | null): SlideshowSettings {
  if (!row) return DEFAULT_SLIDESHOW_SETTINGS;
  return settingsSchema.parse({ ...DEFAULT_SLIDESHOW_SETTINGS, ...row,
    taille_ratio: Number(row.taille_ratio ?? DEFAULT_SLIDE_STYLE.taille_ratio),
    largeur_max_ratio: Number(row.largeur_max_ratio ?? DEFAULT_SLIDE_STYLE.largeur_max_ratio),
    interligne: Number(row.interligne ?? DEFAULT_SLIDE_STYLE.interligne),
    fond_opacite: Number(row.fond_opacite ?? DEFAULT_SLIDE_STYLE.fond_opacite),
  });
}

export const getSlideshowSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("slideshow_settings").select("*").eq("id", 1).maybeSingle();
    if (error) throw new Error(error.message);
    return parseSlideshowSettings(data as Record<string, unknown> | null);
  });

export const saveSlideshowSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => settingsSchema.parse(data))
  .handler(async ({ context, data }) => {
    const { data: admin, error: roleError } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (roleError || admin !== true) throw new Error("Accès réservé à l'administrateur.");
    const { error } = await context.supabase.from("slideshow_settings").upsert({ id: 1, ...data, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getSlideshowPreviewSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: admin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (admin !== true) throw new Error("Accès réservé à l'administrateur.");
    const { admin: getAdmin } = await import("./jobs/store.server");
    const db = await getAdmin();
    const { data: jobs } = await db.from("slideshow_jobs").select("slides, textes").order("created_at", { ascending: false }).limit(50);
    let longest = "";
    for (const job of jobs ?? []) {
      const textGroup = (job.textes ?? {}) as Record<string, { slides?: { text?: string }[] }>;
      for (const group of Object.values(textGroup)) for (const slide of group?.slides ?? []) {
        if ((slide.text?.length ?? 0) > longest.length) longest = slide.text ?? "";
      }
    }
    for (const job of jobs ?? []) {
      const slides = Array.isArray(job.slides) ? job.slides as { index?: number; imagePath?: string }[] : [];
      const first = slides.find((s) => s.imagePath);
      if (!first?.imagePath) continue;
      const { data: signed } = await db.storage.from("renders").createSignedUrl(first.imagePath, 3600);
      if (signed?.signedUrl) {
        const textGroup = (job.textes ?? {}) as Record<string, { slides?: { index: number; text: string }[] }>;
        return { imageUrl: signed.signedUrl, short: textGroup.fr?.slides?.find((s) => s.index === first.index)?.text ?? "Sophia", long: longest };
      }
    }
    return { imageUrl: null as string | null, short: "Sophia", long: longest };
  });