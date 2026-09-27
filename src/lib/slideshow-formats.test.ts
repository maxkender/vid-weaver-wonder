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
  it("n'active que le quiz pour l'instant", () => {
    expect(activeSlideshowFormats().map((f) => f.id)).toEqual(["quiz"]);
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

  it("alterne question et réponse en nombre impair pour le quiz", () => {
    // hook + N×(question, réponse) + final : min et max doivent être impairs.
    const quiz = slideshowFormatById("quiz")!;
    expect(quiz.slides.min % 2).toBe(1);
    expect(quiz.slides.max % 2).toBe(1);
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

  it("retombe sur le format actif même s'il est récent", () => {
    // Un seul format actif : la rotation ne peut pas l'écarter sans tout bloquer.
    expect(pickSlideshowFormat("Point Nemo", "geo", ["quiz"]).id).toBe("quiz");
  });

  it("accepte une catégorie inconnue ou vide", () => {
    expect(pickSlideshowFormat("Un sujet sans catégorie", null).id).toBe("quiz");
    expect(pickSlideshowFormat("Un sujet sans catégorie", "").id).toBe("quiz");
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
