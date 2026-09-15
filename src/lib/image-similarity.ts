/**
 * CONTRÔLE DE RESSEMBLANCE entre deux plans voisins.
 *
 * Objectif : repérer, sans aucun appel payant, deux images qui montrent
 * visiblement la même chose au même cadrage (même grotte, même personnage,
 * même distance). On réduit chaque image à une petite empreinte de couleur et
 * on compare. C'est grossier, mais c'est exactement ce qu'on cherche : deux
 * plans quasi identiques ont la même empreinte, deux plans réellement
 * différents (échelle ou sujet différents) ne l'ont pas.
 */

const GRID = 12;

/** Empreinte d'une image : moyennes RVB sur une grille 12×12. */
export async function imageFingerprint(dataUrl: string): Promise<number[] | null> {
  if (typeof document === "undefined") return null;
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("image illisible"));
      el.src = dataUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = GRID;
    canvas.height = GRID;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, GRID, GRID);
    const { data } = ctx.getImageData(0, 0, GRID, GRID);
    const out: number[] = [];
    for (let i = 0; i < data.length; i += 4) {
      out.push(data[i]!, data[i + 1]!, data[i + 2]!);
    }
    return out;
  } catch {
    return null;
  }
}

/** Ressemblance de 0 (tout oppose les deux images) à 1 (images identiques). */
export function fingerprintSimilarity(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff += Math.abs(a[i]! - b[i]!);
  return 1 - diff / (a.length * 255);
}

/**
 * Seuil de « trop proche ». Calé volontairement haut : on ne veut régénérer
 * que des plans quasiment jumeaux, jamais deux plans simplement cohérents
 * entre eux (la cohérence de palette est justement la signature de la chaîne).
 */
export const TOO_SIMILAR = 0.93;
