import { describe, expect, it } from "vitest";

import {
  activeSlideshowFormats,
  findOverlongSlides,
  MAX_MOTS_PAR_SLIDE,
  pickSlideshowFormat,
  SLIDESHOW_FORMATS,
  slideshowFormatById,
  slideshowWritingBrief,
} from "./slideshow-formats";

describe("catalogue des formats", () => {
  it("active les six formats", () => {
    expect(activeSlideshowFormats()).toHaveLength(6);
  });

  it("déclare les six formats", () => {
    expect(SLIDESHOW_FORMATS).toHaveLength(6);
  });

  it("donne à chaque format des bornes de slides cohérentes", () => {
    for (const f of SLIDESHOW_FORMATS) {
      expect(f.slides.min).toBeGreaterThan(2);
      expect(f.slides.max).toBeGreaterThanOrEqual(f.slides.min);
    }
  });

  it("compte les slides du quiz en nombre pair", () => {
    // 1 accroche + N paires (question, réponse) + 1 barème = 2N + 2, donc pair.
    const quiz = slideshowFormatById("quiz")!;
    expect(quiz.slides.min % 2).toBe(0);
    expect(quiz.slides.max % 2).toBe(0);
  });

  it("laisse de la place au barème sur sa propre slide", () => {
    const quiz = slideshowFormatById("quiz")!;
    // Avec le minimum, il reste au moins quatre paires question/réponse.
    expect((quiz.slides.min - 2) / 2).toBeGreaterThanOrEqual(4);
  });
});

describe("pickSlideshowFormat", () => {
  it("ne choisit qu'un format actif", () => {
    const f = pickSlideshowFormat("Les pyramides étaient blanches", "histoire");
    expect(f.actif).toBe(true);
  });

  it("reste déterministe pour un même sujet", () => {
    const a = pickSlideshowFormat("L'année 536", "episodes");
    const b = pickSlideshowFormat("L'année 536", "episodes");
    expect(a.id).toBe(b.id);
  });

  it("retombe sur un format actif même si les formats sont récents", () => {
    expect(pickSlideshowFormat("Point Nemo", "geo", activeSlideshowFormats().map((f) => f.id)).actif).toBe(true);
  });

  it("accepte une catégorie inconnue ou vide", () => {
    expect(pickSlideshowFormat("Un sujet sans catégorie", null).actif).toBe(true);
    expect(pickSlideshowFormat("Un sujet sans catégorie", "").actif).toBe(true);
  });
});

describe("findOverlongSlides", () => {
  it("laisse passer une slide courte", () => {
    expect(findOverlongSlides([{ index: 0, text: "Six questions d'histoire." }])).toEqual([]);
  });

  it("signale une slide trop longue avec son nombre de mots", () => {
    const long = Array.from({ length: MAX_MOTS_PAR_SLIDE + 3 }, () => "mot").join(" ");
    expect(findOverlongSlides([{ index: 2, text: long }])).toEqual([
      { index: 2, mots: MAX_MOTS_PAR_SLIDE + 3 },
    ]);
  });

  it("tolère exactement la limite", () => {
    const pile = Array.from({ length: MAX_MOTS_PAR_SLIDE }, () => "mot").join(" ");
    expect(findOverlongSlides([{ index: 1, text: pile }])).toEqual([]);
  });

  it("ne casse pas sur un texte vide", () => {
    expect(findOverlongSlides([{ index: 0, text: "" }])).toEqual([]);
  });
});

describe("slideshowWritingBrief", () => {
  it("porte la règle qui interdit de montrer la réponse", () => {
    const quiz = slideshowFormatById("quiz")!;
    const brief = slideshowWritingBrief(quiz, 11);
    expect(brief).toContain("NE MONTRE JAMAIS SA RÉPONSE");
  });

  it("interdit le texte dans l'image, parce qu'elle est partagée par les langues", () => {
    const brief = slideshowWritingBrief(slideshowFormatById("quiz")!, 11);
    expect(brief).toContain("SANS AUCUN TEXTE");
    expect(brief).toContain("partagée par les cinq langues");
  });

  it("annonce le nombre de slides demandé et la borne d'index", () => {
    const brief = slideshowWritingBrief(slideshowFormatById("quiz")!, 11);
    expect(brief).toContain("11 slides exactement");
    expect(brief).toContain("index de 0 à 10");
  });

  it("porte la limite de mots par slide", () => {
    const brief = slideshowWritingBrief(slideshowFormatById("quiz")!, 9);
    expect(brief).toContain(`${MAX_MOTS_PAR_SLIDE} MOTS MAXIMUM`);
  });
});
