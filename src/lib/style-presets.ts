/**
 * Réglages par défaut, partagés client (page Paramètres) et serveur (prompts).
 * Ce fichier ne doit contenir que des données : il est importé dans le bundle client.
 */

export type NarrationStyleId =
  | "question"
  | "revelation"
  | "storytelling"
  | "listicle"
  | "mecanique";
export type VisualStyleId = "papercraft" | "cinematique" | "documentaire" | "retro";

export const NARRATION_LABELS: Record<NarrationStyleId, string> = {
  question: "Grande question",
  revelation: "Révélation",
  storytelling: "Récit immersif",
  listicle: "Énumération",
  mecanique: "Mécanique",
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
  mecanique:
    "Style « mécanique » : on explique comment une chose marche vraiment, étape par étape, avec des chiffres précis, jusqu'à une conséquence qu'on n'attendait pas. Phrases très courtes, phrases nominales assumées, aucun retournement forcé.",
};

export const DEFAULT_VISUAL_BRIEF: Record<VisualStyleId, string> = {
  papercraft:
    "handmade layered paper cut-out diorama photographed head-on, flat frontal composition, stacked planes of matte construction paper with torn deckled edges and visible paper grain, simple bold silhouettes with no fine detail, characters and objects built from flat cut shapes with slight relief, soft diffused studio light casting gentle drop shadows between paper layers, a cohesive limited palette of 4 to 5 flat matte paper colors chosen to fit the mood of this specific scene, no gradients, no realistic textures, no 3D render look, stop-motion paper animation aesthetic, calm and graphic, quiet minimal background of layered paper shapes, and ALWAYS exactly ONE element in a vivid saturated red (the recurring red accent object of this video), placed at the center of the composition or right next to the main subject so it pops against the cool palette — never two or more red elements, a single red focal point per shot",
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
    "Smooth continuous paper animation: the paper layers glide over each other in one steady, perfectly fluid motion, gentle parallax between the depth planes, slow constant camera push, motion rendered at full frame rate with natural motion blur. Absolutely no stop-motion, no frame-by-frame stepping, no discrete jumps, no jitter, no shaking, no strobing: the paper moves as if pushed by one slow, steady hand.",
  cinematique: "Slow cinematic camera movement, subtle parallax.",
  documentaire: "Handheld documentary camera, very subtle movement.",
  retro: "Gentle vintage camera drift, slight handheld sway.",
};

/**
 * PLAN 1 — cas particulier, quel que soit le style visuel choisi.
 * Le spectateur décide de scroller pendant la première seconde : le plan
 * d'ouverture ne doit jamais être contemplatif.
 */
export const DEFAULT_OPENING_MOTION =
  "OPENING SHOT — this is the very first second of the video and it must stop the scroll. A visual event STARTS ON THE VERY FIRST FRAME and is finished before the end of the first second: an element drops, slides or bursts into frame, or a paper layer swings aside to reveal the subject, or a fast camera push that settles immediately after. No slow build-up, no still or contemplative opening, nothing that waits. After that first second the shot can settle and stay calm. The motion stays smooth and continuous, never stepped or jittery.";

/**
 * NIVEAU DE LANGUE — contrainte commune à l'écriture ET à la traduction.
 * Le public a quinze à vingt-cinq ans et regarde au pouce : un mot savant
 * coûte un spectateur.
 */
export const DEFAULT_LANGUAGE_BRIEF = [
  "NIVEAU DE LANGUE (règle éliminatoire, à vérifier phrase par phrase) : tu écris comme tu parles à un ami de quinze ans. Mots du quotidien UNIQUEMENT.",
  "Remplacements obligatoires, et tous les mots du même registre : « déterrer » et jamais « exhumer » · « os » et jamais « ossements » · « prouver » et jamais « corroborer » · « découvrir » et jamais « mettre au jour » · « montrer » et jamais « attester » · « se servir de » et jamais « utiliser à des fins de ».",
  "INTERDIT : le vocabulaire savant, littéraire, scientifique ou administratif, les mots qu'on ne dit jamais à l'oral, et toutes les tournures passives (« fut découvert par », « a été mis en évidence »). On écrit à la voix active.",
  "Phrases courtes. UNE idée par phrase. Sujet, verbe, complément. Pas de subordonnées empilées, pas d'incises, pas de participes présents.",
  "Aucune date, aucun nom propre difficile à prononcer, aucun terme technique sans qu'il soit expliqué DANS LA MÊME PHRASE par une image concrète que tout le monde a déjà vue.",
  "Si un mot technique est vraiment indispensable au sujet, il est traduit en langage courant dès la phrase suivante (« des trichobothries. Des poils si fins qu'ils sentent l'air bouger. »).",
].join("\n");

