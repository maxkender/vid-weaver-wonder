/**
 * Géométrie de la fenêtre carrée et des sous-titres.
 *
 * SOURCE DE VÉRITÉ : src/lib/karaoke-overlay.ts du studio.
 * Toute valeur modifiée là-bas doit être reportée ici, sinon le service de
 * rendu et le montage navigateur divergent.
 */

/** Marge latérale de la fenêtre carrée (fraction de la largeur, de chaque côté). */
export const SQUARE_MARGIN_RATIO = 0.036;
/** Rayon des coins de la fenêtre carrée (fraction du côté). */
export const SQUARE_RADIUS_RATIO = 0.1;
/** Décalage vertical du centre, relatif à la hauteur (négatif = vers le haut). */
export const SQUARE_CENTER_OFFSET_RATIO = -0.0475;
/** Taille de police des sous-titres, relative au CÔTÉ DU CARRÉ. */
export const CAPTION_SIZE_RATIO = 0.135;
/** Largeur maximale d'une ligne, relative au côté du carré. */
export const CAPTION_MAX_WIDTH_RATIO = 0.86 / 0.88;

/** Côté de la fenêtre carrée centrée dans un cadre width × height. */
export function squareSide(width, height) {
  return Math.round(Math.min(width * (1 - 2 * SQUARE_MARGIN_RATIO), height));
}

/** Position du carré centré. */
export function squareBox(width, height) {
  const side = squareSide(width, height);
  const centerY = height * (0.5 + SQUARE_CENTER_OFFSET_RATIO);
  return {
    side,
    x: Math.round((width - side) / 2),
    y: Math.round(centerY - side / 2),
    centerY,
    radius: Math.round(side * SQUARE_RADIUS_RATIO),
  };
}
