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

/**
 * Débit par défaut : 1,0. La longueur du texte est déjà calée sur le budget,
 * la vitesse n'a donc plus rien à rattraper. Les deux leviers ne doivent
 * jamais agir en même temps.
 */
export const DEFAULT_VOICE_SPEED = 1;

/** Débit acceptable d'une narration, en caractères par seconde. */
export const MIN_CHARS_PER_SECOND = 7;
export const MAX_CHARS_PER_SECOND = 16;

/** Bornes DURES de la vitesse de synthèse, appliquées à la requête elle-même. */
export const VOICE_SPEED_MIN = 0.95;
export const VOICE_SPEED_MAX = 1.15;

/** Dernier verrou : aucune valeur calculée en amont ne peut le contourner. */
export function clampVoiceSpeed(speed: number | undefined) {
  const v = Number.isFinite(speed) ? (speed as number) : DEFAULT_VOICE_SPEED;
  return Math.min(VOICE_SPEED_MAX, Math.max(VOICE_SPEED_MIN, v));
}

function voiceSettings(speed = DEFAULT_VOICE_SPEED) {
  return {
    stability: 0.55,
    similarity_boost: 0.88,
    style: 0.05,
    use_speaker_boost: true,
    speed: clampVoiceSpeed(speed),
  };
}

// On tente la meilleure qualité d'abord, puis on dégrade si le plan ne le permet pas.
const FORMATS = ["mp3_44100_192", "mp3_44100_128", "mp3_44100_96", "mp3_22050_32"];

