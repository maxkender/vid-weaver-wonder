/**
 * Mémorisation PARTAGÉE du débit réel des voix (base du projet, pas le
 * navigateur) : le studio et le service de nuit lisent la même table.
 */

import { rateKey, type VoiceRate } from "./voice-rate";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return supabaseAdmin as unknown as import("@supabase/supabase-js").SupabaseClient<any>;
}

type Row = { voice_id: string; language: string; takes: number; chars: number; seconds: number };

/** Tous les débits connus, indexés par `voix:langue`. */
export async function loadVoiceRates(): Promise<Record<string, VoiceRate>> {
  try {
    const db = await admin();
    const { data } = await db.from("voice_rates").select("voice_id, language, takes, chars, seconds");
    const out: Record<string, VoiceRate> = {};
    for (const r of (data ?? []) as Row[]) {
      out[rateKey(r.voice_id, r.language)] = {
        chars: Number(r.chars) || 0,
        seconds: Number(r.seconds) || 0,
        takes: Number(r.takes) || 0,
      };
    }
    return out;
  } catch {
    // Une mesure indisponible ne doit jamais bloquer une production.
    return {};
  }
}

/**
 * Cumule une prise : caractères envoyés et durée RÉELLE entendue (silences de
 * tête et de queue déjà retirés). La moyenne se fait sur le cumul.
 */
export async function recordVoiceTake(
  voiceId: string,
  language: string,
  chars: number,
  seconds: number,
): Promise<VoiceRate | null> {
  if (!voiceId || chars < 20 || seconds < 1) return null;
  const lang = language.slice(0, 2).toLowerCase();
  try {
    const db = await admin();
    const { data } = await db
      .from("voice_rates")
      .select("takes, chars, seconds")
      .eq("voice_id", voiceId)
      .eq("language", lang)
      .maybeSingle();
    const prev = (data ?? null) as { takes: number; chars: number; seconds: number } | null;
    const next = {
      voice_id: voiceId,
      language: lang,
      takes: (Number(prev?.takes) || 0) + 1,
      chars: (Number(prev?.chars) || 0) + Math.round(chars),
      seconds: Math.round(((Number(prev?.seconds) || 0) + seconds) * 1000) / 1000,
    };
    await db.from("voice_rates").upsert(next, { onConflict: "voice_id,language" });
    return { chars: next.chars, seconds: next.seconds, takes: next.takes };
  } catch {
    return null;
  }
}
