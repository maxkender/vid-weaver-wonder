/**
 * Une image PNG transparente + sa fenêtre d'affichage.
 * UN PNG par mot affiché (et par palier d'animation du logo) : on ne dessine
 * plus une image par frame, ce qui divise par ~10 le nombre de fichiers
 * envoyés à FFmpeg et supprime les plantages mémoire sur les longues vidéos.
 */
export type CaptionCue = { blob: Blob; start: number; end: number };

/** Charge la police d'affichage avant de dessiner (sinon canvas retombe sur Arial). */
async function ensureFont(size: number) {
  try {
    await (document as unknown as { fonts: FontFaceSet }).fonts.load(`800 ${size}px Poppins`);
  } catch {
    /* police indisponible : on garde la fallback */
  }
}

/**
 * Taille de police des sous-titres, RELATIVE AU CÔTÉ DU CARRÉ (et non à la
 * largeur du cadre) : la proportion texte/carré reste identique quelle que
 * soit la marge choisie, et rien ne déborde sur les bandes noires.
 * Référence @geccoapp : 13,5 % du côté du carré.
 */
export const CAPTION_SIZE_RATIO = 0.135;
/** Largeur maximale d'une ligne, relative au côté du carré (0.86 / 0.88). */
export const CAPTION_MAX_WIDTH_RATIO = 0.86 / 0.88;

/** On garde la casse d'origine (majuscule de début de phrase, noms propres). */
const cleanWord = (w: string) =>
  w.replace(/[«»"]/g, "").replace(/\s+/g, " ").trim();

/**
 * Dessine la phrase sur une seule ligne, en blanc uni, sans zoom.
 */
function drawWord(
  ctx: CanvasRenderingContext2D,
  word: string,
  width: number,
  height: number,
  scale = 1,
  alpha = 1,
) {
  const words = cleanWord(word).split(" ").filter(Boolean).map((item) => item.toLocaleLowerCase());
  if (!words.length) return;
  const clean = words.join(" ");
  // Tout est calé sur le CÔTÉ DU CARRÉ : le texte ne sort jamais de la fenêtre.
  const side = squareSide(width, height);
  let fontSize = Math.round(side * CAPTION_SIZE_RATIO);
  const maxWidth = side * CAPTION_MAX_WIDTH_RATIO;
  const font = (s: number) => `800 ${s}px "Poppins", "Nunito", "Baloo 2", sans-serif`;
  ctx.font = font(fontSize);

  // Toujours une seule ligne : on réduit légèrement la police si nécessaire.
  while (fontSize > 18 && ctx.measureText(clean).width > maxWidth) {
    fontSize -= 2;
    ctx.font = font(fontSize);
  }

  const cx = width / 2;
  const cy = squareBox(width, height).centerY;

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.font = font(fontSize);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";

  const space = ctx.measureText(" ").width;
  const widths = words.map((w) => ctx.measureText(w).width);
  const total = widths.reduce((a, b) => a + b, 0) + space * (words.length - 1);
  let x = -total / 2;

  // Ombre portée douce (une seule passe sur la phrase entière).
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = fontSize * 0.42;
  ctx.shadowOffsetY = fontSize * 0.08;
  ctx.fillStyle = "rgba(0,0,0,0.9)";
  ctx.fillText(clean, x, 0);
  ctx.restore();

  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  ctx.lineWidth = Math.max(4, fontSize * 0.06);
  ctx.strokeStyle = "rgba(0,0,0,0.88)";
  ctx.fillStyle = "#ffffff";

  words.forEach((w, i) => {
    ctx.strokeText(w, x, 0);
    ctx.fillText(w, x, 0);
    x += widths[i]! + space;
  });
  ctx.restore();
}


/** Charge (et mémorise) le logo Sophia pour l'incruster dans les frames. */
const logoCache = new Map<string, HTMLImageElement>();
export async function loadLogo(url: string): Promise<HTMLImageElement | null> {
  const hit = logoCache.get(url);
  if (hit) return hit;
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = url;
    await img.decode();
    logoCache.set(url, img);
    return img;
  } catch {
    return null;
  }
}

/** Logo Sophia qui « pop » en haut du cadre pendant la mention de la marque. */
function drawLogo(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  width: number,
  height: number,
  progress: number,
) {
  const eased = 1 - Math.pow(1 - Math.max(0, Math.min(1, progress)), 3);
  const scale = 0.7 + 0.3 * eased + 0.06 * Math.sin(Math.PI * Math.min(1, progress));
  const size = width * 0.34 * scale;
  const cx = width / 2;
  const cy = height * 0.26;
  ctx.save();
  ctx.globalAlpha = Math.min(1, progress * 3);
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = size * 0.18;
  ctx.shadowOffsetY = size * 0.05;
  ctx.drawImage(img, cx - size / 2, cy - size / 2, size, size);
  ctx.restore();
}

async function renderPng(
  width: number,
  height: number,
  word: string | null,
  scale = 1,
  logo?: { img: CanvasImageSource; progress: number } | null,
  alpha = 1,
): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  if (logo) drawLogo(ctx, logo.img, width, height, logo.progress);
  if (word) {
    await ensureFont(Math.round(squareSide(width, height) * CAPTION_SIZE_RATIO));
    drawWord(ctx, word, width, height, scale, alpha);
  }

  return await new Promise<Blob | null>((r) => canvas.toBlob((b) => r(b), "image/png"));
}