/** ACCROCHE — le plan 1 a ses propres règles, ce sont les plus importantes. */
export const DEFAULT_HOOK_BRIEF = [
  "L'ACCROCHE (plan 1) : c'est la phrase la plus importante des soixante secondes, elle décide si la personne arrête de scroller.",
  "DOUZE MOTS MAXIMUM. On attaque DIRECTEMENT par la chose étrange. Jamais de mise en contexte, jamais « saviez-vous que », jamais une date, jamais un lieu en ouverture.",
  "Elle crée un MANQUE : le spectateur doit sentir qu'il lui manque une information et vouloir la suite. On AFFIRME d'abord, on explique après.",
  "On s'adresse à la personne, avec « tu », dès que le sujet le permet.",
  "Elle se comprend SANS l'image ; l'image la renforce sans la répéter.",
  "TU PROPOSES TROIS accroches différentes dans hookOptions, puis tu choisis la meilleure selon ces critères : elle devient le champ hook ET la narration du plan 1, mot pour mot. Tu justifies ton choix en UNE ligne dans hookChoice.",
].join("\n");

/**
 * TYPES DE PLAN — ce qui doit CHANGER d'un plan à l'autre. La signature de la
 * chaîne (papier découpé, palette, lumière, unique élément rouge) ne bouge
 * jamais ; le sujet, l'échelle et le cadrage, eux, changent à chaque plan.
 */
export const SHOT_TYPES = [
  {
    id: "macro",
    label: "Très gros plan sur un détail",
    prompt:
      "SHOT TYPE — EXTREME CLOSE-UP on a single small detail (a texture, a crack, an edge, a tiny object), the detail fills almost the whole square, no wide context visible",
    keywords: ["détail", "minuscule", "poil", "grain", "fissure", "trace", "micro", "fin"],
  },
  {
    id: "wide",
    label: "Plan large sur un lieu",
    prompt:
      "SHOT TYPE — WIDE ESTABLISHING SHOT of a place, the environment fills the square, subjects are small inside the landscape, clear horizon line",
    keywords: ["lieu", "ville", "île", "grotte", "paysage", "désert", "mer", "forêt", "montagne"],
  },
  {
    id: "object",
    label: "Objet seul sur fond uni",
    prompt:
      "SHOT TYPE — SINGLE OBJECT ISOLATED on a plain flat one-colour paper background, centred, studio-like, nothing else in the frame, no scenery",
    keywords: ["objet", "outil", "machine", "crâne", "pièce", "arme", "instrument", "os"],
  },
  {
    id: "hands",
    label: "Mains qui manipulent",
    prompt:
      "SHOT TYPE — A PAIR OF HANDS holding or manipulating the object, seen from just above, close framing on the hands and the object only, no full body, no face",
    keywords: ["main", "tenir", "fabriquer", "creuser", "toucher", "geste", "poser", "ouvrir"],
  },
  {
    id: "diagram",
    label: "Coupe ou schéma papier",
    prompt:
      "SHOT TYPE — CROSS-SECTION DIAGRAM built out of cut paper layers, flat graphic explanatory view with simple arrows made of paper strips, no words, no letters, no numbers",
    keywords: ["mécanisme", "fonctionne", "étape", "couche", "intérieur", "coupe", "système"],
  },
  {
    id: "silhouette",
    label: "Silhouette à contre-jour",
    prompt:
      "SHOT TYPE — BACKLIT SILHOUETTE, the subject is a dark flat paper shape against a bright glowing paper background, strong graphic contrast, no facial detail",
    keywords: ["nuit", "peur", "mystère", "ombre", "seul", "disparaît", "danger", "fuite"],
  },
  {
    id: "map",
    label: "Carte vue du dessus",
    prompt:
      "SHOT TYPE — TOP-DOWN MAP VIEW, the scene seen straight from above like a paper map or a floor plan, flat overhead perspective, no words, no letters, no place names",
    keywords: ["carte", "région", "trajet", "distance", "route", "pays", "territoire", "position"],
  },
  {
    id: "face",
    label: "Visage en gros plan",
    prompt:
      "SHOT TYPE — CLOSE-UP ON ONE FACE made of cut paper, head and shoulders only, filling the square, simple expressive features, plain background",
    keywords: ["homme", "femme", "enfant", "visage", "regard", "chercheur", "témoin", "roi"],
  },
] as const;

