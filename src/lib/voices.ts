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

export function defaultVoice(engine: VoiceEngine) {
  return engine === "elevenlabs" ? ELEVEN_VOICES[1]!.id : "ballad";
}
