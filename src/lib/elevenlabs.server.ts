/** Voix off premium via ElevenLabs (clé fournie par le connecteur). */

export const ELEVEN_VOICES = [
  { id: "9BWtsMINqrJLrRacOk9x", label: "Aria — chaleureuse, premium" },
  { id: "JBFqnCBsd6RMkjVDRZzb", label: "George — narrateur doc, premium" },
  { id: "onwK4e9ZLuTAKqWW03F9", label: "Daniel — grave, posé, premium" },
  { id: "XrExE9yKIg1WjnnlVkGX", label: "Matilda — claire, jeune, premium" },
  { id: "N2lVS1w4EtoT3dr4eOWO", label: "Callum — intense, premium" },
  { id: "EXAVITQu4vr4xnSDxMaL", label: "Sarah — douce, premium" },
] as const;

export type WordTiming = { word: string; start: number; end: number };

const VOICE_SETTINGS = {
  stability: 0.55,
  similarity_boost: 0.88,
  style: 0.05,
  use_speaker_boost: true,
  speed: 0.97,
};

// On tente la meilleure qualité d'abord, puis on dégrade si le plan ne le permet pas.
const FORMATS = ["mp3_44100_192", "mp3_44100_128", "mp3_44100_96", "mp3_22050_32"];

async function callEleven(path: string, text: string, apiKey: string) {
  let res: Response | null = null;
  let lastErr = "";
  for (const format of FORMATS) {
    res = await fetch(`https://api.elevenlabs.io${path}?output_format=${format}`, {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: VOICE_SETTINGS,
      }),
    });
    if (res.ok) break;
    lastErr = await res.text().catch(() => "");
    if (res.status !== 403 && res.status !== 402) break; // erreur non liée au plan
  }
  if (!res || !res.ok) {
    throw new Error(
      `ElevenLabs [${res?.status ?? "?"}] : ${lastErr || "échec de la synthèse vocale"}`,
    );
  }
  return res;
}

function apiKeyOrThrow() {
  const apiKey = process.env["ELEVENLABS_API_KEY"];
  if (!apiKey) throw new Error("ElevenLabs n'est pas connecté à ce projet.");
  return apiKey;
}

export async function generateElevenSpeechDataUrl(
  text: string,
  voiceId: string,
): Promise<string> {
  const res = await callEleven(`/v1/text-to-speech/${voiceId}`, text, apiKeyOrThrow());
  const buf = Buffer.from(await res.arrayBuffer());
  return `data:audio/mpeg;base64,${buf.toString("base64")}`;
}

type Alignment = {
  characters?: string[];
  character_start_times_seconds?: number[];
  character_end_times_seconds?: number[];
};

/** Regroupe l'alignement caractère par caractère renvoyé par ElevenLabs en mots. */
function alignmentToWords(alignment: Alignment | undefined): WordTiming[] {
  const chars = alignment?.characters ?? [];
  const starts = alignment?.character_start_times_seconds ?? [];
  const ends = alignment?.character_end_times_seconds ?? [];
  if (!chars.length || chars.length !== starts.length) return [];

  const words: WordTiming[] = [];
  let current = "";
  let start = 0;
  let end = 0;
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i]!;
    if (/\s/.test(c)) {
      if (current) words.push({ word: current, start, end });
      current = "";
      continue;
    }
    if (!current) start = starts[i] ?? end;
    current += c;
    end = ends[i] ?? starts[i] ?? end;
  }
  if (current) words.push({ word: current, start, end });
  return words;
}

/**
 * Synthèse + alignement temporel exact mot par mot : le karaoké est ainsi
 * calé sur la voix réelle et ne peut plus défiler trop vite.
 */