export type ShotTypeId = (typeof SHOT_TYPES)[number]["id"];

export const DEFAULT_SHOT_BRIEF = [
  "ROTATION DES PLANS (ce qui doit CHANGER à chaque plan) : le style papier découpé, la palette, la lumière et l'unique élément rouge vif restent EXACTEMENT les mêmes d'un plan à l'autre — c'est la signature de la chaîne.",
  "En revanche le SUJET, l'ÉCHELLE et le CADRAGE changent à chaque plan. Deux plans qui se suivent ne montrent JAMAIS le même sujet, dans le même décor, à la même distance.",
  "Chaque plan reçoit un TYPE DE PLAN imposé, choisi selon ce que raconte son texte, et deux plans voisins ne peuvent jamais partager le même type : très gros plan sur un détail · plan large sur un lieu · objet seul sur fond uni · mains qui tiennent ou manipulent · coupe ou schéma en papier découpé · silhouette à contre-jour · carte vue du dessus · visage en gros plan.",
].join("\n");

export const DEFAULT_OPENING_IMAGE =
  "OPENING SHOT COMPOSITION — treat this like a poster, not an ambient illustration. ONE single subject, huge in the frame, filling most of the square, instantly readable on a phone in a third of a second. The red accent element is clearly visible on or right next to that subject. No empty scenery, no wide establishing shot, no crowded or talkative composition, no small distant subject.";

/** Réglages modifiables depuis la page Paramètres. */
export type StudioSettings = {
  narration: Record<NarrationStyleId, { brief: string; wordsBias: number }>;
  visual: Record<
    VisualStyleId,
    { brief: string; quality: string; motion: string; square: boolean }
  >;
  /** Consignes propres au plan 1 (accroche), appliquées à tous les styles. */
  opening: { motion: string; image: string };
  /**
   * Consignes éditoriales communes : niveau de langue, accroche, rotation des
   * types de plan. Elles s'appliquent à l'écriture, à la traduction et aux images.
   */
  guides: { language: string; hook: string; shots: string };
  /** Cohérence visuelle : réutiliser la 1ʳᵉ image comme référence des suivantes. */
  useReferenceImage: boolean;
  /** Volume de la musique de fond dans l'export. */
  musicVolume: number;
  /** Logo Sophia qui apparaît quand la voix dit « Sophia ». */
  sophiaLogo: boolean;
  /** Export et génération en 1080p (plans de 8 s imposés par le modèle vidéo). */
  hd: boolean;
  /** Pré-composer le carré au centre d'un cadre 9:16 avant d'animer le plan. */
  precomposeSquare: boolean;
  /** Ajouter le plan CTA Sophia à la fin du script. */
  sophiaCta: boolean;
  /**
   * Mode brouillon : plans commandés en 720×1280 et durées libres (4/6/8 s).
   * L'export reste en 1080×1920, l'image est simplement agrandie.
   */
  draft720: boolean;
  /** Plafond de dépense par vidéo, en secondes de vidéo IA commandées. */
  spendCapSeconds: number;
  /** Rythme de lecture de la voix off (0,9 à 1,15). */
  voiceSpeed: number;
  /** Tarif d'une seconde de vidéo IA, en euros. null = non renseigné. */
  priceVideoSecond: number | null;
  /** Tarif d'une image générée, en euros. null = non renseigné. */
  priceImage: number | null;
  /**
   * Champs de texte réellement modifiés à la main par l'utilisateur.
   * Clés de la forme `narration.<style>.brief` ou `visual.<style>.brief|quality|motion`.
   * Tout champ ABSENT de cette liste est repris du défaut livré à chaque
   * chargement : une amélioration des consignes profite immédiatement à tous,
   * sans être écrasée par une vieille copie figée dans le navigateur.
   */
  customFields: string[];
};

