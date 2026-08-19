export type KaraokeFrame = { blob: Blob; start: number; end: number };
export type KaraokeSequence = { fps: number; frames: Blob[] };

/** Charge la police d'affichage avant de dessiner (sinon canvas retombe sur Arial). */
async function ensureFont(size: number) {
  try {
    await (document as unknown as { fonts: FontFaceSet }).fonts.load(`900 ${size}px Anton`);
  } catch {
    /* police indisponible : on garde la fallback */
  }
}

/** Taille de police relative des sous-titres (2× plus petit qu'avant). */
export const CAPTION_SIZE_RATIO = 0.062;

function drawWord(
  ctx: CanvasRenderingContext2D,
  word: string,
  width: number,
  height: number,
  scale = 1,
  alpha = 1,
) {
  const clean = word.replace(/[«»"]/g, "").toLowerCase();
  let fontSize = Math.round(width * CAPTION_SIZE_RATIO);
  const maxWidth = width * 0.82;
  const font = (s: number) => `400 ${s}px "Anton", "Arial Narrow", Impact, sans-serif`;
  ctx.font = font(fontSize);
  while (ctx.measureText(clean).width > maxWidth && fontSize > 20) {
    fontSize -= 4;
    ctx.font = font(fontSize);
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const cx = width / 2;
  const cy = height * 0.5;

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.font = font(fontSize);
  ctx.lineWidth = Math.max(4, fontSize * 0.16);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Ombre portée douce, séparée du contour pour un rendu net.
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = fontSize * 0.42;
  ctx.shadowOffsetY = fontSize * 0.08;
  ctx.fillStyle = "rgba(0,0,0,0.9)";
  ctx.fillText(clean, 0, 0);
  ctx.restore();

  // Contour noir épais (style TikTok) puis remplissage blanc.
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  ctx.lineWidth = Math.max(8, fontSize * 0.16);
  ctx.strokeStyle = "#000000";
  ctx.strokeText(clean, 0, 0);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(clean, 0, 0);
  ctx.restore();
}

/** Charge (et mémorise) le logo Sophia pour l'incruster dans les frames. */
const logoCache = new Map<string, HTMLImageElement>();
export async function loadLogo(url: string): Promise<HTMLImageElement | null> {
  const hit = logoCache.get(url);
  if (hit) return hit;
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = url;
    await img.decode();
    logoCache.set(url, img);
    return img;
  } catch {
    return null;
  }
}

/** Logo Sophia qui « pop » en haut du cadre pendant la mention de la marque. */
function drawLogo(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  width: number,
  height: number,
  progress: number,
) {
  const eased = 1 - Math.pow(1 - Math.max(0, Math.min(1, progress)), 3);
  const scale = 0.7 + 0.3 * eased + 0.06 * Math.sin(Math.PI * Math.min(1, progress));
  const size = width * 0.34 * scale;
  const cx = width / 2;
  const cy = height * 0.26;
  ctx.save();
  ctx.globalAlpha = Math.min(1, progress * 3);
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = size * 0.18;
  ctx.shadowOffsetY = size * 0.05;
  ctx.drawImage(img, cx - size / 2, cy - size / 2, size, size);
  ctx.restore();
}

async function renderPng(
  width: number,
  height: number,
  word: string | null,
  scale = 1,
  logo?: { img: CanvasImageSource; progress: number } | null,
  alpha = 1,
): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  if (logo) drawLogo(ctx, logo.img, width, height, logo.progress);
  if (word) {
    await ensureFont(Math.round(width * CAPTION_SIZE_RATIO));
    drawWord(ctx, word, width, height, scale, alpha);
  }

  return await new Promise<Blob | null>((r) => canvas.toBlob((b) => r(b), "image/png"));
}

/** Marge latérale de la fenêtre carrée (fraction de la largeur, de chaque côté). */
export const SQUARE_MARGIN_RATIO = 0.06;
/** Rayon des coins de la fenêtre carrée (fraction du côté). */
export const SQUARE_RADIUS_RATIO = 0.07;

/**
 * Masque carré à coins arrondis : tout ce qui dépasse du carré centré devient noir.
 * La fenêtre garde toujours la même marge à gauche et à droite, sur toute la vidéo.
 */
export async function makeRoundedSquareMask(
  width: number,
  height: number,
  radiusRatio = SQUARE_RADIUS_RATIO,
): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const side = Math.round(Math.min(width * (1 - 2 * SQUARE_MARGIN_RATIO), height));
  const x = Math.round((width - side) / 2);
  const y = Math.round((height - side) / 2);
  const r = side * radiusRatio;


  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  // roundRect n'est pas partout : tracé manuel.
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + side - r, y);
  ctx.quadraticCurveTo(x + side, y, x + side, y + r);
  ctx.lineTo(x + side, y + side - r);
  ctx.quadraticCurveTo(x + side, y + side, x + side - r, y + side);
  ctx.lineTo(x + r, y + side);
  ctx.quadraticCurveTo(x, y + side, x, y + side - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();

  return await new Promise<Blob | null>((r2) => canvas.toBlob((b) => r2(b), "image/png"));
}

