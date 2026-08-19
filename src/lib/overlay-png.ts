/** Génère un PNG transparent avec le texte incrusté (style TikTok) à superposer sur la vidéo. */
export async function makeOverlayPng(
  text: string,
  width: number,
  height: number,
): Promise<Blob | null> {
  const clean = (text ?? "").trim().toUpperCase();
  if (!clean) return null;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const fontSize = Math.round(width * 0.075);
  ctx.font = `900 ${fontSize}px "Archivo Black", "Arial Black", Impact, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Découpe en lignes
  const maxWidth = width * 0.86;
  const words = clean.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    const next = current ? `${current} ${w}` : w;
    if (ctx.measureText(next).width > maxWidth && current) {
      lines.push(current);
      current = w;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);

  const lineHeight = fontSize * 1.18;
  const blockHeight = lines.length * lineHeight;
  const baseY = height * 0.78 - blockHeight / 2 + lineHeight / 2;

  lines.forEach((line, i) => {
    const y = baseY + i * lineHeight;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.85)";
    ctx.shadowBlur = fontSize * 0.35;
    ctx.lineWidth = Math.max(6, fontSize * 0.16);
    ctx.strokeStyle = "#000";
    ctx.lineJoin = "round";
    ctx.strokeText(line, width / 2, y);
    ctx.restore();
    ctx.fillStyle = "#ffffff";
    ctx.fillText(line, width / 2, y);
  });

  return await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/png"),
  );
}
