import { describe, expect, it } from "vitest";
import { findMechanicalWords, hasMechanicalMetaphor } from "./mechanical-metaphors";

describe("détection des métaphores mécaniques (papier v2)", () => {
  it("détecte « Le frein de ton cerveau »", () => {
    expect(findMechanicalWords("Le frein de ton cerveau se branche.")).toContain("frein");
  });

  it("détecte « un câblage final »", () => {
    expect(hasMechanicalMetaphor("Il ne reste qu'un câblage final.")).toBe(true);
  });

  it("ne détecte rien dans « il a agi machinalement »", () => {
    expect(findMechanicalWords("Il a agi machinalement.")).toEqual([]);
  });

  it("ne détecte rien dans « le cadre de la photo »", () => {
    expect(hasMechanicalMetaphor("Le cadre de la photo est en bois.")).toBe(false);
  });
});
