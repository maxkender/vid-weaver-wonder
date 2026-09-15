/**
 * Décision d'envoi du manifeste au service de rendu.
 *
 * Règle : un manifeste n'est envoyé qu'UNE fois. On ne renvoie que si aucun
 * rappel n'est revenu au bout d'un délai franc, et jamais plus de trois fois.
 * Pure fonction : testable sans réseau ni base.
 */

/** Délai d'attente du rappel avant de considérer l'envoi perdu. */
export const RENDER_CALLBACK_GRACE_MS = 15 * 60 * 1000;

/** Nombre maximum d'envois du manifeste pour un même travail. */
export const RENDER_MAX_SENDS = 3;

export const RENDER_GIVE_UP_MESSAGE = `Rendu sans réponse du service après ${RENDER_MAX_SENDS} envois`;

export type RenderSendDecision =
  | { action: "send" }
  | { action: "wait"; remainingMs: number }
  | { action: "giveup"; message: string };

export function decideRenderSend(input: {
  /** Nombre d'envois déjà effectués. */
  sends: number;
  /** Date ISO du dernier envoi, ou null si jamais envoyé. */
  sentAt: string | null;
  now?: number;
}): RenderSendDecision {
  const now = input.now ?? Date.now();
  const sends = Number.isFinite(input.sends) ? Math.max(0, input.sends) : 0;

  if (!input.sentAt || sends === 0) return { action: "send" };

  const last = Date.parse(input.sentAt);
  const elapsed = Number.isNaN(last) ? RENDER_CALLBACK_GRACE_MS : now - last;
  if (elapsed < RENDER_CALLBACK_GRACE_MS) {
    return { action: "wait", remainingMs: RENDER_CALLBACK_GRACE_MS - elapsed };
  }
  if (sends >= RENDER_MAX_SENDS) return { action: "giveup", message: RENDER_GIVE_UP_MESSAGE };
  return { action: "send" };
}
