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