/**
 * Marge latérale de la fenêtre carrée (fraction de la largeur, de chaque côté).
 * SOURCE UNIQUE DE VÉRITÉ : masque du montage, pré-composition avant animation,
 * aperçu de l'interface et sous-titres en dépendent tous.
 * Référence @geccoapp : 0.036 → côté = 92,8 % de la largeur.
 */
export const SQUARE_MARGIN_RATIO = 0.036;
/** Rayon des coins de la fenêtre carrée (fraction du côté). */
export const SQUARE_RADIUS_RATIO = 0.1;
/** Décalage du centre du carré, relatif à la hauteur du cadre (négatif = vers le haut). */
export const SQUARE_CENTER_OFFSET_RATIO = -0.0475;

/** Côté de la fenêtre carrée centrée dans un cadre width × height. */
export function squareSide(width: number, height: number) {
  return Math.round(Math.min(width * (1 - 2 * SQUARE_MARGIN_RATIO), height));
}

/** Géométrie complète de la fenêtre carrée, source unique pour tous les rendus. */
export function squareBox(width: number, height: number) {
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

/**
 * Masque carré à coins arrondis : tout ce qui dépasse du carré centré devient noir.
 * La fenêtre garde toujours la même marge à gauche et à droite, sur toute la vidéo.
 */
export async function makeRoundedSquareMask(
  width: number,
  height: number,
  radiusRatio = SQUARE_RADIUS_RATIO,
): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const box = squareBox(width, height);
  const { side, x, y } = box;
  const r = radiusRatio === SQUARE_RADIUS_RATIO ? box.radius : side * radiusRatio;


  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  // roundRect n'est pas partout : tracé manuel.
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + side - r, y);
  ctx.quadraticCurveTo(x + side, y, x + side, y + r);
  ctx.lineTo(x + side, y + side - r);
  ctx.quadraticCurveTo(x + side, y + side, x + side - r, y + side);
  ctx.lineTo(x + r, y + side);
  ctx.quadraticCurveTo(x, y + side, x, y + side - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();

  return await new Promise<Blob | null>((r2) => canvas.toBlob((b) => r2(b), "image/png"));
}

/**
 * Répartit les mots sur la durée réelle de la voix off.
 * Le poids d'un mot tient compte de sa longueur ET des pauses de ponctuation,
 * pour que le texte ne défile pas plus vite que la voix.
 */
export function wordTimings(text: string, duration: number) {
  const words = (text ?? "").trim().split(/\s+/).filter(Boolean);
  if (!words.length || !(duration > 0.3)) return [] as { word: string; start: number; end: number }[];

  const lead = Math.min(0.35, duration * 0.08);
  const tail = Math.min(0.2, duration * 0.04);
  const usable = Math.max(0.1, duration - lead - tail);

  const weights = words.map((w) => {
    const letters = w.replace(/[^\p{L}\p{N}]/gu, "").length;
    let weight = Math.max(2, letters) + 2; // coût fixe d'attaque du mot
    if (/[,;:]$/.test(w)) weight += 3;
    if (/[.!?…]$/.test(w)) weight += 5.5;
    return weight;
  });
  const total = weights.reduce((a, b) => a + b, 0);

  const out: { word: string; start: number; end: number }[] = [];
  let t = lead;
  for (let i = 0; i < words.length; i++) {
    const span = (weights[i]! / total) * usable;
    out.push({ word: words[i]!, start: t, end: Math.min(duration - tail, t + span) });
    t += span;
  }
  return out;
}

