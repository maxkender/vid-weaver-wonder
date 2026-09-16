import { describe, expect, it } from "vitest";

import { isPast, isReleased, localDay } from "./publish-day";

describe("jour de diffusion", () => {
  it("une vidéo datée dans le futur n'est jamais diffusable", () => {
    expect(isReleased("2026-09-17", "2026-09-16")).toBe(false);
    expect(isReleased("2026-09-18", "2026-09-16")).toBe(false);
  });

  it("la vidéo du jour et les précédentes sont diffusables", () => {
    expect(isReleased("2026-09-16", "2026-09-16")).toBe(true);
    expect(isReleased("2026-09-15", "2026-09-16")).toBe(true);
  });

  it("l'historique ne contient ni aujourd'hui ni le futur", () => {
    expect(isPast("2026-09-15", "2026-09-16")).toBe(true);
    expect(isPast("2026-09-16", "2026-09-16")).toBe(false);
    expect(isPast("2026-09-17", "2026-09-16")).toBe(false);
  });

  it("le jour est celui du fuseau de diffusion, pas UTC", () => {
    // 15/09 23h30 UTC = déjà le 16/09 à Paris.
    const d = new Date("2026-09-15T23:30:00Z");
    expect(localDay("Europe/Paris", d)).toBe("2026-09-16");
    expect(localDay("UTC", d)).toBe("2026-09-15");
  });
});
