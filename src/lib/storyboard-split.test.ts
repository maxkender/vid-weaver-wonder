import { describe, expect, it } from "vitest";
import { splitIntoShots } from "./storyboard-split";

describe("splitIntoShots", () => {
  it("regroupe les phrases courtes et les questions avec leur réponse", () => {
    const text =
      "Le Cyclope de l'Odyssée a une origine bien réelle. " +
      "Les Grecs avaient des preuves : de vrais crânes géants percés d'un trou unique. " +
      "Pour eux, aucun doute : des géants vivaient sur cette île. " +
      "Le Cyclope était né. " +
      "Et le trou au milieu du front ? Pas un œil. La cavité de leur trompe.";
    expect(splitIntoShots(text)).toEqual([
      "Le Cyclope de l'Odyssée a une origine bien réelle.",
      "Les Grecs avaient des preuves : de vrais crânes géants percés d'un trou unique.",
      "Pour eux, aucun doute : des géants vivaient sur cette île. Le Cyclope était né.",
      "Et le trou au milieu du front ? Pas un œil. La cavité de leur trompe.",
    ]);
  });

  it("conserve le texte d'origine et plafonne le nombre de plans", () => {
    const text = Array.from({ length: 24 }, (_, i) => `Phrase numéro ${i} avec assez de mots ici.`).join(" ");
    const shots = splitIntoShots(text);
    expect(shots.length).toBeLessThanOrEqual(18);
    expect(shots.join(" ")).toBe(text);
  });
});
