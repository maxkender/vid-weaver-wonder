/**
 * Règles pures sur le type et le nombre de slides — partagées par le serveur
 * et l'écran d'administration.
 */
import type { SlideKind, SlideshowFormat } from "@/lib/slideshow-formats";

const KINDS: SlideKind[] = ["hook", "question", "reponse", "beat", "final"];

/** Pas du champ « nombre de slides » : 2 pour le quiz (compte pair). */
export function slideCountStep(format: SlideshowFormat): number {
  return format.id === "quiz" ? 2 : 1;
}

/** Ramène un nombre de slides dans les bornes (et à un nombre pair pour le quiz). */
export function normalizeSlideCount(format: SlideshowFormat, count: number): number {
  const ok =
    Number.isInteger(count) &&
    count >= format.slides.min &&
    count <= format.slides.max &&
    (format.id !== "quiz" || count % 2 === 0);
  return ok ? count : format.slides.min;
}

/** Type d'une slide, avec repli : 0 → hook, dernière → final, puis question/réponse. */
export function normalizeSlideKind(kind: unknown, position: number, total: number): SlideKind {
  if (typeof kind === "string" && (KINDS as string[]).includes(kind)) return kind as SlideKind;
  if (position === 0) return "hook";
  if (position === total - 1) return "final";
  return position % 2 === 1 ? "question" : "reponse";
}

/** Prompt d'image complet selon le type de slide. */
export function slideImagePrompt(prompt: string, kind: SlideKind, style: string): string {
  const rule =
    kind === "question"
      ? "\n\nDo NOT depict the answer to the question; show only the general category or setting."
      : kind === "reponse"
        ? "\n\nDepict the answer itself, large and unmistakable."
        : "";
  return `${prompt}${rule}\n\n${style}`;
}

/** Décomposition lisible : « 12 slides = 1 accroche + 5 questions + 1 barème ». */
export function slideBreakdown(format: SlideshowFormat, count: number): string {
  if (format.id === "quiz") {
    return `${count} slides = 1 accroche + ${(count - 2) / 2} questions + 1 barème`;
  }
  return `${count} slides = 1 accroche + ${count - 2} slides + 1 chute`;
}
