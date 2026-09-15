import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { VoiceRate } from "./voice-rate";

/** Débits mesurés de toutes les voix déjà entendues (`voix:langue` → cumuls). */
export const listVoiceRates = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ rates: Record<string, VoiceRate> }> => {
    const { loadVoiceRates } = await import("./voice-rate.server");
    return { rates: await loadVoiceRates() };
  },
);

/** Enregistre une prise réelle (caractères + durée entendue, silences retirés). */
export const recordVoiceRate = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        voiceId: z.string().min(2).max(80),
        language: z.string().min(2).max(5),
        chars: z.number().min(0).max(100000),
        seconds: z.number().min(0).max(600),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ rate: VoiceRate | null }> => {
    const { recordVoiceTake } = await import("./voice-rate.server");
    return {
      rate: await recordVoiceTake(data.voiceId, data.language, data.chars, data.seconds),
    };
  });
