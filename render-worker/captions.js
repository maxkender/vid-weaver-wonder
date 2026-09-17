/**
 * Sous-titres mot par mot, alignés sur les horodatages ElevenLabs.
 *
 * Règles reprises TELLES QUELLES de src/lib/karaoke-overlay.ts :
 * - un seul mot à l'écran, affiché en minuscules ;
 * - fusion avec le mot suivant quand sa fenêtre dure moins de 0,25 s
 *   (le début d'un mot n'est JAMAIS décalé) ;
 * - police Poppins 800, blanc, contour sombre fin, ombre portée ;
 * - taille calculée sur le CÔTÉ DU CARRÉ, centré horizontalement et
 *   verticalement dans la fenêtre carrée.
 *
 * Le navigateur dessine un PNG par mot ; ici on produit un fichier ASS
 * incrusté par le filtre `subtitles`, ce qui donne le même rendu.
 */
import { CAPTION_MAX_WIDTH_RATIO, CAPTION_SIZE_RATIO, squareBox } from "./geometry.js";

/** Tenue minimale d'un mot à l'écran avant fusion avec le suivant. */
export const MIN_CAPTION_HOLD = 0.25;
/** Nombre maximal de mots affichés ensemble (2 uniquement en cas de fusion). */
const MAX_GROUP_WORDS = 2;
/** Longueur maximale d'un groupe (une seule ligne). */
const MAX_GROUP_CHARS = 18;
/** Léger devancement : le texte apparaît juste avant la syllabe. */
const LEAD_IN = 0.05;

/**
 * PONCTUATION : on retire celle qui est collée au bord du mot (« : son »).
 * L'apostrophe et le trait d'union internes restent (l'été, au-dessus).
 */
const EDGE_PUNCT = /^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$/gu;
const hasLetterOrDigit = (w) => /[\p{L}\p{N}]/u.test(w ?? "");
const cleanWord = (w) =>
  String(w ?? "").replace(/[«»"]/g, "").replace(EDGE_PUNCT, "").replace(/\s+/g, " ").trim();


/**
 * Fenêtre utile de la voix off : du premier au dernier mot réellement prononcé.
 * Identique à voiceWindow() du studio.
 */
export function voiceWindow(words, duration) {
  const valid = (words ?? []).filter((w) => w?.word && w.end > w.start && w.start < duration + 1);
  if (!valid.length) return { start: 0, end: duration };
  const first = valid.reduce((a, b) => (b.start < a.start ? b : a));
  const last = valid.reduce((a, b) => (b.end > a.end ? b : a));
  const start = Math.max(0, Math.min(first.start - 0.08, duration - 0.5));
  const end = Math.min(duration, Math.max(last.end + 0.15, start + 0.6));
  return { start, end };
}

/** Décale les timings pour coller à l'audio rogné. */
export function shiftTimings(words, offset) {
  if (!words?.length || !offset) return words ?? [];
  return words.map((w) => ({
    word: w.word,
    start: Math.max(0, w.start - offset),
    end: Math.max(0.05, w.end - offset),
  }));
}

/**
 * Groupes affichés : un mot par groupe, fusion uniquement des fenêtres < 0,25 s,
 * puis continuité (un groupe reste affiché jusqu'au suivant).
 */
export function smoothTimings(timings, duration) {
  const raw = (timings ?? [])
    .filter((t) => t?.word && t.start >= 0 && t.start < duration + 0.5)
    .sort((a, b) => a.start - b.start);

  // Un token sans lettre ni chiffre est fusionné avec le mot suivant, en
  // gardant son début : le karaoké ne se décale jamais.
  const sorted = [];
  let pendingStart = null;
  for (const t of raw) {
    const word = cleanWord(t.word);
    if (!word || !hasLetterOrDigit(word)) {
      if (pendingStart === null) pendingStart = t.start;
      continue;
    }
    sorted.push({ word, start: pendingStart ?? t.start, end: t.end });
    pendingStart = null;
  }
  if (!sorted.length) return [];


  // Les timestamps ElevenLabs sont déjà calés sur l'audio : jamais réétirés.
  const scaled = sorted.map((t, i) => {
    const next = sorted[i + 1];
    const end = Math.max(next ? next.start : t.end, t.start + 0.06);
    return { word: t.word, start: t.start, end };
  });

  const text = (g) => g.items.join(" ");
  const groups = scaled.map((t) => ({ items: [t.word], start: t.start, end: t.end }));

  for (let i = 0; i < groups.length - 1; i++) {
    const g = groups[i];
    const next = groups[i + 1];
    if (next.start - g.start >= MIN_CAPTION_HOLD) continue;
    const canMerge =
      g.items.length + next.items.length <= MAX_GROUP_WORDS &&
      text(g).length + 1 + text(next).length <= MAX_GROUP_CHARS;
    if (!canMerge) continue;
    g.items = [...g.items, ...next.items];
    g.end = next.end;
    groups.splice(i + 1, 1);
    i--;
  }

  return groups.map((g, i) => {
    const next = groups[i + 1];
    const start = Math.max(0, g.start - LEAD_IN);
    const end = next
      ? Math.max(next.start - LEAD_IN, start + 0.18)
      : Math.min(duration, Math.max(g.end, start + 0.5));
    return { word: text(g), start, end };
  });
}

/** h:mm:ss.cc, format des temps ASS. */
function assTime(t) {
  const s = Math.max(0, t);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${sec.toFixed(2).padStart(5, "0")}`;
}

/** Largeur approximative d'un texte en Poppins ExtraBold. */
const approxWidth = (text, fontSize) => text.length * fontSize * 0.58;

const escapeAss = (t) => t.replace(/\\/g, "\\\\").replace(/\{/g, "(").replace(/\}/g, ")");

/**
 * Fichier ASS complet pour un plan. Renvoie null si aucun mot.
 * `fontName` doit être installée dans le conteneur (Poppins ExtraBold).
 */
export function buildAss(groups, { width, height, fontName = "Poppins", geometry }) {
  if (!groups?.length) return null;
  const { side, centerY } = squareBox(width, height, geometry);
  const baseSize = Math.round(side * CAPTION_SIZE_RATIO * (geometry?.captionScale ?? 1));
  const maxWidth = side * CAPTION_MAX_WIDTH_RATIO;
  // Contour : le navigateur trace un lineWidth centré, donc la moitié déborde.
  const outline = Math.max(2, Math.round(Math.max(4, baseSize * 0.06) / 2));
  const shadow = Math.max(1, Math.round(baseSize * 0.08));

  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    "WrapStyle: 2",
    "ScaledBorderAndShadow: yes",
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Mot,${fontName},${baseSize},&H00FFFFFF,&H00FFFFFF,&H001F1F1F,&H8C000000,-1,0,0,0,100,100,0,0,1,${outline},${shadow},5,0,0,0,1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];

  const events = groups
    .filter((g) => g.end > g.start && g.word)
    .map((g) => {
      // Une seule ligne : on réduit la police si le mot est trop large,
      // exactement comme le canvas du navigateur.
      let size = baseSize;
      while (size > 18 && approxWidth(g.word, size) > maxWidth) size -= 2;
      const override = size !== baseSize ? `{\\fs${size}}` : "";
      return `Dialogue: 0,${assTime(g.start)},${assTime(g.end)},Mot,,0,0,0,,{\\pos(${Math.round(width / 2)},${Math.round(centerY)})}${override}${escapeAss(g.word.toLocaleLowerCase())}`;
    });

  return `${header.join("\n")}\n${events.join("\n")}\n`;
}
