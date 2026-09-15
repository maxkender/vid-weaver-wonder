/**
 * CALIBRAGE DES LONGUEURS DE TEXTE — unité unique : le CARACTÈRE.
 *
 * Toute la chaîne de durée se calcule en caractères par seconde (débit
 * RÉELLEMENT MESURÉ de la voix), jamais en mots par seconde : la table
 * WORDS_PER_SECOND de duration.ts ne sert plus qu'aux estimations d'affichage.
 * Un mot français pèse ~5,5 caractères : confondre les deux unités divise le
 * budget par cinq et produit des vidéos deux fois trop courtes.
 */

import { charBudget, predictSeconds } from "./voice-rate";
import { fallbackCharsPerSecond } from "./duration";

/** Fenêtre de longueur de texte, en caractères espaces compris. */
export type CharWindow = { min: number; target: number; max: number };

/**
 * Nombre de caractères tenant dans la fenêtre de durée [loSec, hiSec] pour
 * une voix dont le débit mesuré est `cps`, synthétisée à `speed`.
 */
export function charWindow(loSec: number, hiSec: number, cps: number, speed = 1): CharWindow {
  const min = charBudget(loSec, cps, speed);
  const max = charBudget(hiSec, cps, speed);
  return { min, max, target: Math.round((min + max) / 2) };
}

/** Sens de la correction à demander au modèle pour ce texte. */
export type CalibrationMode = "ok" | "shorten" | "lengthen";

export function calibrationMode(chars: number, w: CharWindow): CalibrationMode {
  if (chars > w.max) return "shorten";
  if (chars < w.min) return "lengthen";
  return "ok";
}

/** Écart de durée à la fenêtre, en secondes (0 quand le texte est dans la cible). */
export function secondsGap(chars: number, w: CharWindow, cps: number, speed = 1) {
  const sec = predictSeconds(chars, cps, speed);
  const lo = predictSeconds(w.min, cps, speed);
  const hi = predictSeconds(w.max, cps, speed);
  return sec < lo ? lo - sec : sec > hi ? sec - hi : 0;
}

/** Caractères parlés d'un ensemble de narrations. */
export function narrationChars(texts: (string | undefined)[]) {
  return texts.reduce((n, t) => n + (t ?? "").trim().length, 0);
}

/** Budget de caractères d'UN plan : durée cible ÷ nombre de plans × débit mesuré. */
export function perSceneChars(w: CharWindow, sceneCount: number) {
  return Math.max(40, Math.round(w.target / Math.max(1, sceneCount)));
}

/**
 * Source unique du budget d'UN plan traduit, en caractères espaces compris.
 * Le débit mesuré est prioritaire. Sans mesure, le débit en mots est d'abord
 * converti en caractères/seconde avec la longueur moyenne d'un mot de la langue.
 */
export function targetCharsPerShot(
  language: string,
  targetSeconds: number,
  shotCount: number,
  measuredCharsPerSecond?: number | null,
  speed = 1,
) {
  const cps =
    measuredCharsPerSecond && measuredCharsPerSecond >= 3
      ? measuredCharsPerSecond
      : fallbackCharsPerSecond(language);
  return Math.max(40, Math.round((targetSeconds / Math.max(1, shotCount)) * cps * speed));
}

/** Assertion chargée avec le module : 64 s / 8 plans à 10,9 car/s vaut ~87 car/plan. */
function assertTranslationBudgetUnits() {
  const frenchBudget = targetCharsPerShot("fr", 64, 8, 10.9);
  if (frenchBudget < 70 || frenchBudget > 95) {
    throw new Error(`Budget de traduction invalide (fr) : ${frenchBudget} caractères/plan`);
  }
  const measuredByLanguage: Record<string, number> = {
    fr: 10.9,
    en: 8.7,
    es: 7.1,
    de: 7.7,
    it: 8.3,
  };
  for (const [language, cps] of Object.entries(measuredByLanguage)) {
    const budget = targetCharsPerShot(language, 64, 8, cps);
    const predicted = predictSeconds(budget * 8, cps);
    if (Math.abs(predicted - 64) / 64 > 0.05) {
      throw new Error(`Budget de traduction incohérent (${language}) : ${predicted.toFixed(1)} s`);
    }
  }
}

assertTranslationBudgetUnits();

/**
 * Écart plan par plan au budget : combien de caractères il MANQUE (positif) ou
 * sont EN TROP (négatif) dans chaque narration. C'est ce qu'on donne au modèle
 * pour qu'il corrige précisément au lieu de réécrire au jugé.
 */
export function sceneDeltas(texts: (string | undefined)[], w: CharWindow) {
  const per = perSceneChars(w, texts.length);
  return texts.map((t, index) => {
    const chars = (t ?? "").trim().length;
    return { index, chars, target: per, delta: per - chars };
  });
}
