import { describe, expect, it } from "vitest";

import {
  findWeakOpening,
  pickStoryStyle,
  STORY_STYLES,
  storyStyleBrief,
  storyStyleById,
  topicParleDuSpectateur,
} from "./story-styles";

describe("findWeakOpening", () => {
  it("refuse les ouvertures vides", () => {
    expect(findWeakOpening("Il existe une année que les historiens appellent…")).toBe("il existe");
    expect(findWeakOpening("On pense souvent que le caméléon change de couleur.")).toBe("on pense");
    expect(findWeakOpening("C'est la pire année de l'histoire.")).toBe("c'est");
    expect(findWeakOpening("Saviez-vous que les lemmings…")).toBe("saviez-vous");
  });

  it("refuse une date en ouverture", () => {
    expect(findWeakOpening("En 1816, il n'y a pas eu d'été.")).toBe("une date en ouverture");
    expect(findWeakOpening("536 a été la pire année.")).toBe("une date en ouverture");
  });

  it("accepte une ouverture sur le sujet", () => {
    expect(findWeakOpening("Le soleil s'est éteint pendant dix-huit mois.")).toBeNull();
    expect(findWeakOpening("Un homme a vu les deux bombes atomiques.")).toBeNull();
    expect(findWeakOpening("La ville de Troie a vraiment existé.")).toBeNull();
    expect(findWeakOpening("Ton cerveau coupe exprès tes muscles.")).toBeNull();
  });

  it("ignore les guillemets d'ouverture et la casse", () => {
    expect(findWeakOpening("« Il y a un homme qui… »")).toBe("il y a");
    expect(findWeakOpening("  IL EXISTE un animal…")).toBe("il existe");
  });

  it("ne confond pas un mot qui commence pareil", () => {
    expect(findWeakOpening("Celadon est une nuance de vert.")).toBeNull();
    expect(findWeakOpening("Ilan a survécu à deux bombes.")).toBeNull();
  });
});

describe("topicParleDuSpectateur", () => {
  it("détecte la deuxième personne", () => {
    expect(topicParleDuSpectateur("Ton cerveau n'est pas adulte avant 25 ans")).toBe(true);
    expect(topicParleDuSpectateur("Tu ne te souviens de rien avant tes trois ans")).toBe(true);
  });

  it("laisse passer une histoire à la troisième personne", () => {
    expect(topicParleDuSpectateur("La ville de Troie a vraiment existé")).toBe(false);
    expect(topicParleDuSpectateur("Un homme a dérivé 438 jours dans le Pacifique")).toBe(false);
  });
});

describe("pickStoryStyle", () => {
  it("envoie tout sujet à la deuxième personne vers « le corps du spectateur »", () => {
    expect(pickStoryStyle("Ta voix enregistrée te dégoûte", "science").id).toBe("corps");
  });

  it("n'ouvre le tutoiement qu'à cette forme", () => {
    const tu = STORY_STYLES.filter((s) => s.tutoiement).map((s) => s.id);
    expect(tu).toEqual(["corps"]);
  });

  it("respecte la catégorie du sujet", () => {
    const style = pickStoryStyle("Un homme a dérivé 438 jours dans le Pacifique", "faits-divers");
    expect(style.categories).toContain("faits-divers");
  });

  it("écarte les formes des deux dernières vidéos", () => {
    const topic = "Alexandrie fouillait les bateaux pour leur voler leurs livres";
    const premier = pickStoryStyle(topic, "histoire", []);
    const suivant = pickStoryStyle(topic, "histoire", [premier.id]);
    expect(suivant.id).not.toBe(premier.id);
  });

  it("garde un choix déterministe pour un même sujet", () => {
    const a = pickStoryStyle("Le casque à cornes des Vikings", "histoire", []);
    const b = pickStoryStyle("Le casque à cornes des Vikings", "histoire", []);
    expect(a.id).toBe(b.id);
  });

  it("retombe sur une forme utilisable quand toutes sont récentes", () => {
    const tous = STORY_STYLES.map((s) => s.id);
    expect(pickStoryStyle("Les pyramides étaient blanches", "histoire", tous).id).toBeTruthy();
  });

  it("laisse au moins deux formes candidates par catégorie, sinon la rotation boucle", () => {
    const cats = [
      "histoire",
      "episodes",
      "faits-divers",
      "mythes",
      "science",
      "espace",
      "nature",
      "geo",
      "pop",
      "origines",
      "personnages",
      "mysteres",
    ];
    for (const cat of cats) {
      const n = STORY_STYLES.filter((s) => s.categories.includes(cat)).length;
      expect(n >= 2).toBe(true);
    }
  });

  it("ne choisit jamais « corps » pour un sujet à la troisième personne", () => {
    for (const cat of ["histoire", "science", "nature", "faits-divers", "pop", "mysteres", ""]) {
      expect(pickStoryStyle("La Grande Tache Rouge de Jupiter", cat).id).not.toBe("corps");
    }
  });
});

describe("storyStyleBrief", () => {
  it("interdit explicitement le tutoiement hors « corps »", () => {
    const enquete = storyStyleById("enquete")!;
    expect(storyStyleBrief(enquete)).toContain("AUCUN « tu »");
  });

  it("autorise le tutoiement pour « corps »", () => {
    const corps = storyStyleById("corps")!;
    expect(storyStyleBrief(corps)).toContain("le « tu » est autorisé");
  });

  it("porte la règle du premier mot dans toutes les formes", () => {
    for (const style of STORY_STYLES) {
      expect(storyStyleBrief(style)).toContain("RÈGLE DU PREMIER MOT");
      expect(storyStyleBrief(style)).toContain(style.label.toUpperCase());
    }
  });
});
