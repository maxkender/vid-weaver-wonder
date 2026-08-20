/**
 * Sous-titres mot par mot, alignés sur les horodatages ElevenLabs.
 *
 * Règles reprises du studio (à ne pas changer sans demande explicite) :
 * - un mot à la fois, casse d'origine conservée,
 * - taille = 0.062 × largeur, police Anton,
 * - fondu court, aucun zoom,
 * - centré verticalement dans la fenêtre carrée.
 */

export const CAPTION_SIZE_RATIO = 0.062;
export const CAPTION_FADE = 0.08;

/** Échappe le texte pour le filtre drawtext de ffmpeg. */
export function escapeDrawText(text) {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\u2019")
    .replace(/%/g, "\\%")
    .replace(/,/g, "\\,")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

/**
 * Étire/normalise les horodatages pour qu'aucun mot ne disparaisse avant le
 * suivant : chaque mot reste affiché jusqu'au début du mot d'après.
 */
export function smoothTimings(words, duration) {
  const clean = (words ?? []).filter((w) => w?.word && w.word.trim());
  if (!clean.length) return [];
  const last = Math.max(...clean.map((w) => w.end));
  const scale = last > 0 && duration > 0 ? Math.min(1, duration / last) : 1;
  return clean.map((w, i) => {
    const start = Math.max(0, w.start * scale - 0.05);
    const next = clean[i + 1];
    const end = next ? Math.max(start + 0.1, next.start * scale - 0.02) : Math.min(duration, w.end * scale + 0.25);
    return { word: w.word.trim(), start, end };
  });
}

/**
 * Construit la chaîne de filtres drawtext pour une piste de mots.
 * `offset` décale la piste dans la timeline globale.
 */
export function drawTextFilters(words, { width, height, fontFile, offset = 0 }) {
  const size = Math.round(width * CAPTION_SIZE_RATIO);
  return words
    .map((w) => {
      const start = (w.start + offset).toFixed(3);
      const end = (w.end + offset).toFixed(3);
      const alpha =
        `if(lt(t-${start},${CAPTION_FADE}),(t-${start})/${CAPTION_FADE},` +
        `if(lt(${end}-t,${CAPTION_FADE}),(${end}-t)/${CAPTION_FADE},1))`;
      return [
        `drawtext=fontfile='${fontFile}'`,
        `text='${escapeDrawText(w.word)}'`,
        `fontsize=${size}`,
        "fontcolor=white",
        "borderw=" + Math.max(3, Math.round(size * 0.09)),
        "bordercolor=black@0.85",
        "x=(w-text_w)/2",
        `y=(h-text_h)/2`,
        `alpha='${alpha}'`,
        `enable='between(t,${start},${end})'`,
      ].join(":");
    })
    .join(",");
}
