/**
 * RÈGLES PURES DE LA PRODUCTION AUTOMATIQUE (testables, sans base ni réseau).
 *
 * Objectif : une nuit de production doit se dérouler sans personne devant
 * l'écran. Ces fonctions décident QUOI faire ; `auto.server.ts` les applique.
 */

/** Nombre maximal de relances automatiques d'un travail en échec. */
export const AUTO_RETRY_MAX = 3;

/** Délai franc avant chaque relance automatique (quelques minutes). */
export const AUTO_RETRY_DELAY_MS = 5 * 60_000;

/** Étape marquant un échec DÉFINITIF (relances épuisées ou erreur bloquante). */
export const FINAL_FAILURE_STEP = "failed_final";

/**
 * Erreurs qui gardent leur VETO immédiat : crédits, paiement, politique.
 * Jamais de relance automatique dessus — on ne brûle pas d'argent en boucle.
 */
export function isFatalFailure(message: string | null | undefined): boolean {
  if (!message) return false;
  return /\b(401|402|403)\b|credit|crédit|insufficient|payment required|paiement|forbidden|policy|politique|quota/i.test(
    message,
  );
}

export type SceneState = {
  imagePath?: string | undefined;
  audioPath?: string | undefined;
  clipPath?: string | undefined;
  clipFailed?: boolean | undefined;
  narration?: string | undefined;
};

/**
 * Étape à laquelle reprendre un travail : la première qui n'est pas produite.
 * Rien de déjà payé n'est refait (les gardes du pipeline sautent l'existant).
 */
export function resumeStatusFor(job: {
  topic?: string | null;
  scenes?: SceneState[] | null;
}): "queued" | "scripting" | "images" | "voice" | "clips" | "rendering" {
  const scenes = Array.isArray(job.scenes) ? job.scenes : [];
  if (!job.topic) return "queued";
  if (!scenes.length) return "scripting";
  if (scenes.some((s) => !s.imagePath)) return "images";
  if (scenes.some((s) => (s.narration ?? "").trim() && !s.audioPath)) return "voice";
  if (scenes.some((s) => !s.clipPath && !s.clipFailed)) return "clips";
  return "rendering";
}

/** Ajoute des jours à une date ISO `YYYY-MM-DD`. */
export function addDays(day: string, delta: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/**
 * PROCHAINE DATE LIBRE : la première date, à partir d'aujourd'hui, qui n'a
 * encore aucune vidéo ni aucune production en cours. Une production lancée
 * n'importe quand n'écrase donc jamais une journée déjà servie aux posteurs.
 * `null` si tout l'horizon est déjà produit (« journée déjà produite »).
 */
export function pickPublishDate(
  today: string,
  taken: Iterable<string>,
  horizonDays = 7,
): string | null {
  const used = new Set(taken);
  for (let i = 0; i < horizonDays; i++) {
    const day = addDays(today, i);
    if (!used.has(day)) return day;
  }
  return null;
}

/**
 * DÉCIDE S'IL FAUT LANCER LA PRODUCTION DU JOUR.
 *
 * Règle : dès que l'heure prévue est ARRIVÉE OU DÉPASSÉE et qu'aucune
 * production n'a été lancée aujourd'hui (horodatage DÉDIÉ, jamais touché par
 * la publication), on lance. Une heure ratée se rattrape donc toute seule.
 */
export function shouldProduceNow(input: {
  localHour: number;
  runHour: number;
  today: string;
  lastProduceDay: string | null;
}): { run: boolean; catchUp: boolean; reason?: string } {
  if (input.lastProduceDay === input.today) {
    return { run: false, catchUp: false, reason: "déjà lancée aujourd'hui" };
  }
  if (input.localHour < input.runHour) {
    return { run: false, catchUp: false, reason: "hors de l'heure de production" };
  }
  return { run: true, catchUp: input.localHour > input.runHour };
}

/** Décision de publication automatique d'une journée. */
export function decidePublishDay(input: {
  activeLanguages: string[];
  readyLanguages: string[];
  failedLanguages: string[];
}): { action: "publish" | "publish-partial" | "wait"; missing: string[] } {
  const ready = new Set(input.readyLanguages);
  const failed = new Set(input.failedLanguages);
  const missing = input.activeLanguages.filter((l) => !ready.has(l));
  if (!input.readyLanguages.length) return { action: "wait", missing };
  if (!missing.length) return { action: "publish", missing: [] };
  if (missing.every((l) => failed.has(l))) return { action: "publish-partial", missing };
  return { action: "wait", missing };
}
