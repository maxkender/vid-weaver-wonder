/**
 * Composition d'une slide DANS LE NAVIGATEUR : image + texte incrusté.
 * Même style que `overlay-png.ts` (police, graisse, contour, ombre, majuscules,
 * lignes sur 86 % de la largeur) mais bloc de texte dans le TIERS SUPÉRIEUR.
 */
export async function composeSlide(imageUrl: string, text: string): Promise<Blob> {
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`Image indisponible (${res.status})`);
  const bitmap = await createImageBitmap(await res.blob());
  const width = bitmap.width;
  const height = bitmap.height;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponible");
  ctx.drawImage(bitmap, 0, 0, width, height);

  const clean = (text ?? "").trim().toUpperCase();
  if (clean) {
    try {
      await document.fonts?.load(`900 ${Math.round(width * 0.075)}px "Archivo Black"`);
    } catch {
      /* police de repli */
    }
    const fontSize = Math.round(width * 0.075);
    ctx.font = `900 ${fontSize}px "Archivo Black", "Arial Black", Impact, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const maxWidth = width * 0.86;
    const lines: string[] = [];
    let current = "";
    for (const w of clean.split(/\s+/)) {
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
    // Centre du bloc au milieu du tiers supérieur, sans jamais sortir du cadre.
    const center = height / 6;
    const top = Math.max(height * 0.04, center - blockHeight / 2);
    const baseY = top + lineHeight / 2;

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
  }

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Export PNG impossible");
  return blob;
}