export async function generateElevenSpeechWithTimings(
  text: string,
  voiceId: string,
): Promise<{ audioDataUrl: string; words: WordTiming[] }> {
  const apiKey = apiKeyOrThrow();
  try {
    const res = await callEleven(
      `/v1/text-to-speech/${voiceId}/with-timestamps`,
      text,
      apiKey,
    );
    const json = (await res.json()) as {
      audio_base64?: string;
      alignment?: Alignment;
      normalized_alignment?: Alignment;
    };
    if (!json.audio_base64) throw new Error("Réponse ElevenLabs sans audio.");
    return {
      audioDataUrl: `data:audio/mpeg;base64,${json.audio_base64}`,
      words: alignmentToWords(json.alignment ?? json.normalized_alignment),
    };
  } catch {
    // Repli : audio sans alignement (le karaoké estimera les durées).
    const audioDataUrl = await generateElevenSpeechDataUrl(text, voiceId);
    return { audioDataUrl, words: [] };
  }
}

/** Voix FR recommandées, épinglées en tête de liste. */
const CURATED_FR: { id: string; label: string }[] = [
  { id: "3HZyQcLKlT0a3RDeXVsP", label: "🇫🇷 ⭐ Guillaume — documentaire & storytelling" },
  { id: "aQROLel5sQbj1vuIVi6B", label: "🇫🇷 ⭐ Nicolas — narrateur" },
  { id: "EIe4oLyymVX7lKVYli9m", label: "🇫🇷 ⭐ Nicolas — narrateur audiobook" },
  { id: "2AGrjHJgmTgUqzy68M9W", label: "🇫🇷 ⭐ Nicolas Petit — voix grave" },
  { id: "93nuHbke4dTER9x2pDwE", label: "🇫🇷 ⭐ Adam — chaleureux, multilingue" },
  { id: "McVZB9hVxVSk3Equu8EH", label: "🇫🇷 ⭐ Audrey — dynamique, pub" },
  { id: "tVu7uvtKsrCoOPPIUVR7", label: "🇫🇷 ⭐ Guillaume — narrateur" },
];

/** Voix du compte + voix françaises de la bibliothèque partagée (FR en premier). */
export async function listElevenVoices(): Promise<{ id: string; label: string }[]> {
  const apiKey = apiKeyOrThrow();
  const headers = { "xi-api-key": apiKey };

  const [ownRes, frRes] = await Promise.all([
    fetch("https://api.elevenlabs.io/v2/voices?page_size=100", { headers }),
    fetch("https://api.elevenlabs.io/v1/shared-voices?page_size=100&language=fr", { headers }).catch(() => null),
  ]);


  if (!ownRes.ok) throw new Error(`ElevenLabs voices ${ownRes.status}: ${await ownRes.text()}`);
  const own = (await ownRes.json()) as {
    voices?: { voice_id: string; name: string; labels?: Record<string, string> }[];
  };

  const french: { id: string; label: string }[] = [];
  if (frRes && frRes.ok) {
    const shared = (await frRes.json()) as {
      voices?: {
        voice_id: string;
        name: string;
        accent?: string;
        gender?: string;
        age?: string;
        descriptive?: string;
        use_case?: string;
      }[];
    };
    for (const v of shared.voices ?? []) {
      const bits = [v.gender, v.age, v.descriptive, v.use_case].filter(Boolean).join(", ");
      french.push({ id: v.voice_id, label: `🇫🇷 ${v.name}${bits ? ` — ${bits}` : ""}` });
    }
  }

  const seen = new Set(french.map((v) => v.id));
  const others: { id: string; label: string }[] = [];
  for (const v of own.voices ?? []) {
    if (seen.has(v.voice_id)) continue;
    const lang = v.labels?.["language"];
    const bits = [lang, v.labels?.["accent"], v.labels?.["description"], v.labels?.["use_case"]]
      .filter(Boolean)
      .join(", ");
    const isFr = (lang ?? "").toLowerCase().startsWith("fr");
    const entry = { id: v.voice_id, label: `${isFr ? "🇫🇷 " : ""}${v.name}${bits ? ` — ${bits}` : ""}` };
    if (isFr) french.unshift(entry);
    else others.push(entry);
  }

  return [...french, ...others];
}

