export type VoiceEngine = "lovable" | "elevenlabs";

export const LOVABLE_VOICES = [
  { id: "ballad", label: "Ballad — narrateur posé" },
  { id: "ash", label: "Ash — grave" },
  { id: "sage", label: "Sage — calme" },
  { id: "verse", label: "Verse — expressif" },
  { id: "alloy", label: "Alloy — neutre" },
  { id: "coral", label: "Coral — chaleureuse" },
];

export const ELEVEN_VOICES = [
  { id: "9BWtsMINqrJLrRacOk9x", label: "Aria — chaleureuse" },
  { id: "JBFqnCBsd6RMkjVDRZzb", label: "George — narrateur doc" },
  { id: "onwK4e9ZLuTAKqWW03F9", label: "Daniel — grave, posé" },
  { id: "XrExE9yKIg1WjnnlVkGX", label: "Matilda — claire, jeune" },
  { id: "N2lVS1w4EtoT3dr4eOWO", label: "Callum — intense" },
  { id: "EXAVITQu4vr4xnSDxMaL", label: "Sarah — douce" },
];

export function voicesFor(engine: VoiceEngine) {
  return engine === "elevenlabs" ? ELEVEN_VOICES : LOVABLE_VOICES;
}

/** Narrateur ElevenLabs par défaut pour chaque langue produite. */
export const DEFAULT_ELEVEN_VOICE_BY_LANG: Record<string, string> = {
  fr: "3HZyQcLKlT0a3RDeXVsP",
  en: "JBFqnCBsd6RMkjVDRZzb",
  es: "o0SveC0zgHFuCsEO3vHR",
  de: "NlRO8ABjJNJNYaRaLiPJ",
  it: "32vqZVYOe7sQVGys0soJ",
  pt: "3HZyQcLKlT0a3RDeXVsP", // pas de voix native connue : on garde la voix française
};

export function defaultVoice(engine: VoiceEngine) {
  return engine === "elevenlabs" ? ELEVEN_VOICES[1]!.id : "ballad";
}

/** Voix par défaut selon le moteur ET la langue (utilisée tant que rien n'est choisi). */
export function defaultVoiceFor(engine: VoiceEngine, language: string) {
  if (engine !== "elevenlabs") return "ballad";
  return DEFAULT_ELEVEN_VOICE_BY_LANG[language.slice(0, 2).toLowerCase()] ?? defaultVoice(engine);
}

/** Un ID ElevenLabs est une chaîne alphanumérique d'une vingtaine de caractères. */
export function isValidElevenVoiceId(id: string) {
  return /^[A-Za-z0-9]{15,32}$/.test(id.trim());
}
