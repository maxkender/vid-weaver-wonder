import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Play, Rocket } from "lucide-react";
import { toast } from "sonner";

import {
  assignDailyVideo,
  estimateProduction,
  getAdminVideoLink,
  getDistribution,
  produceNow,
  setDailyVideoStatus,
  updateDailyVideo,
  updateDistributionSettings,
} from "@/lib/admin.functions";
import { MASTER_LANGUAGES } from "@/lib/languages";

type Distribution = Awaited<ReturnType<typeof getDistribution>>;
type Estimate = Awaited<ReturnType<typeof estimateProduction>>;

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Prochaine exécution à l'heure de Paris demandée. */
function nextRun(hour: number) {
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.toLocaleString("fr-FR", { timeZone: "Europe/Paris" });
}

export function AdminDiffusion() {
  const runGet = useServerFn(getDistribution);
  const runSettings = useServerFn(updateDistributionSettings);
  const runUpdate = useServerFn(updateDailyVideo);
  const runStatus = useServerFn(setDailyVideoStatus);
  const runAssign = useServerFn(assignDailyVideo);
  const runLink = useServerFn(getAdminVideoLink);
  const runEstimate = useServerFn(estimateProduction);
  const runProduce = useServerFn(produceNow);

  const [date, setDate] = useState(isoDay(new Date()));
  const [data, setData] = useState<Distribution | null>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [producing, setProducing] = useState(false);

  const refresh = useCallback(async () => {
    setData((await runGet({ data: { date } })) as Distribution);
  }, [runGet, date]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!data) {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Chargement…
      </p>
    );
  }

  const settings = data.settings;
  const activeLanguages = (settings?.languages ?? ["fr"]) as string[];

  const patchSettings = async (patch: Parameters<typeof updateDistributionSettings>[0]) => {
    await runSettings(patch as never);
    await refresh();
  };

  const openPreview = async (path: string) => {
    const res = (await runLink({ data: { path } })) as { url: string };
    setPreviews((p) => ({ ...p, [path]: res.url }));
  };

  return (
    <div className="space-y-4">
      {/* VIDÉO DU JOUR PAR LANGUE */}
      <section className="surface-card p-3">
        <div className="flex flex-wrap items-center gap-3">
          <p className="label-x">Vidéo du jour, langue par langue</p>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="field w-40 text-xs"
          />
        </div>

        <div className="mt-3 grid gap-3 xl:grid-cols-2">
          {MASTER_LANGUAGES.map((lang) => {
            const video = data.videos.find((v) => v.language === lang.id) ?? null;
            return (
              <div key={lang.id} className="rounded-[10px] border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{lang.label}</p>
                  {video ? (
                    <span
                      className={`rounded-[6px] px-1.5 py-0.5 text-[11px] ${
                        video.status === "published"
                          ? "bg-primary/15 text-primary"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {video.status === "published" ? "publiée" : video.status}
                    </span>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">aucune vidéo</span>
                  )}
                </div>

                {video ? (
                  <div className="mt-2 space-y-2">
                    <p className="text-xs text-muted-foreground">
                      {Math.round(Number(video.duration_sec))} s · {video.title || "sans titre"}
                    </p>
                    {video.storage_path ? (
                      previews[video.storage_path] ? (
                        <video
                          src={previews[video.storage_path]}
                          controls
                          className="max-h-64 w-full rounded-[8px] bg-black"
                        />
                      ) : (
                        <button
                          className="btn-base btn-ghost text-xs"
                          onClick={() => void openPreview(video.storage_path!)}
                        >
                          <Play className="h-3.5 w-3.5" /> Aperçu
                        </button>
                      )
                    ) : null}

                    <input
                      defaultValue={video.title}
                      onBlur={(e) => void runUpdate({ data: { id: video.id, title: e.target.value } })}
                      placeholder="Titre"
                      className="field text-xs"
                    />
                    <textarea
                      defaultValue={video.caption}
                      onBlur={(e) => void runUpdate({ data: { id: video.id, caption: e.target.value } })}
                      placeholder="Légende"
                      rows={3}
                      className="field text-xs"
                    />
                    <input
                      defaultValue={(video.hashtags ?? []).join(" ")}
                      onBlur={(e) =>
                        void runUpdate({
                          data: { id: video.id, hashtags: e.target.value.split(/\s+/).filter(Boolean) },
                        })
                      }
                      placeholder="#hashtags séparés par des espaces"
                      className="field text-xs"
                    />

                    <div className="flex flex-wrap gap-2">
                      <button
                        className="btn-base btn-primary text-xs"
                        onClick={async () => {
                          await runStatus({
                            data: {
                              id: video.id,
                              status: video.status === "published" ? "draft" : "published",
                            },
                          });
                          await refresh();
                        }}
                      >
                        {video.status === "published" ? "Dépublier" : "Publier"}
                      </button>
                      <select
                        className="field w-56 text-xs"
                        defaultValue=""
                        onChange={async (e) => {
                          if (!e.target.value) return;
                          await runAssign({
                            data: { date, language: lang.id, jobId: e.target.value },
                          });
                          await refresh();
                          toast.success("Vidéo remplacée");
                        }}
                        aria-label="Remplacer par une autre vidéo produite"
                      >
                        <option value="">Remplacer par…</option>
                        {data.renders
                          .filter((r) => r.language === lang.id)
                          .map((r) => (
                            <option key={r.id} value={r.id}>
                              {new Date(r.created_at).toLocaleDateString("fr-FR")} ·{" "}
                              {(r.topic ?? "sans titre").slice(0, 40)}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2">
                    <select
                      className="field w-full text-xs"
                      defaultValue=""
                      onChange={async (e) => {
                        if (!e.target.value) return;
                        await runAssign({ data: { date, language: lang.id, jobId: e.target.value } });
                        await refresh();
                      }}
                      aria-label="Assigner une vidéo produite"
                    >
                      <option value="">Assigner une vidéo déjà produite…</option>
                      {data.renders
                        .filter((r) => r.language === lang.id)
                        .map((r) => (
                          <option key={r.id} value={r.id}>
                            {new Date(r.created_at).toLocaleDateString("fr-FR")} ·{" "}
                            {(r.topic ?? "sans titre").slice(0, 40)}
                          </option>
                        ))}
                    </select>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ASSIGNATION AUTOMATIQUE */}
      <section className="surface-card p-3">
        <p className="label-x">Assignation automatique</p>
        <div className="mt-2 flex flex-wrap items-end gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(settings?.auto_enabled)}
              onChange={(e) => void patchSettings({ data: { autoEnabled: e.target.checked } } as never)}
            />
            Production automatique activée
          </label>
          <div>
            <p className="label-x">Heure de production (Paris)</p>
            <select
              value={settings?.run_hour ?? 0}
              onChange={(e) => void patchSettings({ data: { runHour: Number(e.target.value) } } as never)}
              className="field mt-1 w-24 text-xs"
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, "0")}:00
                </option>
              ))}
            </select>
          </div>
          <div>
            <p className="label-x">Si la production échoue</p>
            <select
              value={settings?.on_failure ?? "replay"}
              onChange={(e) => void patchSettings({ data: { onFailure: e.target.value } } as never)}
              className="field mt-1 w-48 text-xs"
            >
              <option value="replay">Rejouer la vidéo de la veille</option>
              <option value="skip">Ne rien publier</option>
            </select>
          </div>
          <div>
            <p className="label-x">Langues concernées</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {MASTER_LANGUAGES.map((l) => {
                const on = activeLanguages.includes(l.id);
                return (
                  <button
                    key={l.id}
                    onClick={() =>
                      void patchSettings({
                        data: {
                          languages: on
                            ? activeLanguages.filter((x) => x !== l.id)
                            : [...activeLanguages, l.id],
                        },
                      } as never)
                    }
                    className={`rounded-[6px] border px-2 py-1 text-[11px] ${
                      on ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground"
                    }`}
                  >
                    {l.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Prochaine exécution : {nextRun(settings?.run_hour ?? 0)} · dernière exécution :{" "}
          {settings?.last_run_at
            ? `${new Date(settings.last_run_at).toLocaleString("fr-FR")} — ${settings.last_run_result ?? ""}`
            : "jamais"}
        </p>
      </section>

      {/* PRODUCTION IMMÉDIATE */}
      <section className="surface-card p-3">
        <p className="label-x">Produire maintenant</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Prend le premier sujet validé de la file et lance une production pour chaque langue active.
        </p>
        <button
          className="btn-base btn-primary mt-2 text-xs"
          disabled={producing}
          onClick={async () => {
            const est = (await runEstimate({
              data: { languages: activeLanguages, durationSec: 62 },
            })) as Estimate;
            setEstimate(est);
          }}
        >
          <Rocket className="h-3.5 w-3.5" /> Lancer une production
        </button>
      </section>

      {estimate ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="surface-card w-full max-w-md p-4">
            <p className="text-sm font-semibold">Confirmer la production</p>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              <li>{estimate.videos} vidéo(s) livrée(s), une par langue active</li>
              <li>
                {estimate.images} images et {estimate.scenes} clips au total (~{estimate.clipSeconds} s
                d'animation), payés une seule fois
              </li>
              <li>
                {estimate.voiceTakes} prises de voix off ({estimate.scenes} plans ×{" "}
                {estimate.voiceLanguages} langues)
              </li>
              <li>{estimate.note}</li>
            </ul>
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn-base btn-ghost text-xs" onClick={() => setEstimate(null)}>
                Annuler
              </button>
              <button
                className="btn-base btn-primary text-xs"
                disabled={producing}
                onClick={async () => {
                  setProducing(true);
                  try {
                    const res = (await runProduce({
                      data: { languages: activeLanguages, durationSec: 62 },
                    })) as { jobIds: string[]; topic: string };
                    toast.success(`${res.jobIds.length} production(s) lancée(s) — ${res.topic}`);
                    setEstimate(null);
                    await refresh();
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Lancement impossible");
                  } finally {
                    setProducing(false);
                  }
                }}
              >
                {producing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Confirmer
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
