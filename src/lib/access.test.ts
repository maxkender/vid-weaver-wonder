import { describe, expect, it } from "vitest";

import { SUSPENDED_MESSAGE, assertActiveAccess, isAccessSuspended } from "@/lib/access";

describe("un posteur suspendu n'obtient ni liste de vidéos ni lien signé", () => {
  const suspended = { role: "poster", status: "suspended" } as const;

  it("bloque la liste des vidéos", () => {
    expect(isAccessSuspended(suspended)).toBe(true);
    expect(() => assertActiveAccess(suspended)).toThrowError(SUSPENDED_MESSAGE);
  });

  it("bloque la signature d'un lien de téléchargement", () => {
    let url: string | null = null;
    const sign = () => {
      assertActiveAccess(suspended);
      url = "https://example.test/signed.mp4";
    };
    expect(sign).toThrowError(SUSPENDED_MESSAGE);
    expect(url).toBeNull();
  });

  it("laisse passer un posteur actif", () => {
    expect(isAccessSuspended({ role: "poster", status: "active" })).toBe(false);
    expect(() => assertActiveAccess({ role: "poster", status: "active" })).not.toThrow();
  });

  it("n'applique jamais la règle à l'administrateur", () => {
    expect(isAccessSuspended({ role: "admin", status: "suspended" })).toBe(false);
    expect(() => assertActiveAccess({ role: "admin", status: "suspended" })).not.toThrow();
  });
});
