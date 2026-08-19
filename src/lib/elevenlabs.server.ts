/** Voix off premium via ElevenLabs (clé fournie par le connecteur). */

export const ELEVEN_VOICES = [
  { id: "9BWtsMINqrJLrRacOk9x", label: "Aria — chaleureuse, premium" },
  { id: "JBFqnCBsd6RMkjVDRZzb", label: "George — narrateur doc, premium" },
  { id: "onwK4e9ZLuTAKqWW03F9", label: "Daniel — grave, posé, premium" },
  { id: "XrExE9yKIg1WjnnlVkGX", label: "Matilda — claire, jeune, premium" },
  { id: "N2lVS1w4EtoT3dr4eOWO", label: "Callum — intense, premium" },
  { id: "EXAVITQu4vr4xnSDxMaL", label: "Sarah — douce, premium" },
] as const;

export async function generateElevenSpeechDataUrl(
  text: string,
  voiceId: string,
): Promise<string> {
  const apiKey = process.env["ELEVENLABS_API_KEY"];
  if (!apiKey) throw new Error("ElevenLabs n'est pas connecté à ce projet.");

  const call = (format: string) =>
    fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=${format}`, {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        // Réglages narration premium : voix stable mais naturelle, fidélité élevée,
        // style très bas pour éviter l'effet "robotisé", légèrement plus lent.
        voice_settings: {
          stability: 0.55,
          similarity_boost: 0.88,
          style: 0.05,
          use_speaker_boost: true,
          speed: 0.97,
        },
      }),
    });

  // On tente la meilleure qualité d'abord, puis on dégrée si le plan ne le permet pas.
  // 192 kbps = Creator/Pro ; 128 kbps = Starter+ ; 96 kbps = Free+ ; 32 kbps = fallback.
  const formats = ["mp3_44100_192", "mp3_44100_128", "mp3_44100_96", "mp3_22050_32"];
  let res: Response | null = null;
  let lastErr = "";
  for (const format of formats) {
    res = await call(format);
    if (res.ok) break;
    lastErr = await res.text().catch(() => "");
    if (res.status !== 403 && res.status !== 402) break; // erreur non liée au plan
  }

  if (!res || !res.ok) {
    throw new Error(
      `ElevenLabs [${res?.status ?? "?"}] : ${lastErr || "échec de la synthèse vocale"}`,
    );
  }

  const buf = Buffer.from(await res.arrayBuffer());
  return `data:audio/mpeg;base64,${buf.toString("base64")}`;
}
