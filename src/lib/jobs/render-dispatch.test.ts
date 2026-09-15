import { describe, expect, it } from "vitest";

import {
  decideRenderSend,
  RENDER_CALLBACK_GRACE_MS,
  RENDER_GIVE_UP_MESSAGE,
  RENDER_MAX_SENDS,
} from "./render-dispatch";

const now = Date.UTC(2026, 8, 17, 12, 0, 0);
const ago = (ms: number) => new Date(now - ms).toISOString();

describe("decideRenderSend", () => {
  it("envoie le manifeste la première fois", () => {
    expect(decideRenderSend({ sends: 0, sentAt: null, now })).toEqual({ action: "send" });
  });

  it("n'envoie jamais deux fois dans le délai d'attente du rappel", () => {
    const d = decideRenderSend({ sends: 1, sentAt: ago(60_000), now });
    expect(d.action).toBe("wait");
  });

  it("renvoie une fois le délai franc écoulé", () => {
    expect(
      decideRenderSend({ sends: 1, sentAt: ago(RENDER_CALLBACK_GRACE_MS + 1_000), now }),
    ).toEqual({ action: "send" });
  });

  it("abandonne avec un message clair après le nombre maximum d'envois", () => {
    const d = decideRenderSend({
      sends: RENDER_MAX_SENDS,
      sentAt: ago(RENDER_CALLBACK_GRACE_MS + 1_000),
      now,
    });
    expect(d).toEqual({ action: "giveup", message: RENDER_GIVE_UP_MESSAGE });
    expect(RENDER_GIVE_UP_MESSAGE).toMatch(/sans réponse/);
  });
});
