import { describe, expect, it } from "vitest";

import { calibrationMode, charWindow, perSceneChars, sceneDeltas } from "./calibration";
import { predictSeconds } from "./voice-rate";

/**
 * LONGUEUR DU SCRIPT SOURCE : le seul garde-fou qui empêche de reproduire les
 * deux dérives déjà vues (73 s puis 42 s pour une cible de 62 s).
 */

/** Débit RÉELLEMENT MESURÉ de la voix française, en caractères/seconde à 1,0. */
const FR_CPS = 10.9;
const TARGET = 62;
const SCENES = 8;
const LO = 58;
const HI = 66;

/** Fenêtre de narration telle que la calcule buildScript, CTA exclu. */
function narrationWindow(targetSeconds: number, cps: number, speed = 1, cta = false) {
  const ctaSeconds = cta ? 6 : 0;
  const lo = Math.max(8, targetSeconds - 2 - ctaSeconds);
  const hi = Math.max(lo + 2, Math.round(targetSeconds * 1.1) - ctaSeconds);
  return charWindow(lo, hi, cps, speed);
}

describe("longueur du script source", () => {
  it("le budget par plan vaut durée ÷ plans × débit mesuré", () => {
    const w = narrationWindow(TARGET, FR_CPS);
    expect(perSceneChars(w, SCENES)).toBeGreaterThanOrEqual(75);
    expect(perSceneChars(w, SCENES)).toBeLessThanOrEqual(95);
  });

  it("un script au budget tombe dans 58-66 s", () => {
    const w = narrationWindow(TARGET, FR_CPS);
    const seconds = predictSeconds(w.target, FR_CPS, 1);
    expect(seconds).toBeGreaterThanOrEqual(LO);
    expect(seconds).toBeLessThanOrEqual(HI);
  });

  it("le script réel de 42 s est rejeté et l'écart par plan est chiffré", () => {
    const w = narrationWindow(TARGET, FR_CPS);
    // Les huit plans produits lors du test client (trop courts).
    const shortScript = [
      "Le monstre à un œil de l'Odyssée dort sous la terre en Sicile.",
      "Dans des grottes très profondes, des bergers ont déterré d'énormes crânes de pierre.",
      "Ces têtes en pierre sont 2 fois plus grosses qu'un crâne humain.",
      "En plein milieu du front, il y a un trou rond.",
      "Pour les anciens Grecs, ce trou était l'œil unique d'un cyclope.",
      "Sauf que les vrais yeux sont minuscules et cachés sur les côtés.",
      "Cette ouverture au milieu du front est le trou du nez pour sa trompe.",
      "Ce monstre vieux de 2500 ans était un éléphant nain haut d'un mètre.",
    ];
    const chars = shortScript.join("").length;
    expect(calibrationMode(chars, w)).toBe("lengthen");
    const deltas = sceneDeltas(shortScript, w);
    // Chaque plan reçoit un nombre exact de caractères manquants.
    expect(deltas).toHaveLength(SCENES);
    expect(deltas.every((d) => d.delta > 0)).toBe(true);
  });

  it("un script deux fois trop long est rejeté aussi", () => {
    const w = narrationWindow(TARGET, FR_CPS);
    expect(calibrationMode(w.max * 2, w)).toBe("shorten");
  });
});
