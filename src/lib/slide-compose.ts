/** Composition de slides dans le navigateur, identique pour aperçu et export. */
export type SlideStyle = {
  police: string; graisse: number; taille_ratio: number; majuscules: boolean;
  position_texte: "haut" | "milieu" | "bas"; largeur_max_ratio: number;
  interligne: number; couleur_texte: string;
  fond_texte: "aucun" | "contour" | "ombre" | "bandeau" | "boite";
  fond_couleur: string; fond_opacite: number; lignes_max: number;
};

export const DEFAULT_SLIDE_STYLE: SlideStyle = {
  police: "Anton", graisse: 400, taille_ratio: 0.065, majuscules: true,
  position_texte: "haut", largeur_max_ratio: 0.84, interligne: 1.15,
  couleur_texte: "#FFFFFF", fond_texte: "boite", fond_couleur: "#000000",
  fond_opacite: 0.78, lignes_max: 4,
};

export async function composeSlide(imageUrl: string, text: string, style: SlideStyle): Promise<Blob> {
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`Image indisponible (${res.status})`);
  const bitmap = await createImageBitmap(await res.blob());
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponible");
  const { width, height } = canvas;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const clean = style.majuscules ? text.trim().toUpperCase() : text.trim();
  if (clean) {
    let fontSize = Math.max(1, width * style.taille_ratio);
    const fontName = `"${style.police.replace(/["\\]/g, "")}"`;
    const fontSpec = (size: number) => `${style.graisse} ${size}px ${fontName}`;
    // Wait for the webfont before any canvas text, including the first preview.
    let loaded = false;
    try {
      const faces = await document.fonts.load(fontSpec(fontSize), clean);
      loaded = faces.length > 0;
    } catch { /* offline: use a known fallback */ }
    const family = loaded ? `${fontName}, "Arial Black", Impact, sans-serif` : '"Arial Black", Impact, sans-serif';
    const words = clean.split(/\s+/);
    const maxWidth = width * style.largeur_max_ratio - (style.fond_texte === "boite" ? fontSize * 0.6 : 0);
    let lines: string[] = [];
    // Fit both the line count and the longest individual word inside the text area.
    for (let attempt = 0; attempt < 160; attempt++) {
      ctx.font = `${style.graisse} ${fontSize}px ${family}`;
      lines = [];
      let line = "";
      for (const word of words) {
        const next = line ? `${line} ${word}` : word;
        if (line && ctx.measureText(next).width > maxWidth) {
          lines.push(line); line = word;
        } else line = next;
      }
      if (line) lines.push(line);
      const blockHeight = lines.length * fontSize * style.interligne;
      if (lines.length <= style.lignes_max && blockHeight <= height * 0.92 && lines.every((l) => ctx.measureText(l).width <= maxWidth)) break;
      fontSize *= 0.96;
    }
    const lineHeight = fontSize * style.interligne;
    const blockHeight = lines.length * lineHeight;
    const center = style.position_texte === "haut" ? height / 6 : style.position_texte === "bas" ? height * 5 / 6 : height / 2;
    const top = Math.max(height * 0.04, Math.min(height * 0.96 - blockHeight, center - blockHeight / 2));
    const middle = top + blockHeight / 2;
    if (style.fond_texte === "bandeau" || style.fond_texte === "boite") {
      const widest = Math.max(...lines.map((line) => ctx.measureText(line).width));
      const boxWidth = style.fond_texte === "bandeau" ? width : Math.min(width, widest + fontSize * 1.2);
      const boxHeight = Math.min(height, blockHeight + fontSize);
      const x = (width - boxWidth) / 2;
      const y = Math.max(0, Math.min(height - boxHeight, middle - boxHeight / 2));
      ctx.save();
      ctx.globalAlpha = style.fond_opacite;
      ctx.fillStyle = style.fond_couleur;
      if (style.fond_texte === "boite") {
        ctx.beginPath();
        ctx.roundRect(x, y, boxWidth, boxHeight, fontSize * 0.25);
        ctx.fill();
      } else ctx.fillRect(x, y, boxWidth, boxHeight);
      ctx.restore();
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    lines.forEach((line, i) => {
      const y = top + lineHeight * (i + 0.5);
      if (style.fond_texte === "contour") {
        ctx.lineJoin = "round";
        ctx.lineWidth = fontSize * 0.16;
        ctx.strokeStyle = style.fond_couleur;
        ctx.strokeText(line, width / 2, y);
      }
      if (style.fond_texte === "ombre") {
        ctx.shadowColor = style.fond_couleur;
        ctx.shadowBlur = fontSize * 0.35;
        ctx.shadowOffsetY = fontSize * 0.06;
      }
      ctx.fillStyle = style.couleur_texte;
      ctx.fillText(line, width / 2, y);
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
    });
  }
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Export PNG impossible");
  return blob;
}