/**
 * Répartit les mots sur la durée réelle de la voix off.
 * Le poids d'un mot tient compte de sa longueur ET des pauses de ponctuation,
 * pour que le texte ne défile pas plus vite que la voix.
 */
export function wordTimings(text: string, duration: number) {
  const words = (text ?? "").trim().split(/\s+/).filter(Boolean);
  if (!words.length || !(duration > 0.3)) return [] as { word: string; start: number; end: number }[];

  const lead = Math.min(0.35, duration * 0.08);
  const tail = Math.min(0.2, duration * 0.04);
  const usable = Math.max(0.1, duration - lead - tail);

  const weights = words.map((w) => {
    const letters = w.replace(/[^\p{L}\p{N}]/gu, "").length;
    let weight = Math.max(2, letters) + 2; // coût fixe d'attaque du mot
    if (/[,;:]$/.test(w)) weight += 3;
    if (/[.!?…]$/.test(w)) weight += 5.5;
    return weight;
  });
  const total = weights.reduce((a, b) => a + b, 0);

  const out: { word: string; start: number; end: number }[] = [];
  let t = lead;
  for (let i = 0; i < words.length; i++) {
    const span = (weights[i]! / total) * usable;
    out.push({ word: words[i]!, start: t, end: Math.min(duration - tail, t + span) });
    t += span;
  }
  return out;
}

/** Pop d'apparition du logo uniquement (le texte, lui, ne zoome pas). */
function popScale(progress: number) {
  if (progress >= 1) return 1;
  const p = Math.max(0, progress);
  return 0.82 + 0.18 * (1 - Math.pow(1 - p, 3)) + 0.05 * Math.sin(Math.PI * p);
}

// Paliers d'animation du logo Sophia (le mot, lui, est toujours à l'échelle 1).
const LOGO_STEPS = 6;
/** Durée du fondu d'apparition d'un mot (secondes). */
export const CAPTION_FADE = 0.1;
const FADE_STEPS = 4;

/**
 * Rend les timings continus : chaque mot reste affiché jusqu'au suivant
 * (plus de clignotements ni de mots qui « sautent » plus vite que la voix).
 */
export function smoothTimings(
  timings: { word: string; start: number; end: number }[],
  duration: number,
) {
  const sorted = [...timings]
    .filter((t) => t.word && t.start >= 0 && t.start < duration + 0.5)
    .sort((a, b) => a.start - b.start);
  return sorted.map((t, i) => {
    const next = sorted[i + 1];
    const end = next ? next.start : Math.min(duration, Math.max(t.end, t.start + 0.35));
    return { word: t.word, start: t.start, end: Math.max(end, t.start + 0.08) };
  });
}

/**
 * Séquence d'images (une par frame, cadence fixe) prête à être incrustée par FFmpeg.
 */
