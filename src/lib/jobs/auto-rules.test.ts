import { describe, expect, it } from "vitest";

import {
  decidePublishDay,
  isFatalFailure,
  pickPublishDate,
  resumeStatusFor,
  shouldProduceNow,
} from "./auto-rules";

describe("shouldProduceNow", () => {
  it("une publication plus tôt dans la journée n'empêche pas le lancement", () => {
    // `last_run_at` peut avoir bougé (publication) ; seul l'horodatage dédié compte.
    expect(
      shouldProduceNow({ localHour: 9, runHour: 0, today: "2026-09-16", lastProduceDay: null }).run,
    ).toBe(true);
  });
  it("le lancement se rattrape après l'heure prévue", () => {
    const d = shouldProduceNow({
      localHour: 5,
      runHour: 0,
      today: "2026-09-16",
      lastProduceDay: "2026-09-15",
    });
    expect(d).toEqual({ run: true, catchUp: true });
  });
  it("ne lance pas avant l'heure ni deux fois le même jour", () => {
    expect(
      shouldProduceNow({ localHour: 3, runHour: 5, today: "2026-09-16", lastProduceDay: null }).run,
    ).toBe(false);
    expect(
      shouldProduceNow({
        localHour: 9,
        runHour: 0,
        today: "2026-09-16",
        lastProduceDay: "2026-09-16",
      }).run,
    ).toBe(false);
  });
  it("à l'heure pile, ce n'est pas un rattrapage", () => {
    expect(
      shouldProduceNow({ localHour: 0, runHour: 0, today: "2026-09-16", lastProduceDay: null }),
    ).toEqual({ run: true, catchUp: false });
  });
});

describe("isFatalFailure", () => {
  it("garde le veto sur crédits, paiement et politique", () => {
    expect(isFatalFailure("Erreur du service IA (402)")).toBe(true);
    expect(isFatalFailure("insufficient credits")).toBe(true);
    expect(isFatalFailure("forbidden")).toBe(true);
  });
  it("laisse relancer les hoquets transitoires", () => {
    expect(isFatalFailure("Erreur du service IA (503)")).toBe(false);
    expect(isFatalFailure("Téléchargement impossible (502)")).toBe(false);
    expect(isFatalFailure(null)).toBe(false);
  });
});

describe("resumeStatusFor", () => {
  it("reprend à l'étape manquante sans repayer", () => {
    expect(resumeStatusFor({ topic: null, scenes: [] })).toBe("queued");
    expect(resumeStatusFor({ topic: "x", scenes: [] })).toBe("scripting");
    expect(resumeStatusFor({ topic: "x", scenes: [{ narration: "a" }] })).toBe("images");
    expect(
      resumeStatusFor({ topic: "x", scenes: [{ narration: "a", imagePath: "i" }] }),
    ).toBe("voice");
    expect(
      resumeStatusFor({
        topic: "x",
        scenes: [{ narration: "a", imagePath: "i", audioPath: "v" }],
      }),
    ).toBe("clips");
    expect(
      resumeStatusFor({
        topic: "x",
        scenes: [{ narration: "a", imagePath: "i", audioPath: "v", clipPath: "c" }],
      }),
    ).toBe("rendering");
  });
});

describe("pickPublishDate", () => {
  it("vise la prochaine date libre", () => {
    expect(pickPublishDate("2026-09-16", [])).toBe("2026-09-16");
    expect(pickPublishDate("2026-09-16", ["2026-09-16"])).toBe("2026-09-17");
    expect(pickPublishDate("2026-09-16", ["2026-09-16", "2026-09-17"])).toBe("2026-09-18");
  });
  it("renvoie null quand tout l'horizon est produit", () => {
    const all = ["2026-09-16", "2026-09-17", "2026-09-18"];
    expect(pickPublishDate("2026-09-16", all, 3)).toBeNull();
  });
});

describe("decidePublishDay", () => {
  const active = ["fr", "en", "es"];
  it("publie quand toutes les langues sont prêtes", () => {
    expect(
      decidePublishDay({ activeLanguages: active, readyLanguages: active, failedLanguages: [] }),
    ).toEqual({ action: "publish", missing: [] });
  });
  it("attend tant qu'une langue peut encore arriver", () => {
    expect(
      decidePublishDay({
        activeLanguages: active,
        readyLanguages: ["fr", "en"],
        failedLanguages: [],
      }).action,
    ).toBe("wait");
  });
  it("publie les autres quand une langue est définitivement en échec", () => {
    expect(
      decidePublishDay({
        activeLanguages: active,
        readyLanguages: ["fr", "en"],
        failedLanguages: ["es"],
      }),
    ).toEqual({ action: "publish-partial", missing: ["es"] });
  });
  it("n'invente rien quand aucune langue n'est prête", () => {
    expect(
      decidePublishDay({ activeLanguages: active, readyLanguages: [], failedLanguages: ["fr"] })
        .action,
    ).toBe("wait");
  });
});