/** Chemins de champs texte personnalisables. */
export type FieldPath = string;

export function narrationPath(id: NarrationStyleId): FieldPath {
  return `narration.${id}.brief`;
}
export function visualPath(id: VisualStyleId, key: "brief" | "quality" | "motion"): FieldPath {
  return `visual.${id}.${key}`;
}
export function openingPath(key: "motion" | "image"): FieldPath {
  return `opening.first.${key}`;
}

/** Valeur livrée (à jour) d'un champ texte. */
export function defaultFieldValue(path: FieldPath): string {
  const [group, id, key] = path.split(".");
  if (group === "narration") return DEFAULT_STYLE_BRIEF[id as NarrationStyleId] ?? "";
  if (group === "opening")
    return key === "motion" ? DEFAULT_OPENING_MOTION : DEFAULT_OPENING_IMAGE;
  if (key === "brief") return DEFAULT_VISUAL_BRIEF[id as VisualStyleId] ?? "";
  if (key === "quality") return DEFAULT_QUALITY[id as VisualStyleId] ?? "";
  if (key === "motion") return DEFAULT_MOTION[id as VisualStyleId] ?? "";
  return "";
}

function readField(settings: StudioSettings, path: FieldPath): string {
  const [group, id, key] = path.split(".");
  if (group === "narration") return settings.narration[id as NarrationStyleId]?.brief ?? "";
  if (group === "opening") return settings.opening?.[key as "motion" | "image"] ?? "";
  const v = settings.visual[id as VisualStyleId];
  return (v?.[key as "brief" | "quality" | "motion"] as string) ?? "";
}

function writeField(settings: StudioSettings, path: FieldPath, value: string): StudioSettings {
  const [group, id, key] = path.split(".");
  if (group === "narration") {
    const k = id as NarrationStyleId;
    return {
      ...settings,
      narration: { ...settings.narration, [k]: { ...settings.narration[k], brief: value } },
    };
  }
  if (group === "opening") {
    return { ...settings, opening: { ...settings.opening, [key as string]: value } };
  }
  const k = id as VisualStyleId;
  return {
    ...settings,
    visual: { ...settings.visual, [k]: { ...settings.visual[k], [key as string]: value } },
  };
}

/** Le champ diverge-t-il du défaut livré ? */
export function isCustomField(settings: StudioSettings, path: FieldPath) {
  return (settings.customFields ?? []).includes(path);
}

/** Écrit un champ et le marque comme personnalisé (ou le démarque s'il redevient identique). */
export function setField(
  settings: StudioSettings,
  path: FieldPath,
  value: string,
): StudioSettings {
  const next = writeField(settings, path, value);
  const marks = new Set(next.customFields ?? []);
  if (value.trim() === defaultFieldValue(path).trim()) marks.delete(path);
  else marks.add(path);
  return { ...next, customFields: [...marks] };
}

/** Revient à la valeur livrée et oublie la personnalisation. */
export function resetField(settings: StudioSettings, path: FieldPath): StudioSettings {
  const next = writeField(settings, path, defaultFieldValue(path));
  return { ...next, customFields: (next.customFields ?? []).filter((p) => p !== path) };
}

/**
 * Anciennes valeurs par défaut livrées, pour la migration silencieuse des
 * réglages enregistrés AVANT l'existence de `customFields`. Si la valeur
 * enregistrée correspond à une ancienne valeur livrée, l'utilisateur ne l'a
 * jamais éditée : on la remplace par le défaut à jour.
 */
