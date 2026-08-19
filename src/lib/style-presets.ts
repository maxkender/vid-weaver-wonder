/**
 * Réglages par défaut, partagés client (page Paramètres) et serveur (prompts).
 * Ce fichier ne doit contenir que des données : il est importé dans le bundle client.
 */

export type NarrationStyleId = "question" | "revelation" | "storytelling" | "listicle";
export type VisualStyleId = "papercraft" | "cinematique" | "documentaire" | "retro";

export const NARRATION_LABELS: Record<NarrationStyleId, string> = {
  question: "Grande question",
  revelation: "Révélation",
  storytelling: "Récit immersif",
  listicle: "Énumération",
};

export const VISUAL_LABELS: Record<VisualStyleId, string> = {
  papercraft: "Papier découpé",
  cinematique: "Cinématique",
  documentaire: "Documentaire",
  retro: "Rétro 70s",
};

export const DEFAULT_STYLE_BRIEF: Record<NarrationStyleId, string> = {
  question:
    "Style « grande question » : ouvre sur un événement connu puis retourne-le en question (« mais savez-vous vraiment… ? »), puis déroule les causes/explications une par une, de façon claire et argumentée.",
  revelation:
    "Style « révélation » : phrases courtes, sèches, percutantes. On avance indice par indice, chaque scène ajoute un détail troublant, et la fin retourne complètement la première impression (« sauf que des siècles plus tard… »).",
  storytelling:
    "Style « récit » : on raconte une scène vécue, avec des personnages, des lieux, des sensations. Présent de narration, immersif, cinématographique.",
  listicle:
    "Style « énumération » : une idée forte et surprenante par scène, enchaînées à un rythme rapide, avec une montée en intensité vers la plus dingue.",
};

export const DEFAULT_VISUAL_BRIEF: Record<VisualStyleId, string> = {
  papercraft:
    "handmade layered paper cut-out diorama photographed head-on, flat frontal composition, stacked planes of matte construction paper with torn deckled edges and visible paper grain, simple bold silhouettes with no fine detail, characters and objects built from flat cut shapes with slight relief, soft diffused studio light casting gentle drop shadows between paper layers, a cohesive limited palette of 4 to 5 flat matte paper colors chosen to fit the mood of this specific scene, no gradients, no realistic textures, no 3D render look, stop-motion paper animation aesthetic, calm and graphic, quiet minimal background of layered paper shapes",
  cinematique:
    "photorealistic cinematic still, anamorphic lens, dramatic volumetric lighting, shallow depth of field, rich film grain, teal and amber grade",
  documentaire:
    "documentary photography look, natural light, realistic textures, muted colors, archival feel, 35mm",
  retro: "retro 1970s film still, faded kodachrome colors, soft grain, slight halation, vintage",
};

export const DEFAULT_QUALITY: Record<VisualStyleId, string> = {
  papercraft:
    "shot straight on like a real photograph of a physical paper set, shallow relief depth, crisp paper edges, no digital illustration look, no cartoon outlines, no glossy plastic, no clay",
  cinematique: "ultra detailed, high fidelity",
  documentaire: "ultra detailed, realistic",
  retro: "detailed, analog film look",
};

export const DEFAULT_MOTION: Record<VisualStyleId, string> = {
  papercraft:
    "Stop-motion paper animation: the paper cut-outs move in small discrete steps, slight handmade jitter, layers sliding over each other, static or very slow push-in camera.",
  cinematique: "Slow cinematic camera movement, subtle parallax.",
  documentaire: "Handheld documentary camera, very subtle movement.",
  retro: "Gentle vintage camera drift, slight handheld sway.",
};

/** Réglages modifiables depuis la page Paramètres. */
export type StudioSettings = {
  narration: Record<NarrationStyleId, { brief: string; wordsBias: number }>;
  visual: Record<
    VisualStyleId,
    { brief: string; quality: string; motion: string; square: boolean }
  >;
  /** Cohérence visuelle : réutiliser la 1ʳᵉ image comme référence des suivantes. */
  useReferenceImage: boolean;
  /** Volume de la musique de fond dans l'export. */
  musicVolume: number;
  /** Logo Sophia qui apparaît quand la voix dit « Sophia ». */
  sophiaLogo: boolean;
};

export function defaultSettings(): StudioSettings {
  const narration = {} as StudioSettings["narration"];
  (Object.keys(DEFAULT_STYLE_BRIEF) as NarrationStyleId[]).forEach((k) => {
    narration[k] = { brief: DEFAULT_STYLE_BRIEF[k], wordsBias: 0 };
  });
  const visual = {} as StudioSettings["visual"];
  (Object.keys(DEFAULT_VISUAL_BRIEF) as VisualStyleId[]).forEach((k) => {
    visual[k] = {
      brief: DEFAULT_VISUAL_BRIEF[k],
      quality: DEFAULT_QUALITY[k],
      motion: DEFAULT_MOTION[k],
      square: k === "papercraft",
    };
  });
  return { narration, visual, useReferenceImage: true, musicVolume: 0.14, sophiaLogo: true };
}

const KEY = "studio-settings-v1";

export function loadSettings(): StudioSettings {
  const base = defaultSettings();
  if (typeof window === "undefined") return base;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw) as Partial<StudioSettings>;
    return {
      ...base,
      ...saved,
      narration: { ...base.narration, ...(saved.narration ?? {}) },
      visual: { ...base.visual, ...(saved.visual ?? {}) },
    };
  } catch {
    return base;
  }
}

export function saveSettings(settings: StudioSettings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(settings));
}
