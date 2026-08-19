/** Voix off premium via ElevenLabs (clé fournie par le connecteur). */

export const ELEVEN_VOICES = [
  { id: "9BWtsMINqrJLrRacOk9x", label: "Aria — chaleureuse" },
  { id: "JBFqnCBsd6RMkjVDRZzb", label: "George — narrateur doc" },
  { id: "onwK4e9ZLuTAKqWW03F9", label: "Daniel — grave, posé" },
  { id: "XrExE9yKIg1WjnnlVkGX", label: "Matilda — claire, jeune" },
  { id: "N2lVS1w4EtoT3dr4eOWO", label: "Callum — intense" },
  { id: "EXAVITQu4vr4xnSDxMaL", label: "Sarah — douce" },
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
        // Réglages narration : voix stable, très fidèle, peu de "style" (plus naturel).
        voice_settings: {
          stability: 0.6,
          similarity_boost: 0.9,
          style: 0.12,
          use_speaker_boost: true,
          speed: 0.98,
        },
      }),
    });

  // 192 kbps nécessite l'offre Creator : on retombe sur 128 puis 96 si refusé.
  let res = await call("mp3_44100_128");
  if (res.status === 403) res = await call("mp3_44100_96");
  if (res.status === 403) res = await call("mp3_22050_32");

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`ElevenLabs [${res.status}] : ${body || "échec de la synthèse vocale"}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  return `data:audio/mpeg;base64,${buf.toString("base64")}`;

}
