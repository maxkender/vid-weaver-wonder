/**
 * VIDÉOTHÈQUE ADMINISTRATEUR : catalogue de toutes les vidéos produites,
 * groupées par journée de diffusion. L'administrateur voit et télécharge tout,
 * y compris les journées à venir (le masquage du futur ne concerne que les
 * posteurs, côté `listMyVideos` / `getVideoLink`).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Download, Loader2, Play } from "lucide-react";
import { toast } from "sonner";

import {
  getAdminVideoLink,
  listAllVideos,
  setDailyVideoStatus,
} from "@/lib/admin.functions";
import { MASTER_LANGUAGES, languageLabel } from "@/lib/languages";

type Library = Awaited<ReturnType<typeof listAllVideos>>;
type Video = Library["videos"][number];

const FLAGS: Record<string, string> = {
  fr: "🇫🇷",
  en: "🇬🇧",
  es: "🇪🇸",
  de: "🇩🇪",
  it: "🇮🇹",
  pt: "🇧🇷",
};

const STATUSES = [
  { id: "all", label: "Tout" },
  { id: "published", label: "Publiées" },
  { id: "draft", label: "Brouillons" },
  { id: "missing", label: "Fichier manquant" },
] as const;

function frDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function dayState(videos: Video[]) {
  const published = videos.filter((v) => v.status === "published").length;
  if (published === 0) return { label: "brouillon", tone: "bg-muted text-muted-foreground" };
  if (published === videos.length) return { label: "publiée", tone: "bg-emerald-500/15 text-emerald-400" };
  return { label: "partielle", tone: "bg-amber-500/15 text-amber-400" };
}

export function AdminVideos() {
  const runList = useServerFn(listAllVideos);
  const runLink = useServerFn(getAdminVideoLink);
  const runStatus = useServerFn(setDailyVideoStatus);

  const [language, setLanguage] = useState("all");
  const [status, setStatus] = useState<(typeof STATUSES)[number]["id"]>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [data, setData] = useState<Library | null>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = (await runList({
      data: { language, status, search, page, pageSize: 50 },
    } as never)) as Library;
    setData(res);
  }, [runList, language, status, search, page]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const groups = useMemo(() => {
    const map = new Map<string, Video[]>();
    for (const v of data?.videos ?? []) {
      const list = map.get(v.publish_date) ?? [];
      list.push(v);
      map.set(v.publish_date, list);
    }
    return Array.from(map.entries());
  }, [data]);

  const copy = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copié`);
  };

  const openPreview = async (path: string) => {
    const res = (await runLink({ data: { path } })) as { url: string };
    setPreviews((p) => ({ ...p, [path]: res.url }));
  };

  const download = async (video: Video) => {
    if (!video.storage_path) return;
    setBusy(video.id);
    try {
      const res = (await runLink({ data: { path: video.storage_path } })) as { url: string };
      const a = document.createElement("a");
      a.href = res.url;
      a.download = `${video.publish_date}-${video.language}.mp4`;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Téléchargement impossible");
    } finally {
      setBusy(null);
    }
  };

  const toggle = async (video: Video) => {
    setBusy(video.id);
    try {
      await runStatus({
        data: { id: video.id, status: video.status === "published" ? "draft" : "published" },
      } as never);
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  if (!data) {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Chargement…
      </p>
    );
  }

  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <div className="space-y-4">
      <section className="surface-card p-3">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <p className="label-x">Vidéos en stock</p>
            <p className="text-lg font-semibold">{data.total}</p>
          </div>
          <div>
            <p className="label-x">Journées produites</p>
            <p className="text-lg font-semibold">{data.days}</p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            className="field w-36 text-xs"
            value={language}
            aria-label="Langue"
            onChange={(e) => {
              setPage(0);
              setLanguage(e.target.value);
            }}
          >
            <option value="all">Toutes les langues</option>
            {MASTER_LANGUAGES.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
          <select
            className="field w-40 text-xs"
            value={status}
            aria-label="État"
            onChange={(e) => {
              setPage(0);
              setStatus(e.target.value as typeof status);
            }}
          >
            {STATUSES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <input
            className="field w-56 text-xs"
            placeholder="Rechercher un titre ou un sujet"
            value={search}
            onChange={(e) => {
              setPage(0);
              setSearch(e.target.value);
            }}
          />
        </div>
      </section>

      {groups.length === 0 ? (
        <p className="text-xs text-muted-foreground">Aucune vidéo ne correspond à ces filtres.</p>
      ) : null}

      {groups.map(([date, videos]) => {
        const state = dayState(videos);
        const future = date > data.today;
        return (
          <section key={date} className="surface-card p-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold">{frDate(date)}</p>
              <span className={`rounded-full px-2 py-0.5 text-[11px] ${state.tone}`}>
                {state.label}
              </span>
              {future ? (
                <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[11px] text-sky-400">
                  prévue le {frDate(date)}
                </span>
              ) : null}
              <span className="text-[11px] text-muted-foreground">{videos.length} langue(s)</span>
            </div>

            <div className="mt-2 space-y-2">
              {videos.map((v) => (
                <div key={v.id} className="rounded-xl border border-border p-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span>{FLAGS[v.language] ?? "🏳️"}</span>
                    <span className="font-medium">{languageLabel(v.language)}</span>
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">
                      {v.title || "sans titre"}
                    </span>
                    <span className="text-muted-foreground">{Math.round(v.duration_sec)} s</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] ${
                        !v.storage_path
                          ? "bg-destructive/15 text-destructive"
                          : v.status === "published"
                            ? "bg-emerald-500/15 text-emerald-400"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {!v.storage_path
                        ? "fichier manquant"
                        : v.status === "published"
                          ? "publiée"
                          : "brouillon"}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      créée le {frDate(v.created_at.slice(0, 10))}
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {v.storage_path ? (
                      <>
                        <button
                          className="btn-ghost text-xs"
                          onClick={() => void openPreview(v.storage_path!)}
                        >
                          <Play className="mr-1 h-3.5 w-3.5" /> Aperçu
                        </button>
                        <button
                          className="btn-ghost text-xs"
                          disabled={busy === v.id}
                          onClick={() => void download(v)}
                        >
                          <Download className="mr-1 h-3.5 w-3.5" /> Télécharger
                        </button>
                      </>
                    ) : null}
                    <button
                      className="btn-ghost text-xs"
                      disabled={busy === v.id}
                      onClick={() => void toggle(v)}
                    >
                      {v.status === "published" ? "Dépublier" : "Publier"}
                    </button>
                    {v.caption ? (
                      <button
                        className="btn-ghost text-xs"
                        onClick={() => void copy(v.caption, "Légende")}
                      >
                        <Copy className="mr-1 h-3.5 w-3.5" /> Copier la légende
                      </button>
                    ) : null}
                    {v.hashtags.length ? (
                      <button
                        className="btn-ghost text-xs"
                        onClick={() =>
                          void copy(v.hashtags.map((h) => `#${h}`).join(" "), "Hashtags")
                        }
                      >
                        <Copy className="mr-1 h-3.5 w-3.5" /> Copier les hashtags
                      </button>
                    ) : null}
                  </div>

                  {v.caption || v.hashtags.length ? (
                    <div className="mt-2 space-y-1 text-[11px] text-muted-foreground">
                      {v.caption ? <p className="whitespace-pre-line">{v.caption}</p> : null}
                      {v.hashtags.length ? (
                        <p>{v.hashtags.map((h) => `#${h}`).join(" ")}</p>
                      ) : null}
                    </div>
                  ) : null}

                  {v.storage_path && previews[v.storage_path] ? (
                    <video
                      src={previews[v.storage_path]}
                      controls
                      className="mt-2 w-40 rounded-xl border border-border"
                    />
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        );
      })}

      {pages > 1 ? (
        <div className="flex items-center justify-center gap-3 text-xs">
          <button
            className="btn-ghost"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            Précédent
          </button>
          <span className="text-muted-foreground">
            Page {page + 1} sur {pages}
          </span>
          <button
            className="btn-ghost"
            disabled={page + 1 >= pages}
            onClick={() => setPage((p) => p + 1)}
          >
            Suivant
          </button>
        </div>
      ) : null}
    </div>
  );
}
