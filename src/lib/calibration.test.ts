import { describe, expect, it } from "vitest";

import { calibrationMode, charWindow, targetCharsPerShot } from "./calibration";
import { MASTER_LANGUAGE_IDS } from "./languages";
import { DEFAULT_CHARS_PER_SECOND, predictSeconds, charsPerSecond } from "./voice-rate";

/** Débits réellement mesurés sur les voix retenues (caractères/seconde à 1,0). */
const MEASURED: Record<string, number> = { fr: 10.9, en: 8.7, es: 7.1, de: 7.7, it: 8.3 };

const LO = 60;
const HI = 66;
const MID = (LO + HI) / 2;

describe("budget de caractères", () => {
  it("fr : 64 secondes sur 8 plans donnent 70 à 95 caractères par plan", () => {
      const budget = targetCharsPerShot("fr", 64, 8, 10.9);
      expect(budget).toBeGreaterThanOrEqual(70);
      expect(budget).toBeLessThanOrEqual(95);
  });

  for (const lang of MASTER_LANGUAGE_IDS) {
    it(`${lang} : le budget par plan prédit bien 64 secondes au total`, () => {
      const cps = MEASURED[lang] ?? DEFAULT_CHARS_PER_SECOND[lang]!;
      const budget = targetCharsPerShot(lang, 64, 8, cps);
      expect(predictSeconds(budget * 8, cps)).toBeGreaterThanOrEqual(64 * 0.95);
      expect(predictSeconds(budget * 8, cps)).toBeLessThanOrEqual(64 * 1.05);
    });
  }

  for (const lang of MASTER_LANGUAGE_IDS) {
    it(`${lang} : la cible tombe à ±5 % de la durée visée`, () => {
      const cps = MEASURED[lang] ?? DEFAULT_CHARS_PER_SECOND[lang]!;
      const w = charWindow(LO, HI, cps, 1);
      const predicted = predictSeconds(w.target, cps, 1);
      expect(Math.abs(predicted - MID) / MID).toBeLessThanOrEqual(0.05);
      expect(predictSeconds(w.min, cps, 1)).toBeCloseTo(LO, 0);
      expect(predictSeconds(w.max, cps, 1)).toBeCloseTo(HI, 0);
    });

    it(`${lang} : le budget reste entre 400 et 800 caractères`, () => {
      const cps = MEASURED[lang] ?? DEFAULT_CHARS_PER_SECOND[lang]!;
      const w = charWindow(LO, HI, cps, 1);
      expect(w.target).toBeGreaterThanOrEqual(400);
      expect(w.target).toBeLessThanOrEqual(800);
    });

    it(`${lang} : la correction est symétrique`, () => {
      const cps = MEASURED[lang] ?? DEFAULT_CHARS_PER_SECOND[lang]!;
      const w = charWindow(LO, HI, cps, 1);
      expect(calibrationMode(Math.round(w.min / 2), w)).toBe("lengthen");
      expect(calibrationMode(w.max * 2, w)).toBe("shorten");
      expect(calibrationMode(w.target, w)).toBe("ok");
    });
  }

  it("le débit mesuré prime sur la valeur par défaut", () => {
    // Mesure plausible (proche de la théorie) : elle fait foi.
    const cps = charsPerSecond("fr", { chars: 2000, seconds: 100, takes: 8 });
    expect(cps).toBeCloseTo(20, 2);
  });

  it("une mesure deux fois trop lente est écartée", () => {
    // Cas réel : caractères comptés à moitié → 9 c/s en français. Suivre cette
    // mesure donnerait un budget deux fois trop court (vidéo de 35 s).
    const polluted = charsPerSecond("fr", { chars: 900, seconds: 100, takes: 8 });
    expect(polluted).toBeGreaterThan(15);
  });

  it("un budget en MOTS par seconde serait cinq fois trop petit", () => {
    // Garde-fou d'unité : 63 s × 3,2 mots/s = 202 « caractères » — absurde.
    const w = charWindow(LO, HI, MEASURED['fr']!, 1);
    expect(w.target).toBeGreaterThan(3 * Math.round(MID * 3.2));
  });
});
