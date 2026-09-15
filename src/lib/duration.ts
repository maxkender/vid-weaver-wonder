/**
 * Débit de parole moyen (mots par seconde) par langue.
 * ATTENTION : ce n'est qu'un REPLI d'estimation, utilisé tant qu'aucune voix
 * off n'a été synthétisée. Dès qu'une voix réelle existe, c'est sa durée
 * mesurée (audioDuration / alignement ElevenLabs) qui fait foi.
 */
// Valeurs recalées sur un test réel à quatre langues (même script :
// fr 59,5 s, en 73,1 s, es 81,7 s) : l'anglais et l'espagnol étaient largement
// surestimés, ce qui faisait dériver la durée des versions traduites.
const WORDS_PER_SECOND: Record<string, number> = {
  fr: 3.2,
  en: 3.0,
  es: 2.9,
  de: 2.7,
  it: 3.3,
  pt: 3.0,
};

const DEFAULT_WPS = 3.0;

/** Longueur moyenne d'un mot, espace compris, utilisée uniquement en repli. */
export const AVERAGE_CHARS_PER_WORD: Record<string, number> = {
  fr: 5.5,
  en: 5.1,
  es: 5.4,
  de: 6.2,
  it: 5.5,
  pt: 5.5,
};

/**
 * SOURCE DE VÉRITÉ de la fourchette de durée cible.
 * Un script peut dépasser la durée demandée de 10 % au maximum : au-delà on
 * paie des secondes de clip pour rien (60 s demandées → 66 s tolérées).
 */
export const DURATION_TOLERANCE = 1.1;

/**
 * Plafond d'accélération de la voix off à la synthèse. Au-delà, la diction
 * se dégrade nettement. SOURCE DE VÉRITÉ (studio + page Paramètres).
 */
export const MAX_VOICE_SPEED = 1.15;

/** Fourchette acceptée pour une durée demandée, en secondes. */
export function durationRange(targetSeconds: number) {
  return { lo: targetSeconds, hi: Math.round(targetSeconds * DURATION_TOLERANCE) };
}

/** Débit de parole d'une langue (mots par seconde). */
export function wordsPerSecond(language = "fr") {
  return WORDS_PER_SECOND[language.slice(0, 2).toLowerCase()] ?? DEFAULT_WPS;
}

/**
 * Repli en caractères/seconde quand aucune mesure de voix n'existe encore.
 * La conversion explicite empêche de traiter un débit en mots comme des caractères.
 */
export function fallbackCharsPerSecond(language = "fr") {
  const lang = language.slice(0, 2).toLowerCase();
  return wordsPerSecond(lang) * (AVERAGE_CHARS_PER_WORD[lang] ?? 5.5);
}

/**
 * Débit le PLUS RAPIDE parmi plusieurs langues. Sert à dimensionner le script :
 * si le texte dure assez longtemps dans la langue la plus rapide, toutes les
 * autres versions atteignent forcément la durée cible.
 */
export function fastestWordsPerSecond(languages: string[], fallback = "fr") {
  const list = languages.length ? languages : [fallback];
  return Math.max(...list.map((l) => wordsPerSecond(l)));
}

/** Nombre de mots maximum tenant dans `seconds` secondes de voix off. */
export function maxWordsForSeconds(seconds: number, language = "fr") {
  return Math.max(4, Math.floor(seconds * wordsPerSecond(language)));
}

/** Durée de lecture ESTIMÉE d'un texte, selon la langue (repli uniquement). */
export function estimateSpeechSeconds(text: string, language = "fr") {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const wps = WORDS_PER_SECOND[language.slice(0, 2).toLowerCase()] ?? DEFAULT_WPS;
  return words / wps;
}

/** Durée réelle d'un fichier audio (data URL ou URL) en secondes. */
export function audioDuration(src: string): Promise<number> {
  return new Promise((resolve) => {
    const a = new Audio();
    a.preload = "metadata";
    a.onloadedmetadata = () => resolve(Number.isFinite(a.duration) ? a.duration : 0);
    a.onerror = () => resolve(0);
    a.src = src;
  });
}

/** Durée réelle d'un clip vidéo (data URL ou URL) en secondes. */
export function videoDuration(src: string): Promise<number> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") return resolve(0);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.onloadedmetadata = () => resolve(Number.isFinite(v.duration) ? v.duration : 0);
    v.onerror = () => resolve(0);
    v.src = src;
  });
}
