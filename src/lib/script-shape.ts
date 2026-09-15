/**
 * FORME DU SCRIPT — GARDE-FOU.
 *
 * Le modèle peut renvoyer un champ sous une forme inattendue : `hashtags` en
 * chaîne au lieu d'un tableau, `scenes` absent, `cta` en objet… Un `.map()` sur
 * une chaîne casse tout l'arbre React et rend le studio inutilisable.
 *
 * Ce module ramène TOUJOURS le script à une forme sûre, à la réception comme au
 * rechargement depuis l'historique du navigateur. Module pur, utilisable côté
 * navigateur comme côté serveur.
 */

export type SafeScene = {
  index: number;
  narration: string;
  overlay: string;
  imagePrompt: string;
  videoPrompt: string;
};

export type SafeScript = {
  title: string;
  hook: string;
  hookOptions?: string[];
  hookScores?: string[];
  hookChoice?: string;
  audit?: { weakest: number; reason: string; learned: string };
  scenes: SafeScene[];
  cta: string;
  hashtags: string[];
  characters?: { name: string; description: string }[];
  palette?: string;
};

/** Texte : une chaîne reste une chaîne, tout le reste devient vide. */
export function asText(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

/**
 * Liste de textes : un tableau est conservé, une chaîne est découpée sur les
 * virgules, les points-virgules et les retours à la ligne, le reste est vide.
 */
export function asTextList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => asText(v).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/[,;\n]+/)
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
}

/** Hashtags : découpés aussi sur les espaces, chacun préfixé d'un `#`. */
export function asHashtags(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value.map((v) => asText(v))
    : typeof value === "string"
      ? [value]
      : [];
  const out: string[] = [];
  for (const chunk of raw) {
    for (const part of chunk.split(/[\s,;]+/)) {
      const tag = part.trim().replace(/^#+/, "");
      if (tag && !out.includes(`#${tag}`)) out.push(`#${tag}`);
    }
  }
  return out;
}

/**
 * CONVENTION UNIQUE : l'index d'un plan est SA POSITION DANS LA LISTE, à
 * partir de 0. C'est aussi la clé de stockage de ses médias. Le numéro montré
 * à l'utilisateur est `index + 1`, jamais la clé.
 */
function asScene(value: unknown, index: number): SafeScene {
  const o = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return {
    index,
    narration: asText(o["narration"]),
    overlay: asText(o["overlay"]),
    imagePrompt: asText(o["imagePrompt"]),
    videoPrompt: asText(o["videoPrompt"]),
  };
}

function asCharacters(value: unknown): { name: string; description: string }[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => {
      if (typeof v === "string") return { name: v.trim(), description: "" };
      const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
      return { name: asText(o["name"]).trim(), description: asText(o["description"]).trim() };
    })
    .filter((c) => c.name || c.description);
}

function asAudit(value: unknown): SafeScript["audit"] {
  if (!value || typeof value !== "object") return undefined;
  const o = value as Record<string, unknown>;
  const weakest = Number(o["weakest"]);
  return {
    weakest: Number.isFinite(weakest) ? weakest : 0,
    reason: asText(o["reason"]),
    learned: asText(o["learned"]),
  };
}

/**
 * Ramène n'importe quelle valeur à un script affichable sans risque.
 * Les champs facultatifs absents restent absents.
 */
export function normalizeScript(value: unknown): SafeScript {
  const o = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const scenesRaw = Array.isArray(o["scenes"]) ? (o["scenes"] as unknown[]) : [];
  const hookOptions = asTextList(o["hookOptions"]);
  const hookScores = asTextList(o["hookScores"]);
  const characters = asCharacters(o["characters"]);
  const audit = asAudit(o["audit"]);
  const palette = asText(o["palette"]).trim();
  const hookChoice = asText(o["hookChoice"]).trim();

  return {
    title: asText(o["title"]),
    hook: asText(o["hook"]),
    scenes: scenesRaw.map(asScene),
    cta: asText(o["cta"]),
    hashtags: asHashtags(o["hashtags"]),
    ...(hookOptions.length ? { hookOptions } : {}),
    ...(hookScores.length ? { hookScores } : {}),
    ...(hookChoice ? { hookChoice } : {}),
    ...(audit ? { audit } : {}),
    ...(characters.length ? { characters } : {}),
    ...(palette ? { palette } : {}),
  };
}

/** Normalise un dictionnaire de scripts par langue. */
export function normalizeScripts(value: unknown): Record<string, SafeScript> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, SafeScript> = {};
  for (const [lang, script] of Object.entries(value as Record<string, unknown>)) {
    if (script && typeof script === "object") out[lang] = normalizeScript(script);
  }
  return out;
}
