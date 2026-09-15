import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Loader2 } from "lucide-react";

import { getOverview } from "@/lib/admin.functions";
import { languageLabel } from "@/lib/languages";

type Overview = Awaited<ReturnType<typeof getOverview>>;

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="surface-card p-3">
      <p className="label-x">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function pct(done: number, total: number) {
  if (!total) return "—";
  return `${Math.round((done / total) * 100)} %`;
}

export function AdminOverview() {
  const run = useServerFn(getOverview);
  const [data, setData] = useState<Overview | null>(null);

  const refresh = useCallback(async () => {
    setData((await run()) as Overview);
  }, [run]);

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

  const max = Math.max(1, ...data.series.map((s) => s.count));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Posteurs actifs"
          value={String(data.activePosters)}
          hint={`${data.totalPosters} au total`}
        />
        <Stat
          label="Vidéos du jour"
          value={String(data.videosToday)}
          hint={data.videosTodayByLanguage
            .map((v) => `${v.language.toUpperCase()} ${v.status === "published" ? "publiée" : "brouillon"}`)
            .join(" · ")}
        />
        <Stat
          label="Téléchargements du jour"
          value={pct(data.downloadRate.done, data.downloadRate.total)}
          hint={`${data.downloadRate.done} / ${data.downloadRate.total} posteurs`}
        />
        <Stat
          label="Publications du jour"
          value={pct(data.postRate.done, data.postRate.total)}
          hint={`${data.postRate.done} / ${data.postRate.total} posteurs`}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="surface-card p-3">
          <p className="label-x">Comptes par plateforme</p>
          <ul className="mt-2 space-y-1 text-sm">
            {Object.entries(data.byPlatform).length === 0 ? (
              <li className="text-xs text-muted-foreground">Aucun compte rattaché.</li>
            ) : (
              Object.entries(data.byPlatform).map(([platform, count]) => (
                <li key={platform} className="flex justify-between">
                  <span className="capitalize">{platform}</span>
                  <span className="font-medium">{count}</span>
                </li>
              ))
            )}
          </ul>
        </div>

        <div className="surface-card p-3">
          <p className="label-x">Contrats signés</p>
          <p className="mt-1 text-2xl font-semibold">
            {data.contracts.signed}
            <span className="text-sm font-normal text-muted-foreground"> / {data.contracts.expected}</span>
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Un contrat attendu par posteur.
          </p>
        </div>

        <div className="surface-card p-3 lg:col-span-1">
          <p className="label-x">Langues produites aujourd'hui</p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {data.videosTodayByLanguage.length === 0 ? (
              <li className="text-xs text-muted-foreground">Aucune vidéo assignée pour aujourd'hui.</li>
            ) : (
              data.videosTodayByLanguage.map((v) => (
                <li
                  key={v.language}
                  className="rounded-[6px] border border-border px-2 py-0.5 text-[11px]"
                >
                  {languageLabel(v.language)} · {v.status === "published" ? "publiée" : v.status}
                </li>
              ))
            )}
          </ul>
        </div>
      </div>

      <div className="surface-card p-3">
        <p className="label-x">Publications sur 30 jours</p>
        <div className="mt-3 flex h-28 items-end gap-[3px]">
          {data.series.map((s) => (
            <div
              key={s.day}
              title={`${s.day} · ${s.count} publication(s)`}
              className="flex-1 rounded-t-[2px] bg-primary/70"
              style={{ height: `${Math.max(2, (s.count / max) * 100)}%` }}
            />
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
          <span>{data.series[0]?.day}</span>
          <span>{data.series[data.series.length - 1]?.day}</span>
        </div>
      </div>

      <div className="surface-card p-3">
        <p className="label-x flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
          Posteurs sans publication depuis 3 jours ou plus ({data.silent.length})
        </p>
        {data.silent.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">Tout le monde a publié récemment.</p>
        ) : (
          <table className="mt-2 w-full text-sm">
            <tbody>
              {data.silent.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="py-1.5">{p.name}</td>
                  <td className="py-1.5 text-xs text-muted-foreground">{p.email}</td>
                  <td className="py-1.5 text-right text-xs text-muted-foreground">
                    {p.last
                      ? `dernière publication le ${new Date(p.last).toLocaleDateString("fr-FR")}`
                      : "jamais publié"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