// Paliers d'animation du logo Sophia (le mot, lui, est toujours à l'échelle 1).
const LOGO_STEPS = 6;
/** Durée du fondu d'apparition d'un mot (secondes) — utilisée par l'aperçu. */
export const CAPTION_FADE = 0.08;

/**
 * Tenue minimale d'un mot à l'écran. En dessous (micro-mots « a », « de »,
 * « le »), le mot est FUSIONNÉ avec le suivant : on ne décale jamais son
 * début, sinon le texte se désynchronise de la voix.
 */
export const MIN_CAPTION_HOLD = 0.25;
/** Nombre maximal de mots affichés ensemble (2 uniquement en cas de fusion). */
const MAX_GROUP_WORDS = 2;
/** Longueur maximale d'un groupe (une seule ligne). */
const MAX_GROUP_CHARS = 18;
/** Léger devancement : le texte apparaît juste avant la syllabe (perçu comme synchro). */
const LEAD_IN = 0.05;

/**
 * Rend les timings continus, calés sur la voix :
 *  1. recalage proportionnel sur la durée réelle de l'audio ;
 *  2. découpage en courtes phrases lisibles (ponctuation + rythme de la voix) ;
 *  3. fusion des groupes trop brefs pour éviter tout clignotement ;
 *  4. chaque groupe reste affiché jusqu'au suivant.
 */
export function smoothTimings(
  timings: { word: string; start: number; end: number }[],
  duration: number,
  preserveExact = false,
) {
  const sorted = [...timings]
    .filter((t) => t.word && t.start >= 0 && t.start < duration + 0.5)
    .sort((a, b) => a.start - b.start);
  if (!sorted.length) return [];

  // 1. Les timestamps ElevenLabs sont déjà calés sur l'audio : ne jamais les
  // étirer pour remplir le silence final. Le recalage reste réservé au fallback estimé.
  const last = sorted[sorted.length - 1]!;
  const span = Math.max(last.end, last.start + 0.1);
  const factor = preserveExact
    ? 1
    : span > 0.5 && duration > 0.5
      ? Math.min(1.35, Math.max(0.75, duration / span))
      : 1;
  const scaled = sorted.map((t, i) => {
    const next = sorted[i + 1];
    const start = t.start * factor;
    const end = Math.max(next ? next.start * factor : t.end * factor, start + 0.06);
    return { word: t.word, start, end };
  });

  // 2. Un mot par groupe : on reste strictement mot par mot.
  type Item = { word: string; start: number; end: number };
  type G = { items: Item[]; start: number; end: number };
  const text = (g: G) => g.items.map((i) => i.word).join(" ");
  const groups: G[] = scaled.map((t) => ({ items: [t], start: t.start, end: t.end }));

  // 3. Fusion — et UNIQUEMENT la fusion — des mots tenus moins de 0,25 s.
  // La fenêtre réelle d'un mot va de son début à celui du mot suivant. Si elle
  // est trop courte, le mot est affiché EN MÊME TEMPS que le suivant ; son
  // début, lui, n'est jamais décalé (sinon le texte quitte la voix).
  for (let i = 0; i < groups.length - 1; i++) {
    const g = groups[i]!;
    const next = groups[i + 1]!;
    const window = next.start - g.start;
    if (window >= MIN_CAPTION_HOLD) continue;
    const canMerge =
      g.items.length + next.items.length <= MAX_GROUP_WORDS &&
      text(g).length + 1 + text(next).length <= MAX_GROUP_CHARS;
    if (!canMerge) continue;
    g.items = [...g.items, ...next.items];
    g.end = next.end;
    groups.splice(i + 1, 1);
    i--; // le groupe fusionné peut être encore trop court
  }


  // 4. Continuité : un groupe reste affiché jusqu'au suivant (aucun trou noir),
  // et chaque mot du groupe garde son propre timing pour le surlignage karaoké.
  return groups.map((g, i) => {
    const next = groups[i + 1];
    const start = Math.max(0, g.start - LEAD_IN);
    const end = next
      ? Math.max(next.start - LEAD_IN, start + 0.18)
      : Math.min(duration, Math.max(g.end, start + 0.5));
    const words = g.items.map((it, k) => {
      const nx = g.items[k + 1];
      return {
        word: it.word,
        start: k === 0 ? start : it.start - LEAD_IN,
        end: nx ? nx.start - LEAD_IN : end,
      };
    });
    return { word: text(g), start, end, words };
  });
}




