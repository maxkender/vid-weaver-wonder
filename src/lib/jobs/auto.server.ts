/**
 * PILOTE AUTOMATIQUE DE LA NUIT.
 *
 * Appelé à chaque tick (une fois par minute), il bouche les trous qui
 * obligeaient à intervenir à la main :
 *  1. relance seule un travail mort sur une erreur transitoire (3 fois max) ;
 *  2. publie la journée dès que toutes les langues actives sont rendues ;
 *  3. lance la production automatique sur la prochaine date libre ;
 *  4. rend le sujet à la file quand une production échoue définitivement ;
 *  5. journalise chaque décision, pour qu'aucun échec ne reste silencieux.
 *
 * VETO CONSERVÉ : aucune relance automatique sur une erreur de crédit, de
 * paiement ou de politique.
 */

import {
  AUTO_RETRY_DELAY_MS,
  AUTO_RETRY_MAX,
  FINAL_FAILURE_STEP,
  decidePublishDay,
  isFatalFailure,
  pickPublishDate,
  resumeStatusFor,
  type SceneState,
} from "./auto-rules";
import { admin, logEvent } from "./store.server";

type Settings = {
  auto_enabled?: boolean;
  auto_publish?: boolean;
  run_hour?: number;
  timezone?: string;
  languages?: string[];
  last_run_at?: string | null;
};

export function localDay(timeZone: string, at = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

export function localHour(timeZone: string, at = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hour12: false }).format(at),
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = Awaited<ReturnType<typeof admin>>;

