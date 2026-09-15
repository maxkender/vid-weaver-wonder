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

import { fallbackCharsPerSecond } from "./duration";

/** Valeurs de repli explicites, converties depuis mots/s × caractères/mot. */
export const DEFAULT_CHARS_PER_SECOND: Record<string, number> = Object.fromEntries(
  ["fr", "en", "es", "de", "it", "pt"].map((lang) => [lang, fallbackCharsPerSecond(lang)]),
);

/** Vitesse de synthèse : jamais en dessous, une voix ralentie tue le rythme. */
export const MIN_VOICE_SPEED = 0.95;

/** Nombre de passes de condensation autorisées sur une langue. */
export const MAX_CONDENSE_PASSES = 3;

/** Cumuls d'une voix, TOUJOURS ramenés à la vitesse de synthèse 1,0. */
export type VoiceRate = { chars: number; seconds: number; takes: number };
/** Clé de mémorisation : une voix a un débit différent par langue. */
export const rateKey = (voiceId: string, language: string) =>
  `${voiceId}:${language.slice(0, 2).toLowerCase()}`;

export function defaultCharsPerSecond(language = "fr") {
  const lang = language.slice(0, 2).toLowerCase();
  return DEFAULT_CHARS_PER_SECOND[lang] ?? fallbackCharsPerSecond(lang);
}

/**
 * Débit à utiliser (caractères par seconde à la vitesse 1,0) : mesuré si cette
 * voix a déjà été entendue, sinon la valeur de départ de la langue. Les
 * mesures aberrantes sont ignorées.
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

/** Durée prédite d'un texte à une vitesse de synthèse donnée. */
export function predictSeconds(chars: number, cps: number, speed = 1) {
  if (cps <= 0) return 0;
  return chars / (cps * (speed || 1));
}

/** Budget de caractères tenant dans une durée, pour cette voix à cette vitesse. */
export function charBudget(seconds: number, cps: number, speed = 1) {
  return Math.max(40, Math.round(seconds * cps * (speed || 1)));
}

/** Durée d'une prise ramenée à la vitesse 1,0, pour la mémorisation. */
export function normalizeSeconds(seconds: number, speed = 1) {
  return seconds * (speed || 1);
}
