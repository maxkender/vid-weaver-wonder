/**
 * DÉBIT RÉEL D'UNE VOIX : caractères lus par seconde.
 *
 * Le nombre de mots par seconde (src/lib/duration.ts) ne suffit pas : à nombre
 * de caractères identique, une voix espagnole peut mettre 87 s là où une voix
 * allemande en met 81. Le seul débit fiable est celui MESURÉ sur les prises
 * déjà générées avec CETTE voix, dans CETTE langue.
 *
 * Ce module ne contient que le calcul : la mémorisation partagée (base de
 * données, donc lisible aussi par le service de nuit) est dans
 * voice-rate.server.ts / voice-rate.functions.ts.
 */

/**
 * Valeurs de départ, relevées sur une vraie production multilingue
 * (caractères ÷ durée mesurée de l'audio ElevenLabs).
 * Elles ne servent que tant qu'une voix n'a aucun historique.
 */
export const DEFAULT_CHARS_PER_SECOND: Record<string, number> = {
  fr: 10.9,
  en: 8.7,
  es: 7.1,
  de: 7.7,
  it: 8.3,
  pt: 8.5,
};

const FALLBACK_CPS = 9;

/** Vitesse de synthèse : jamais en dessous, une voix ralentie tue le rythme. */
export const MIN_VOICE_SPEED = 0.95;

/** Nombre de passes de condensation autorisées sur une langue. */
export const MAX_CONDENSE_PASSES = 3;

export type VoiceRate = { chars: number; seconds: number; takes: number };
/** Clé de mémorisation : une voix a un débit différent par langue. */
export const rateKey = (voiceId: string, language: string) =>
  `${voiceId}:${language.slice(0, 2).toLowerCase()}`;

export function defaultCharsPerSecond(language = "fr") {
  return DEFAULT_CHARS_PER_SECOND[language.slice(0, 2).toLowerCase()] ?? FALLBACK_CPS;
}

/**
 * Débit à utiliser : mesuré si cette voix a déjà été entendue, sinon la valeur
 * de départ de la langue. Les mesures aberrantes sont ignorées.
 */
export function charsPerSecond(
  language: string,
  measured?: VoiceRate | null | undefined,
): number {
  if (measured && measured.seconds > 1 && measured.chars > 20) {
    const cps = measured.chars / measured.seconds;
    if (cps >= 3 && cps <= 25) return cps;
  }
  return defaultCharsPerSecond(language);
}

/** Durée prédite d'un texte, d'après le débit mesuré de la voix. */
export function predictSeconds(chars: number, cps: number, speed = 1, baseSpeed = 1) {
  if (cps <= 0) return 0;
  // Le débit mesuré inclut déjà la vitesse à laquelle les prises ont été faites.
  return (chars / cps) * (baseSpeed / (speed || 1));
}

/** Budget de caractères tenant dans une durée, pour cette voix. */
export function charBudget(seconds: number, cps: number, speed = 1, baseSpeed = 1) {
  return Math.max(40, Math.round(seconds * cps * ((speed || 1) / baseSpeed)));
}