async function settingsOf(db: Db): Promise<Settings> {
  const { data } = await db
    .from("distribution_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  return (data ?? {}) as Settings;
}

/** Trace lisible d'une décision du pilote (visible dans le tableau de bord). */
async function noteRun(db: Db, result: string) {
  await db
    .from("distribution_settings")
    .update({ last_run_at: new Date().toISOString(), last_run_result: result.slice(0, 300) })
    .eq("id", 1);
  await db.from("audit_log").insert({
    actor_id: null,
    action: "distribution.auto",
    target_table: "distribution_settings",
    target_id: "1",
    payload: { result },
  });
}

/* ------------------------------------------------- 1. relance automatique */

type FailedRow = {
  id: string;
  language: string;
  topic: string | null;
  error: string | null;
  step: string;
  auto_retries: number;
  master_id: string | null;
  scenes: SceneState[] | null;
  updated_at: string;
};

/** Rend le sujet consommé à la file : un échec ne perd jamais un sujet validé. */
async function releaseTopic(db: Db, jobId: string) {
  const { data } = await db
    .from("topic_queue")
    .select("id, status")
    .eq("video_job_id", jobId)
    .maybeSingle();
  const row = data as { id: string; status: string } | null;
  if (!row || row.status !== "utilise") return;
  await db
    .from("topic_queue")
    .update({ status: "valide", used_at: null, video_job_id: null })
    .eq("id", row.id);
}

export async function retryFailedJobs(): Promise<{ retried: number; givenUp: number }> {
  const db = await admin();
  const cutoff = new Date(Date.now() - AUTO_RETRY_DELAY_MS).toISOString();
  const { data } = await db
    .from("render_jobs")
    .select("id, language, topic, error, step, auto_retries, master_id, scenes, updated_at")
    .eq("status", "failed")
    .neq("step", FINAL_FAILURE_STEP)
    .lt("updated_at", cutoff)
    .order("updated_at", { ascending: true })
    .limit(10);

  const rows = (data ?? []) as FailedRow[];
  let retried = 0;
  let givenUp = 0;

  for (const job of rows) {
    const fatal = isFatalFailure(job.error);
    const exhausted = (job.auto_retries ?? 0) >= AUTO_RETRY_MAX;

    if (fatal || exhausted) {
      // ÉCHEC DÉFINITIF : plus aucune relance, le sujet retourne à la file.
      await db.from("render_jobs").update({ step: FINAL_FAILURE_STEP }).eq("id", job.id);
      await logEvent(
        job.id,
        "auto",
        fatal
          ? `Échec définitif (crédit, paiement ou politique) — aucune relance automatique : ${job.error ?? ""}`
          : `Échec définitif après ${AUTO_RETRY_MAX} relances automatiques : ${job.error ?? ""}`,
        "error",
      );
      if (!job.master_id) await releaseTopic(db, job.id);
      givenUp++;
      continue;
    }

    const next = (job.auto_retries ?? 0) + 1;
    const status = resumeStatusFor({ topic: job.topic, scenes: job.scenes });
    await db
      .from("render_jobs")
      .update({
        status,
        step: status,
        error: null,
        lease_until: null,
        auto_retries: next,
        rendering_sent_at: null,
        rendering_sends: 0,
      })
      .eq("id", job.id);
    await logEvent(
      job.id,
      "auto",
      `Relance automatique ${next}/${AUTO_RETRY_MAX} à l'étape « ${status} » — motif : ${job.error ?? "inconnu"}`,
      "warn",
    );
    retried++;
  }

  return { retried, givenUp };
}

/* --------------------------------------------- 2. publication automatique */

export async function autoPublishDays(): Promise<{ published: string[] }> {
  const db = await admin();
  const s = await settingsOf(db);
  if (s.auto_publish === false) return { published: [] };

  const timeZone = s.timezone ?? "Europe/Paris";
  const active = (s.languages?.length ? s.languages : ["fr"]).filter(Boolean);
  const today = localDay(timeZone);
  const since = new Date(`${today}T12:00:00Z`);
  since.setUTCDate(since.getUTCDate() - 6);
  const from = since.toISOString().slice(0, 10);

  const { data: videos } = await db
    .from("daily_videos")
    .select("id, publish_date, language, status, storage_path")
    .gte("publish_date", from);
  const rows = (videos ?? []) as {
    id: string;
    publish_date: string;
    language: string;
    status: string;
    storage_path: string | null;
  }[];
  if (!rows.length) return { published: [] };

  const dates = [...new Set(rows.map((r) => r.publish_date))];
  const { data: jobs } = await db
    .from("render_jobs")
    .select("id, language, publish_date, status, step")
    .in("publish_date", dates);
  const jobRows = (jobs ?? []) as {
    id: string;
    language: string;
    publish_date: string | null;
    status: string;
    step: string;
  }[];

  const published: string[] = [];

  for (const date of dates) {
    const dayRows = rows.filter((r) => r.publish_date === date);
    if (!dayRows.some((r) => r.status === "draft")) continue;

    const ready = dayRows.filter((r) => r.storage_path).map((r) => r.language);
    const failed = jobRows
      .filter((j) => j.publish_date === date && j.status === "failed" && j.step === FINAL_FAILURE_STEP)
      .map((j) => j.language);

    const decision = decidePublishDay({
      activeLanguages: active,
      readyLanguages: ready,
      failedLanguages: failed,
    });
    if (decision.action === "wait") continue;

    const ids = dayRows.filter((r) => r.storage_path && r.status === "draft").map((r) => r.id);
    if (!ids.length) continue;
    await db.from("daily_videos").update({ status: "published" }).in("id", ids);
    published.push(date);

    const message =
      decision.action === "publish"
        ? `Journée ${date} publiée automatiquement (${ready.length} langue(s))`
        : `Journée ${date} publiée automatiquement SANS ${decision.missing.join(", ").toUpperCase()} (échec définitif)`;
    await noteRun(db, message);
    const anyJob = jobRows.find((j) => j.publish_date === date);
    if (anyJob) {
      await logEvent(anyJob.id, "auto", message, decision.action === "publish" ? "info" : "warn");
    }
  }

  return { published };
}

/* ----------------------------------------- 3. lancement automatique du jour */

/** Dates déjà servies ou déjà en cours de production. */
async function takenDates(db: Db): Promise<Set<string>> {
  const [{ data: videos }, { data: jobs }] = await Promise.all([
    db.from("daily_videos").select("publish_date"),
    db
      .from("render_jobs")
      .select("publish_date, status")
      .not("publish_date", "is", null)
      .in("status", ["queued", "scripting", "images", "voice", "clips", "rendering", "done"]),
  ]);
  const set = new Set<string>();
  for (const v of (videos ?? []) as { publish_date: string }[]) set.add(v.publish_date);
  for (const j of (jobs ?? []) as { publish_date: string | null }[]) {
    if (j.publish_date) set.add(j.publish_date);
  }
  return set;
}

export async function autoProduce(): Promise<{ started?: string; reason?: string }> {
  const db = await admin();
  const s = await settingsOf(db);
  if (!s.auto_enabled) return { reason: "production automatique désactivée" };

  const timeZone = s.timezone ?? "Europe/Paris";
  const today = localDay(timeZone);
  if (localHour(timeZone) !== (s.run_hour ?? 0)) return { reason: "hors de l'heure de production" };
  if (s.last_run_at && localDay(timeZone, new Date(s.last_run_at)) === today) {
    return { reason: "déjà lancée aujourd'hui" };
  }

  // NE JAMAIS PRODUIRE DEUX FOIS LE MÊME JOUR : on vise la prochaine date qui
  // n'a ni vidéo ni production en cours.
  const date = pickPublishDate(today, await takenDates(db));
  if (!date) {
    await noteRun(db, "Aucun lancement : journée déjà produite");
    return { reason: "journée déjà produite" };
  }

  const langs = (s.languages?.length ? s.languages : ["fr"]).filter(
    (l, i, a) => l && a.indexOf(l) === i,
  );

  const { data: topic } = await db
    .from("topic_queue")
    .select("*")
    .eq("status", "valide")
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!topic) {
    await noteRun(db, "Aucun lancement : plus aucun sujet validé dans la file");
    return { reason: "aucun sujet validé" };
  }
  const topicRow = topic as { id: string; topic: string; category: string; narration_style: string };

  const { data: langRows } = await db.from("language_settings").select("*");
  const settings = new Map(
    ((langRows ?? []) as Record<string, unknown>[]).map((r) => [String(r["language"]), r]),
  );
  const source = langs.includes("fr") ? "fr" : langs[0]!;
  const ls = settings.get(source);

  const { data: job, error } = await db
    .from("render_jobs")
    .insert({
      language: source,
      languages: langs,
      master_id: null,
      publish_date: date,
      narration_style: String(ls?.["narration_style"] ?? topicRow.narration_style),
      visual_style: String(ls?.["visual_style"] ?? "papercraft"),
      topic_category: topicRow.category,
      topic: topicRow.topic,
      duration_sec: 62,
      voice_id: (ls?.["eleven_voice_id"] as string | null) ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const jobId = (job as { id: string }).id;

  await db
    .from("topic_queue")
    .update({ status: "utilise", used_at: new Date().toISOString(), video_job_id: jobId })
    .eq("id", topicRow.id);

  await noteRun(
    db,
    `Production automatique lancée pour le ${date} — ${langs.length} langue(s) — sujet : ${topicRow.topic}`,
  );
  await logEvent(
    jobId,
    "auto",
    `Production automatique lancée pour la journée du ${date} (${langs.join(", ")})`,
  );
  return { started: jobId };
}

/* --------------------------------------------------------------- pilote */

/** Un seul point d'entrée, appelé par le tick. Ne lève jamais. */
export async function runAutopilot(): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const [name, fn] of [
    ["retries", retryFailedJobs],
    ["publish", autoPublishDays],
    ["produce", autoProduce],
  ] as const) {
    try {
      out[name] = await fn();
    } catch (e) {
      out[name] = { error: e instanceof Error ? e.message : String(e) };
    }
  }
  return out;
}
