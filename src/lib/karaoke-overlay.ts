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

function drawWord(
  ctx: CanvasRenderingContext2D,
  word: string,
  width: number,
  height: number,
  scale = 1,
) {
  const clean = word.replace(/[«»"]/g, "").toUpperCase();
  let fontSize = Math.round(width * 0.125);
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
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.font = font(fontSize);
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

async function renderPng(
  width: number,
  height: number,
  word: string | null,
  scale = 1,
): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  if (word) {
    await ensureFont(Math.round(width * 0.125));
    drawWord(ctx, word, width, height, scale);
  }

  return await new Promise<Blob | null>((r) => canvas.toBlob((b) => r(b), "image/png"));
}

/**
 * Masque carré à coins arrondis : tout ce qui dépasse du carré centré devient noir.
 * Utilisé pour le style papier découpé (vidéo carrée dans un cadre vertical).
 */
export async function makeRoundedSquareMask(
  width: number,
  height: number,
  radiusRatio = 0.07,
): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const side = Math.min(width, height);
  const x = (width - side) / 2;
  const y = (height - side) / 2;
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

/** Pop d'apparition : le mot grossit vite puis se stabilise (rendu fluide). */
function popScale(progress: number) {
  if (progress >= 1) return 1;
  const p = Math.max(0, progress);
  return 0.82 + 0.18 * (1 - Math.pow(1 - p, 3)) + 0.05 * Math.sin(Math.PI * p);
}

const SCALE_STEPS = 6;

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
): Promise<KaraokeSequence | null> {
  const timings =
    exactTimings && exactTimings.length
      ? exactTimings.filter((t) => t.end > t.start && t.start < duration + 0.5)
      : wordTimings(text, duration);
  if (!timings.length) return null;

  const blank = await renderPng(width, height, null);
  if (!blank) return null;

  // Cache : une image par (mot, palier d'échelle) → animation fluide sans exploser la mémoire.
  const cache = new Map<string, Blob>();
  const get = async (word: string, step: number) => {
    const key = `${word}#${step}`;
    let b = cache.get(key);
    if (!b) {
      const scale = step >= SCALE_STEPS - 1 ? 1 : popScale(step / (SCALE_STEPS - 1));
      b = (await renderPng(width, height, word, scale)) ?? blank;
      cache.set(key, b);
    }
    return b;
  };

  const count = Math.max(1, Math.ceil(duration * fps));
  const frames: Blob[] = [];
  const popTime = 0.13; // durée de l'animation d'apparition
  for (let f = 0; f < count; f++) {
    const t = (f + 0.5) / fps;
    const idx = timings.findIndex((w2) => t >= w2.start && t < w2.end);
    if (idx < 0) {
      frames.push(blank);
      continue;
    }
    const w = timings[idx]!;
    const progress = Math.min(1, (t - w.start) / popTime);
    const step = Math.min(SCALE_STEPS - 1, Math.round(progress * (SCALE_STEPS - 1)));
    frames.push(await get(w.word, step));
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
