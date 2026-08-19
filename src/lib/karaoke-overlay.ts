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
) {
  const clean = word.toUpperCase();
  let fontSize = Math.round(width * 0.13);
  const maxWidth = width * 0.86;
  // Même police que l'aperçu dans l'app (--font-display).
  const font = (s: number) => `400 ${s}px "Anton", "Arial Narrow", Impact, sans-serif`;
  ctx.font = font(fontSize);
  while (ctx.measureText(clean).width > maxWidth && fontSize > 20) {
    fontSize -= 4;
    ctx.font = font(fontSize);
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // Centré comme dans l'aperçu (au milieu de l'image, pas en bas).
  const y = height * 0.5;

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.85)";
  ctx.shadowBlur = fontSize * 0.5;
  ctx.shadowOffsetY = fontSize * 0.06;
  ctx.lineWidth = Math.max(6, fontSize * 0.12);
  ctx.strokeStyle = "rgba(0,0,0,0.75)";
  ctx.lineJoin = "round";
  ctx.strokeText(clean, width / 2, y);
  ctx.restore();
  ctx.fillStyle = "#ffffff";
  ctx.fillText(clean, width / 2, y);
}


async function renderPng(
  width: number,
  height: number,
  word: string | null,
): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  if (word) drawWord(ctx, word, width, height);
  return await new Promise<Blob | null>((r) => canvas.toBlob((b) => r(b), "image/png"));
}

/**
 * Répartit les mots sur la durée réelle de la voix off.
 * Le poids d'un mot tient compte de sa longueur ET des pauses de ponctuation,
 * pour que le texte ne défile pas plus vite que la voix.
 */
export function wordTimings(text: string, duration: number) {
  const words = (text ?? "").trim().split(/\s+/).filter(Boolean);
  if (!words.length || !(duration > 0.3)) return [] as { word: string; start: number; end: number }[];

  // Temps mort avant le premier mot et petite marge de fin pour ne jamais
  // dépasser la voix off réelle.
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

/**
 * Séquence d'images (une par frame, cadence fixe) prête à être incrustée par FFmpeg.
 * Bien plus fiable que d'empiler un overlay par mot dans un filter_complex.
 */
export async function makeKaraokeSequence(
  text: string,
  width: number,
  height: number,
  duration: number,
  fps = 8,
  exactTimings?: { word: string; start: number; end: number }[] | null,
): Promise<KaraokeSequence | null> {
  // Timings exacts (alignement ElevenLabs) si disponibles, sinon estimation.
  const timings =
    exactTimings && exactTimings.length
      ? exactTimings.filter((t) => t.end > t.start && t.start < duration + 0.5)
      : wordTimings(text, duration);
  if (!timings.length) return null;

  // Les PNG sont rendus en demi-résolution puis remis à l'échelle par FFmpeg :
  // 4x moins de mémoire, aucune perte visible sur un texte plein écran.
  const w = Math.round(width / 2);
  const h = Math.round(height / 2);

  const blank = await renderPng(w, h, null);
  if (!blank) return null;
  const cache = new Map<string, Blob>();
  const wordBlobs: Blob[] = [];
  for (const t of timings) {
    let b = cache.get(t.word);
    if (!b) {
      b = (await renderPng(w, h, t.word)) ?? blank;
      cache.set(t.word, b);
    }
    wordBlobs.push(b);
  }

  const count = Math.max(1, Math.ceil(duration * fps));
  const frames: Blob[] = [];
  for (let f = 0; f < count; f++) {
    const t = (f + 0.5) / fps;
    const idx = timings.findIndex((w2) => t >= w2.start && t < w2.end);
    frames.push(idx >= 0 ? wordBlobs[idx]! : blank);
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