const LEGACY_DEFAULTS: Record<FieldPath, string[]> = {
  // Brief papier découpé d'avant l'accent rouge obligatoire.
  "visual.papercraft.brief": [
    DEFAULT_VISUAL_BRIEF.papercraft.split(", and ALWAYS exactly ONE element")[0]!,
  ],
  // Ancienne consigne d'animation saccadée (stop-motion image par image).
  "visual.papercraft.motion": [
    "Stop-motion paper animation: the paper cut-outs move in small discrete steps, slight handmade jitter, layers sliding over each other, static or very slow push-in camera.",
  ],
};

/** Anciennes valeurs par défaut des réglages numériques/booléens. */
const LEGACY_MUSIC_VOLUMES = [0.14];

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
  return {
    narration,
    visual,
    opening: { motion: DEFAULT_OPENING_MOTION, image: DEFAULT_OPENING_IMAGE },
    useReferenceImage: true,
    musicVolume: 0.22,
    sophiaLogo: true,
    hd: true,
    precomposeSquare: true,
    // Pas de plan publicitaire par défaut : il coûte un plan animé de plus
    // (environ 11 % du budget) et la vidéo retient mieux sans lui.
    sophiaCta: false,
    draft720: false,
    spendCapSeconds: 72,
    voiceSpeed: 1.05,
    // Aucun prix inventé : tant que l'utilisateur n'a pas saisi ses tarifs,
    // le récapitulatif n'affiche que des quantités.
    priceVideoSecond: null,
    priceImage: null,
    customFields: [],
  };
}

const KEY = "studio-settings-v1";

/** Tous les champs texte personnalisables. */
export function allFieldPaths(): FieldPath[] {
  return [
    ...(Object.keys(DEFAULT_STYLE_BRIEF) as NarrationStyleId[]).map(narrationPath),
    ...(Object.keys(DEFAULT_VISUAL_BRIEF) as VisualStyleId[]).flatMap((id) =>
      (["brief", "quality", "motion"] as const).map((k) => visualPath(id, k)),
    ),
    ...(["motion", "image"] as const).map((k) => openingPath(k)),
  ];
}

export function loadSettings(): StudioSettings {
  const base = defaultSettings();
  if (typeof window === "undefined") return base;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw) as Partial<StudioSettings>;
    let merged: StudioSettings = {
      ...base,
      ...saved,
      narration: { ...base.narration, ...(saved.narration ?? {}) },
      visual: { ...base.visual, ...(saved.visual ?? {}) },
      opening: { ...base.opening, ...(saved.opening ?? {}) },
      customFields: saved.customFields ?? [],
    };

    // Migration silencieuse du volume musical : une valeur enregistrée
    // identique à un ancien défaut livré n'a jamais été réglée à la main.
    if (
      typeof saved.musicVolume === "number" &&
      LEGACY_MUSIC_VOLUMES.some((v) => Math.abs(saved.musicVolume! - v) < 1e-6)
    ) {
      merged = { ...merged, musicVolume: base.musicVolume };
    }

    const migrating = !Array.isArray(saved.customFields);
    const marks = new Set(merged.customFields);

    for (const path of allFieldPaths()) {
      const savedValue = readField(merged, path).trim();
      const def = defaultFieldValue(path);
      if (migrating) {
        // On ne sait pas ce qui a été édité : on compare aux valeurs livrées,
        // actuelle et anciennes. Identique ⇒ jamais édité ⇒ on reprend le
        // défaut à jour. Différent ⇒ personnalisation réelle ⇒ on la garde.
        const known = [def, ...(LEGACY_DEFAULTS[path] ?? [])].map((s) => s.trim());
        if (!savedValue || known.includes(savedValue)) {
          merged = writeField(merged, path, def);
          marks.delete(path);
        } else {
          marks.add(path);
        }
        continue;
      }
      // Fonctionnement normal : un champ jamais édité suit toujours le défaut.
      if (!marks.has(path)) merged = writeField(merged, path, def);
    }

    return { ...merged, customFields: [...marks] };
  } catch {
    return base;
  }
}

export function saveSettings(settings: StudioSettings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(settings));
}

