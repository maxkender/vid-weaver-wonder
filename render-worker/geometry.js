/**
 * Géométrie de la fenêtre carrée et des sous-titres.
 *
 * SOURCE DE VÉRITÉ : src/lib/karaoke-overlay.ts du studio.
 * Toute valeur modifiée là-bas doit être reportée ici, sinon le service de
 * rendu et le montage navigateur divergent.
 */

/** Marge latérale de la fenêtre carrée (fraction de la largeur, de chaque côté). */
export const SQUARE_MARGIN_RATIO = 0.148;
/** Rayon des coins de la fenêtre carrée (fraction du côté). */
export const SQUARE_RADIUS_RATIO = 0.07;
/** Taille de police des sous-titres, relative au CÔTÉ DU CARRÉ. */
export const CAPTION_SIZE_RATIO = 0.062 / 0.88;
/** Largeur maximale d'une ligne, relative au côté du carré. */
export const CAPTION_MAX_WIDTH_RATIO = 0.86 / 0.88;

/** Côté de la fenêtre carrée centrée dans un cadre width × height. */
export function squareSide(width, height) {
  return Math.round(Math.min(width * (1 - 2 * SQUARE_MARGIN_RATIO), height));
}

/** Position du carré centré. */
export function squareBox(width, height) {
  const side = squareSide(width, height);
  return {
    side,
    x: Math.round((width - side) / 2),
    y: Math.round((height - side) / 2),
    radius: Math.round(side * SQUARE_RADIUS_RATIO),
  };
}
