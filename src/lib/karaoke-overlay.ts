export type KaraokeFrame = { blob: Blob; start: number; end: number };

function drawWord(
  ctx: CanvasRenderingContext2D,
  word: string,
  width: number,
  height: number,
) {
  const clean = word.toUpperCase();
  let fontSize = Math.round(width * 0.13);
  const maxWidth = width * 0.86;
  const font = (s: number) =>
    `900 ${s}px "Archivo Black", "Arial Black", Impact, sans-serif`;
  ctx.font = font(fontSize);
  while (ctx.measureText(clean).width > maxWidth && fontSize > 20) {
    fontSize -= 4;
    ctx.font = font(fontSize);
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const y = height * 0.74;

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.9)";
  ctx.shadowBlur = fontSize * 0.4;
  ctx.lineWidth = Math.max(8, fontSize * 0.18);
  ctx.strokeStyle = "#000";
  ctx.lineJoin = "round";
  ctx.strokeText(clean, width / 2, y);
  ctx.restore();
  ctx.fillStyle = "#ffffff";
  ctx.fillText(clean, width / 2, y);
}

/**
 * Découpe le texte en mots et rend un PNG transparent par mot,
 * avec un timing réparti sur la durée de la voix off (style TikTok).
 */
export async function makeKaraokeFrames(
  text: string,
  width: number,
  height: number,
  duration: number,
): Promise<KaraokeFrame[]> {
  const words = (text ?? "").trim().split(/\s+/).filter(Boolean);
  if (!words.length || !(duration > 0.3)) return [];

  const weights = words.map((w) => Math.max(2, w.replace(/[^\p{L}\p{N}]/gu, "").length));
  const total = weights.reduce((a, b) => a + b, 0);

  const frames: KaraokeFrame[] = [];
  let t = 0;
  for (let i = 0; i < words.length; i++) {
    const span = (weights[i]! / total) * duration;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return [];
    drawWord(ctx, words[i]!, width, height);
    const blob = await new Promise<Blob | null>((r) =>
      canvas.toBlob((b) => r(b), "image/png"),
    );
    if (blob) {
      frames.push({ blob, start: t, end: Math.min(duration, t + span) });
    }
    t += span;
  }
  return frames;
}
