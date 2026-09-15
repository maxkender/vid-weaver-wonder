import { squareBox } from "./karaoke-overlay";

/**
 * Compose l'image carrée au centre d'un cadre 9:16 entièrement noir, AVANT de
 * l'envoyer au modèle vidéo (qui ne produit que du 9:16 et recadrerait sinon
 * l'image comme il veut). La géométrie est EXACTEMENT celle du masque final :
 * côté = width * (1 - 2 * SQUARE_MARGIN_RATIO), avec le décalage vertical commun.
 * Pas de coins arrondis ici : le masque du montage s'en charge.
 */
export async function composeSquareInVertical(
  imageDataUrl: string,
  width: number,
  height: number,
): Promise<string> {
  if (typeof document === "undefined") return imageDataUrl;

  const img = await new Promise<HTMLImageElement | null>((resolve) => {
    const el = new Image();
    el.crossOrigin = "anonymous";
    el.onload = () => resolve(el);
    el.onerror = () => resolve(null);
    el.src = imageDataUrl;
  });
  if (!img) return imageDataUrl;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return imageDataUrl;

  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, width, height);

  const { side, x, y } = squareBox(width, height);

  // L'image source est carrée : on la couvre sans la déformer.
  const scale = Math.max(side / img.width, side / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, side, side);
  ctx.clip();
  ctx.drawImage(img, x + (side - dw) / 2, y + (side - dh) / 2, dw, dh);
  ctx.restore();

  return canvas.toDataURL("image/jpeg", 0.94);
}
