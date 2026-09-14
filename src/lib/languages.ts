/** Langues disponibles pour la narration (script + voix + sous-titres). */
export const LANGUAGES = [
  { id: "fr", label: "Français", name: "français de France", locale: "fr-FR" },
  { id: "en", label: "English", name: "English (neutral, US)", locale: "en-US" },
  { id: "es", label: "Español", name: "español de España", locale: "es-ES" },
  { id: "de", label: "Deutsch", name: "Deutsch (Hochdeutsch)", locale: "de-DE" },
  { id: "it", label: "Italiano", name: "italiano", locale: "it-IT" },
  { id: "pt", label: "Português", name: "português do Brasil", locale: "pt-BR" },
] as const;

export type LanguageId = (typeof LANGUAGES)[number]["id"];

export const LANGUAGE_IDS = LANGUAGES.map((l) => l.id) as unknown as [
  LanguageId,
  ...LanguageId[],
];

/**
 * Langues du MASTER multilingue : un même master (script + images + clips) est
 * décliné dans ces langues sans jamais régénérer un visuel.
 */
export const MASTER_LANGUAGE_IDS = ["fr", "en", "es", "de"] as const;
export type MasterLanguageId = (typeof MASTER_LANGUAGE_IDS)[number];

export const MASTER_LANGUAGES = LANGUAGES.filter((l) =>
  (MASTER_LANGUAGE_IDS as readonly string[]).includes(l.id),
);

export function languageName(id: string): string {
  return LANGUAGES.find((l) => l.id === id)?.name ?? "français de France";
}

export function languageLabel(id: string): string {
  return LANGUAGES.find((l) => l.id === id)?.label ?? "Français";
}