/**
 * Sous-titres prêts pour FFmpeg : UN PNG par mot affiché, avec sa fenêtre
 * temporelle (au lieu d'une image par frame). Le dessin est strictement le
 * même qu'avant (Poppins 800, blanc, contour sombre fin, centré dans le carré) :
 * le rendu à l'écran est indiscernable, seule la mécanique change.
 *
 * Le logo Sophia, lui, est animé : il est produit en cues séparées (une par
 * palier d'animation) superposées EN PLUS des cues de texte.
 */
export async function makeCaptionCues(
  text: string,
  width: number,
  height: number,
  duration: number,
  exactTimings?: { word: string; start: number; end: number }[] | null,
  logo?: { url: string; start: number; end: number } | null,
): Promise<CaptionCue[] | null> {
  const timings = smoothTimings(
    exactTimings && exactTimings.length
      ? exactTimings.filter((t) => t.end > t.start)
      : wordTimings(text, duration),
    duration,
    Boolean(exactTimings?.length),
  );

  const cues: CaptionCue[] = [];

  // 1. Un PNG par mot affiché.
  const cache = new Map<string, Blob>();
  for (const t of timings) {
    const start = Math.max(0, t.start);
    const end = Math.min(duration, Math.max(t.end, start + 0.08));
    if (end <= start) continue;
    let blob = cache.get(t.word);
    if (!blob) {
      const made = await renderPng(width, height, t.word);
      if (!made) continue;
      cache.set(t.word, made);
      blob = made;
    }
    cues.push({ blob, start, end });
  }

  // 2. Logo Sophia : quelques paliers d'animation, jamais une image par frame.
  const logoImg = logo ? await loadLogo(logo.url) : null;
  if (logo && logoImg) {
    const start = Math.max(0, logo.start);
    const end = Math.min(duration, logo.end);
    const ramp = Math.min(0.35, Math.max(0.12, (end - start) * 0.4));
    const stepDur = ramp / LOGO_STEPS;
    for (let k = 0; k < LOGO_STEPS; k++) {
      const progress = (k + 1) / LOGO_STEPS;
      const blob = await renderPng(width, height, null, 1, {
        img: logoImg as CanvasImageSource,
        progress,
      });
      if (!blob) continue;
      const s = start + k * stepDur;
      // Le dernier palier (logo complètement apparu) tient jusqu'à la fin.
      const e = k === LOGO_STEPS - 1 ? end : Math.min(end, s + stepDur);
      if (e > s) cues.push({ blob, start: s, end: e });
    }
  }

  return cues.length ? cues : null;
}

/**
 * Fenêtre d'apparition du logo Sophia : dès que la voix prononce « Sophia »,
 * le logo pop et reste ~2,5 s (ou jusqu'à la fin du plan).
 */
export function sophiaWindow(
  text: string,
  duration: number,
  exactTimings?: { word: string; start: number; end: number }[] | null,
): { start: number; end: number } | null {
  const norm = (s: string) =>
    s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (!/sophia/.test(norm(text ?? ""))) return null;
  const timings =
    exactTimings && exactTimings.length ? exactTimings : wordTimings(text, duration);
  const hit = timings.find((t) => norm(t.word).includes("sophia"));
  const start = hit ? Math.max(0, hit.start - 0.1) : Math.max(0, duration * 0.55);
  return { start, end: Math.min(duration, start + 2.8) };
}

/**
 * Fenêtre utile de la voix off : du premier au dernier mot réellement prononcé.
 * Sert à couper les silences (parfois plusieurs secondes) que la synthèse laisse
 * au début et à la fin du plan, sans jamais décaler le karaoké.
 */
export function voiceWindow(
  words: { word: string; start: number; end: number }[] | null | undefined,
  duration: number,
): { start: number; end: number } {
  const valid = (words ?? []).filter((w) => w.word && w.end > w.start && w.start < duration + 1);
  if (!valid.length) return { start: 0, end: duration };
  const first = valid.reduce((a, b) => (b.start < a.start ? b : a));
  const last = valid.reduce((a, b) => (b.end > a.end ? b : a));
  const start = Math.max(0, Math.min(first.start - 0.08, duration - 0.5));
  const end = Math.min(duration, Math.max(last.end + 0.15, start + 0.6));
  return { start, end };
}

/** Décale les timings pour coller à l'audio rogné. */
export function shiftTimings(
  words: { word: string; start: number; end: number }[] | null | undefined,
  offset: number,
) {
  if (!words?.length || !offset) return words ?? [];
  return words.map((w) => ({
    word: w.word,
    start: Math.max(0, w.start - offset),
    end: Math.max(0.05, w.end - offset),
  }));
}
