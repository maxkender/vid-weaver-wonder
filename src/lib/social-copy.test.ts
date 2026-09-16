import { describe, expect, it } from "vitest";

import { buildSocialCopy, cleanHashtag, normalizeHashtags } from "./social-copy";

describe("hashtags", () => {
  it("met toujours la marque en tête", () => {
    expect(normalizeHashtags(["Herbst", "Blätter"])).toEqual([
      "culture",
      "sophia",
      "herbst",
      "blatter",
    ]);
  });

  it("nettoie accents, espaces et ponctuation", () => {
    expect(cleanHashtag("#Été, chaud !")).toBe("etechaud");
  });

  it("plafonne la liste", () => {
    const tags = normalizeHashtags(["a", "b", "c", "d", "e", "f", "g"]);
    expect(tags.length).toBe(7);
  });
});

describe("légende", () => {
  it("ajoute l'appel à l'action de la langue", () => {
    const { caption } = buildSocialCopy({ caption: "Napoleon verlor anders.", language: "de" });
    expect(caption.endsWith("Lade Sophia herunter, um mehr zu erfahren.")).toBe(true);
  });

  it("ne double pas l'appel à l'action déjà présent", () => {
    const { caption } = buildSocialCopy({
      caption: "Un fait vrai. Télécharge Sophia pour en apprendre plus.",
      language: "fr",
    });
    expect(caption.match(/Télécharge Sophia/g)?.length).toBe(1);
  });

  it("retombe sur l'accroche quand la génération est vide", () => {
    const { caption, hashtags } = buildSocialCopy({
      caption: "",
      hook: "Waterloo n'a pas été perdu par Napoléon",
      language: "fr",
    });
    expect(caption).toBe(
      "Waterloo n'a pas été perdu par Napoléon. Télécharge Sophia pour en apprendre plus.",
    );
    expect(hashtags).toEqual(["culture", "sophia"]);
  });

  it("garde trois phrases au maximum", () => {
    const { caption } = buildSocialCopy({
      caption: "Une. Deux. Trois. Quatre.",
      language: "fr",
    });
    expect(caption.startsWith("Une. Deux. Trois.")).toBe(true);
    expect(caption.includes("Quatre")).toBe(false);
  });
});