async function callEleven(
  path: string,
  text: string,
  apiKey: string,
  language = "fr",
  voiceId?: string,
  speed = DEFAULT_VOICE_SPEED,
) {
  let res: Response | null = null;
  let lastErr = "";
  for (const format of FORMATS) {
    res = await fetch(`https://api.elevenlabs.io${path}?output_format=${format}`, {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        language_code: language,
        model_id: "eleven_multilingual_v2",
        voice_settings: voiceSettings(speed),
      }),
    });
    if (res.ok) break;
    lastErr = await res.text().catch(() => "");
    if (res.status !== 403 && res.status !== 402) break; // erreur non liée au plan
  }
  if (!res || !res.ok) {
    // 404/400/422 sur une voix partagée = voix non ajoutée à la bibliothèque du compte.
    const notAccessible =
      res?.status === 404 ||
      res?.status === 400 ||
      res?.status === 422 ||
      /voice_not_found|voice does not exist|invalid.*voice/i.test(lastErr);
    if (notAccessible && voiceId) {
      throw new Error(
        `La voix ${voiceId} (langue « ${language} ») n'est pas accessible depuis ce compte ElevenLabs. ` +
          `Ouvre la voix dans la bibliothèque ElevenLabs et ajoute-la à ton compte, puis réessaie.`,
      );
    }
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
  language = "fr",
  speed = DEFAULT_VOICE_SPEED,
): Promise<string> {
  const res = await callEleven(
    `/v1/text-to-speech/${voiceId}`,
    text,
    apiKeyOrThrow(),
    language,
    voiceId,
    speed,
  );
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
 *
 * Pas de repli silencieux : sans alignement réel, les sous-titres seraient
 * calés sur une estimation et la vidéo sortirait désynchronisée. On remonte
 * donc une erreur explicite (scène + langue) plutôt que de monter du faux.
 */
type SpeechResult = {
  audioDataUrl: string;
  words: WordTiming[];
  characters: number;
  textChars: number;
};

/** Prise refusée pour débit anormal : c'est un aléa, on peut relancer. */
class AbnormalRateError extends Error {}

async function speechAttempt(
  text: string,
  voiceId: string,
  language = "fr",
  context?: string,
  speed = DEFAULT_VOICE_SPEED,
): Promise<SpeechResult> {
  const apiKey = apiKeyOrThrow();
  const where = `${context ? `${context} — ` : ""}langue « ${language} »`;

  let json: {
    audio_base64?: string;
    alignment?: Alignment;
    normalized_alignment?: Alignment;
  };
  // Coût réel : ElevenLabs facture au CARACTÈRE (1 crédit par caractère). On
  // compte les caractères RÉELLEMENT ENVOYÉS ; l'en-tête du fournisseur a déjà
  // renvoyé des valeurs partielles qui faisaient croire à une troncature.
  const characters = text.trim().length;
  try {
    const res = await callEleven(
      `/v1/text-to-speech/${voiceId}/with-timestamps`,
      text,
      apiKey,
      language,
      voiceId,
      speed,
    );
    json = (await res.json()) as typeof json;
  } catch (e) {
    throw new Error(
      `Alignement mot à mot indisponible (${where}) : ${
        e instanceof Error ? e.message : String(e)
      }. Aucune vidéo n'est montée sans sous-titres calés sur la voix réelle.`,
    );
  }

  if (!json.audio_base64) {
    throw new Error(`Réponse ElevenLabs sans audio (${where}).`);
  }
  const words = alignmentToWords(json.alignment ?? json.normalized_alignment);
  if (!words.length) {
    throw new Error(
      `Alignement mot à mot vide (${where}). Aucune vidéo n'est montée sans sous-titres calés sur la voix réelle.`,
    );
  }
  // GARDE-FOU ANTI-TRONCATURE : l'alignement renvoyé couvre exactement le texte
  // réellement prononcé. S'il manque des mots, la synthèse n'a lu qu'une partie
  // du plan — on refuse un demi-plan payé et on le dit clairement.
  const expectedWords = text.trim().split(/\s+/).filter(Boolean).length;
  const spokenChars = words.reduce((n, w) => n + w.word.length, 0);
  const textChars = text.trim().replace(/\s+/g, "").length;
  if (expectedWords && (words.length < expectedWords * 0.95 || spokenChars < textChars * 0.95)) {
    throw new Error(
      `Texte tronqué par la synthèse (${where}) : ${words.length} mots prononcés sur ${expectedWords} attendus ` +
        `(${spokenChars} caractères sur ${textChars}). Aucune voix off partielle n'est conservée.`,
    );
  }
  // GARDE-FOU DE DÉBIT : une narration se lit entre 7 et 16 caractères par
  // seconde. Au-delà la voix s'emballe (inécoutable), en dessous elle traîne.
  // Dans les deux cas c'est un défaut, pas une durée à accepter.
  const spoken = Math.max(0.2, (words.at(-1)?.end ?? 0) - (words[0]?.start ?? 0));
  const cps = characters / spoken;
  if (characters >= 40 && (cps > MAX_CHARS_PER_SECOND || cps < MIN_CHARS_PER_SECOND)) {
    throw new AbnormalRateError(
      `Débit de voix anormal (${where}) : ${cps.toFixed(1)} caractères par seconde ` +
        `(${characters} caractères en ${spoken.toFixed(2)} s, vitesse demandée ${clampVoiceSpeed(speed)}). ` +
        `Le débit doit rester entre ${MIN_CHARS_PER_SECOND} et ${MAX_CHARS_PER_SECOND}. Prise refusée.`,
    );
  }
  return {
    audioDataUrl: `data:audio/mpeg;base64,${json.audio_base64}`,
    words,
    characters,
    textChars: text.trim().length,
  };
}

/** Nombre maximal de prises pour un même plan (aléa de génération). */
export const VOICE_MAX_ATTEMPTS = 3;

/**
 * Une prise au débit anormal est un ALÉA du fournisseur, pas un défaut de
 * configuration : on relance jusqu'à trois fois, une seconde entre chaque
 * tentative. Si une prise revient correcte, rien n'est signalé. Après trois
 * échecs, l'erreur d'origine remonte, plan et langue nommés.
 */
export async function generateElevenSpeechWithTimings(
  text: string,
  voiceId: string,
  language = "fr",
  context?: string,
  speed = DEFAULT_VOICE_SPEED,
): Promise<SpeechResult> {
  let last: unknown;
  for (let attempt = 1; attempt <= VOICE_MAX_ATTEMPTS; attempt++) {
    try {
      return await speechAttempt(text, voiceId, language, context, speed);
    } catch (e) {
      // Seul le débit anormal se relance : une erreur de plan, de voix ou de
      // texte tronqué se reproduirait à l'identique et coûterait pour rien.
      if (!(e instanceof AbnormalRateError)) throw e;
      last = e;
      if (attempt < VOICE_MAX_ATTEMPTS) await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw last instanceof Error
    ? new Error(`${last.message} (${VOICE_MAX_ATTEMPTS} prises consécutives refusées)`)
    : new Error("Voix off refusée après plusieurs tentatives.");
}

/** Voix FR recommandées, épinglées en tête de liste quand la langue active est le français. */
const CURATED_FR: { id: string; label: string }[] = [
  { id: "3HZyQcLKlT0a3RDeXVsP", label: "🇫🇷 ⭐ Guillaume — documentaire & storytelling" },
  { id: "aQROLel5sQbj1vuIVi6B", label: "🇫🇷 ⭐ Nicolas — narrateur" },
  { id: "EIe4oLyymVX7lKVYli9m", label: "🇫🇷 ⭐ Nicolas — narrateur audiobook" },
  { id: "2AGrjHJgmTgUqzy68M9W", label: "🇫🇷 ⭐ Nicolas Petit — voix grave" },
  { id: "93nuHbke4dTER9x2pDwE", label: "🇫🇷 ⭐ Adam — chaleureux, multilingue" },
  { id: "McVZB9hVxVSk3Equu8EH", label: "🇫🇷 ⭐ Audrey — dynamique, pub" },
  { id: "tVu7uvtKsrCoOPPIUVR7", label: "🇫🇷 ⭐ Guillaume — narrateur" },
];

const FLAGS: Record<string, string> = {
  fr: "🇫🇷",
  en: "🇬🇧",
  es: "🇪🇸",
  de: "🇩🇪",
  it: "🇮🇹",
  pt: "🇵🇹",
};

function flag(language: string) {
  return FLAGS[language.slice(0, 2).toLowerCase()] ?? "🌐";
}

/** Voix du compte + voix de la langue demandée dans la bibliothèque partagée (cette langue en premier). */
export async function listElevenVoices(
  language = "fr",
): Promise<{ id: string; label: string }[]> {
  const apiKey = apiKeyOrThrow();
  const headers = { "xi-api-key": apiKey };
  const lang = language.slice(0, 2).toLowerCase();
  const mark = flag(lang);

  const [ownRes, langRes] = await Promise.all([
    fetch("https://api.elevenlabs.io/v2/voices?page_size=100", { headers }),
    fetch(`https://api.elevenlabs.io/v1/shared-voices?page_size=100&language=${lang}`, {
      headers,
    }).catch(() => null),
  ]);


  if (!ownRes.ok) throw new Error(`ElevenLabs voices ${ownRes.status}: ${await ownRes.text()}`);
  const own = (await ownRes.json()) as {
    voices?: { voice_id: string; name: string; labels?: Record<string, string> }[];
  };

  const native: { id: string; label: string }[] = [];
  if (langRes && langRes.ok) {
    const shared = (await langRes.json()) as {
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
      native.push({ id: v.voice_id, label: `${mark} ${v.name}${bits ? ` — ${bits}` : ""}` });
    }
  }

  const seen = new Set(native.map((v) => v.id));
  const others: { id: string; label: string }[] = [];
  for (const v of own.voices ?? []) {
    if (seen.has(v.voice_id)) continue;
    const vLang = v.labels?.["language"];
    const bits = [vLang, v.labels?.["accent"], v.labels?.["description"], v.labels?.["use_case"]]
      .filter(Boolean)
      .join(", ");
    const isNative = (vLang ?? "").toLowerCase().startsWith(lang);
    const entry = {
      id: v.voice_id,
      label: `${isNative ? `${mark} ` : ""}${v.name}${bits ? ` — ${bits}` : ""}`,
    };
    if (isNative) native.unshift(entry);
    else others.push(entry);
  }

  const all = [...(lang === "fr" ? CURATED_FR : []), ...native, ...others];
  const uniq = new Set<string>();
  return all.filter((v) => (uniq.has(v.id) ? false : (uniq.add(v.id), true)));

}


/** Recherche par nom (voix de la langue demandée d'abord, puis global). */
export async function searchElevenVoices(
  query: string,
  language = "fr",
): Promise<{ id: string; label: string }[]> {
  const apiKey = apiKeyOrThrow();
  const headers = { "xi-api-key": apiKey };
  const q = encodeURIComponent(query.trim());
  if (!q) return [];
  const lang = language.slice(0, 2).toLowerCase();
  const mark = flag(lang);

  const fetchShared = async (url: string) => {
    try {
      const res = await fetch(url, { headers });
      if (!res.ok) return [];
      const json = (await res.json()) as {
        voices?: {
          voice_id: string;
          name: string;
          language?: string;
          gender?: string;
          age?: string;
          descriptive?: string;
          use_case?: string;
        }[];
      };
      return (json.voices ?? []).map((v) => {
        const bits = [v.gender, v.age, v.descriptive, v.use_case].filter(Boolean).join(", ");
        const native = (v.language ?? "").toLowerCase().startsWith(lang);
        return {
          id: v.voice_id,
          label: `${native ? `${mark} ` : ""}${v.name}${bits ? ` — ${bits}` : ""}`,
        };
      });
    } catch {
      return [];
    }
  };

  const [native, any] = await Promise.all([
    fetchShared(
      `https://api.elevenlabs.io/v1/shared-voices?page_size=40&language=${lang}&search=${q}`,
    ),
    fetchShared(`https://api.elevenlabs.io/v1/shared-voices?page_size=40&search=${q}`),
  ]);

  const seen = new Set<string>();
  return [...native, ...any].filter((v) => (seen.has(v.id) ? false : (seen.add(v.id), true)));
}