export async function makeKaraokeSequence(
  text: string,
  width: number,
  height: number,
  duration: number,
  fps = 15,
  exactTimings?: { word: string; start: number; end: number }[] | null,
  logo?: { url: string; start: number; end: number } | null,
): Promise<KaraokeSequence | null> {
  const timings = smoothTimings(
    exactTimings && exactTimings.length
      ? exactTimings.filter((t) => t.end > t.start)
      : wordTimings(text, duration),
    duration,
  );
  if (!timings.length) return null;

  const logoImg = logo ? await loadLogo(logo.url) : null;
  const logoAt = (t: number) => {
    if (!logoImg || !logo) return null;
    if (t < logo.start || t > logo.end) return null;
    return { img: logoImg, progress: Math.min(1, (t - logo.start) / 0.35) };
  };

  const blank = await renderPng(width, height, null);
  if (!blank) return null;

  // Cache : une image par (mot, palier de logo) → rendu léger en mémoire.
  const cache = new Map<string, Blob>();
  const get = async (word: string | null, logoStep = -1, fadeStep = FADE_STEPS - 1) => {
    const key = `${word ?? ""}#${logoStep}#${fadeStep}`;
    let b = cache.get(key);
    if (!b) {
      const lg =
        logoStep >= 0 && logoImg
          ? {
              img: logoImg as CanvasImageSource,
              progress: logoStep / (LOGO_STEPS - 1),
            }
          : null;
      const alpha = (fadeStep + 1) / FADE_STEPS;
      b = (await renderPng(width, height, word, 1, lg, alpha)) ?? blank;
      cache.set(key, b);
    }
    return b;
  };

  const count = Math.max(1, Math.ceil(duration * fps));
  const frames: Blob[] = [];
  for (let f = 0; f < count; f++) {
    const t = (f + 0.5) / fps;
    const lg = logoAt(t);
    const logoStep = lg ? Math.min(LOGO_STEPS - 1, Math.round(lg.progress * (LOGO_STEPS - 1))) : -1;
    const idx = timings.findIndex((w2) => t >= w2.start && t < w2.end);
    if (idx < 0) {
      frames.push(logoStep >= 0 ? await get(null, logoStep) : blank);
      continue;
    }
    const cur = timings[idx]!;
    // Fondu court à l'apparition du mot → transition douce, sans à-coups.
    const fadeStep = Math.min(
      FADE_STEPS - 1,
      Math.max(0, Math.round(((t - cur.start) / CAPTION_FADE) * (FADE_STEPS - 1))),
    );
    frames.push(await get(cur.word, logoStep, fadeStep));
  }
  return { fps, frames };
}

/** @deprecated conservé pour l'aperçu : un PNG par mot avec son intervalle. */
export async function makeKaraokeFrames(
  text: string,
  width: number,
  height: number,
  duration: number,
): Promise<KaraokeFrame[]> {
  const timings = wordTimings(text, duration);
  const frames: KaraokeFrame[] = [];
  for (const t of timings) {
    const blob = await renderPng(width, height, t.word);
    if (blob) frames.push({ blob, start: t.start, end: t.end });
  }
  return frames;
}

/**
 * Fenêtre d'apparition du logo Sophia : dès que la voix prononce « Sophia »,
 * le logo pop et reste ~2,5 s (ou jusqu'à la fin du plan).
 */
export function sophiaWindow(
  text: string,
  duration: number,
  exactTimings?: { word: string; start: number; end: number }[] | null,
): { start: number; end: number } | null {
  const norm = (s: string) =>
    s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (!/sophia/.test(norm(text ?? ""))) return null;
  const timings =
    exactTimings && exactTimings.length ? exactTimings : wordTimings(text, duration);
  const hit = timings.find((t) => norm(t.word).includes("sophia"));
  const start = hit ? Math.max(0, hit.start - 0.1) : Math.max(0, duration * 0.55);
  return { start, end: Math.min(duration, start + 2.8) };
}
