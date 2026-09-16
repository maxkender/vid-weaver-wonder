/**
 * LÉGENDE ET HASHTAGS D'UNE VIDÉO, par langue.
 *
 * Module pur (navigateur et serveur). Il ne fabrique aucun texte payant : il
 * NORMALISE ce que le modèle a renvoyé dans l'appel de texte déjà existant, et
 * garantit qu'il y a TOUJOURS une légende et des hashtags livrables, même si la
 * génération a échoué ou est revenue vide. Une légende manquante ne doit jamais
 * empêcher une journée de sortir.
 */

/** Appel à l'action final, imposé, dans la langue de la vidéo. */
export const CAPTION_CTA: Record<string, string> = {
  fr: "Télécharge Sophia pour en apprendre plus.",
  en: "Download Sophia to learn more.",
  es: "Descarga Sophia para aprender más.",
  de: "Lade Sophia herunter, um mehr zu erfahren.",
  it: "Scarica Sophia per saperne di più.",
};

export function captionCta(language: string): string {
  return CAPTION_CTA[language] ?? CAPTION_CTA["fr"]!;
}

/** Marque : toujours en tête, identiques dans toutes les langues. */
export const BRAND_HASHTAGS = ["culture", "sophia"] as const;

/** Un hashtag propre : minuscules, sans accent, sans espace ni ponctuation. */
export function cleanHashtag(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/gi, "ss")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 30);
}

/**
 * Liste finale : `culture` et `sophia` d'abord, puis 3 à 5 hashtags du sujet.
 * Les doublons et les vides disparaissent, le `#` est retiré (il est ajouté à
 * l'affichage).
 */
export function normalizeHashtags(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value.map((v) => (typeof v === "string" ? v : ""))
    : typeof value === "string"
      ? value.split(/[\s,;]+/)
      : [];
  const out: string[] = [...BRAND_HASHTAGS];
  for (const item of raw) {
    for (const part of item.split(/[\s,;#]+/)) {
      const tag = cleanHashtag(part);
      if (tag && !out.includes(tag)) out.push(tag);
      if (out.length >= 7) return out;
    }
  }
  return out;
}

/** Deux premières phrases d'un texte, sans le couper au milieu d'un mot. */
function firstSentences(text: string, count = 2): string {
  const parts = text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?…])\s+/)
    .filter(Boolean);
  return parts.slice(0, count).join(" ").trim();
}

/** Repli : l'accroche du plan 1 plus l'appel à l'action de la langue. */
export function fallbackCaption(hook: string, language: string): string {
  const base = firstSentences(hook || "");
  const cta = captionCta(language);
  return base ? `${base.replace(/[.!?…]*$/, ".")} ${cta}` : cta;
}

/**
 * Forme livrable garantie : légende non vide terminée par l'appel à l'action,
 * hashtags de marque en tête.
 */
export function buildSocialCopy(input: {
  caption?: unknown;
  hashtags?: unknown;
  hook?: string;
  language: string;
}): { caption: string; hashtags: string[] } {
  const cta = captionCta(input.language);
  let caption = typeof input.caption === "string" ? input.caption.replace(/\s+/g, " ").trim() : "";
  // Jamais plus de trois phrases : elle doit tenir sans « voir plus ».
  if (caption) caption = firstSentences(caption, 3);
  if (!caption) caption = fallbackCaption(input.hook ?? "", input.language);
  if (!caption.toLowerCase().includes(cta.slice(0, 12).toLowerCase())) {
    caption = `${caption.replace(/\s*$/, "")} ${cta}`.trim();
  }
  return { caption, hashtags: normalizeHashtags(input.hashtags) };
}
