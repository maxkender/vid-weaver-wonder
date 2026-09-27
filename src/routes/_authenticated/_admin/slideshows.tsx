import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Loader2, Play, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  createSlideshowJob,
  deleteSlideshowJob,
  listSlideshowJobs,
  runSlideshowTickNow,
  type SlideshowJobRow,
} from "@/lib/slideshows.functions";

export const Route = createFileRoute("/_authenticated/_admin/slideshows")({
  head: () => ({
    meta: [
      { title: "Slideshows — production des quiz" },
      { name: "description", content: "Lancement et suivi des slideshows quiz multilingues." },
      { property: "og:title", content: "Slideshows — production des quiz" },
      { property: "og:description", content: "Suivi des slideshows : écriture, images partagées, publication par langue." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SlideshowsPage,
});

function SlideshowsPage() {
  const [jobs, setJobs] = useState<SlideshowJobRow[]>([]);
  const [paused, setPaused] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [topic, setTopic] = useState("");
  const [publishDate, setPublishDate] = useState("");

  const refresh = useCallback(async () => {
    try {
      const r = await listSlideshowJobs();
      setJobs(r.jobs);
      setPaused(r.paused ? r.pausedReason ?? "En pause" : null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Chargement impossible");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const launch = async () => {
    if (!confirm("Lancer un slideshow ? Les images seront générées (dépense) au prochain tick.")) return;
    setBusy(true);
    try {
      await createSlideshowJob({
        data: {
          topic: topic.trim() || undefined,
          format: "quiz",
          publishDate: publishDate || undefined,
        } as never,
      });
      setTopic("");
      toast.success("Slideshow en file");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Création impossible");
    } finally {
      setBusy(false);
    }
  };

  const tick = async () => {
    setBusy(true);
    try {
      const r = await runSlideshowTickNow();
      toast.message(r.paused ? "Chaîne en pause" : r.idle ? "Rien à faire" : `Tick : ${r.status ?? ""}`);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Tick impossible");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background px-4 py-4">
      <Toaster position="top-center" />
      <h1 className="mb-3 text-[15px] font-semibold tracking-tight">Slideshows</h1>
      {paused ? (
        <p className="mb-3 rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-xs">
          Chaîne slideshow en pause : {paused}
        </p>
      ) : null}
      <div className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border border-border bg-card p-3">
        <div className="min-w-64 flex-1">
          <label className="text-xs text-muted-foreground">Sujet (vide = premier sujet validé « slideshow »)</label>
          <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Ex. Les grandes batailles" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Date de diffusion</label>
          <Input type="date" value={publishDate} onChange={(e) => setPublishDate(e.target.value)} />
        </div>
        <Button onClick={launch} disabled={busy}>
          <Plus className="mr-1.5 size-4" /> Lancer un slideshow
        </Button>
        <Button variant="secondary" onClick={tick} disabled={busy}>
          {busy ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Play className="mr-1.5 size-4" />}
          Faire tourner un tick
        </Button>
      </div>

      {loading ? (
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      ) : jobs.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun slideshow pour l'instant.</p>
      ) : (
        <div className="space-y-2">
          {jobs.map((j) => (
            <div key={j.id} className="rounded-lg border border-border bg-card p-3 text-xs">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{j.topic ?? "—"}</p>
                  <p className="text-muted-foreground">
                    {j.format} · {j.languages.join(", ")} · {j.slide_count} slides · diffusion{" "}
                    {j.publish_date ?? "jour du rendu"} · tentatives {j.attempts}
                  </p>
                  <p className="mt-1">
                    Statut <b>{j.status}</b> · étape {j.step ?? "—"} · images {j.images_done}/{j.slide_count}
                  </p>
                  {j.error ? <p className="mt-1 text-destructive">{j.error}</p> : null}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    if (!confirm("Supprimer ce slideshow ?")) return;
                    await deleteSlideshowJob({ data: { id: j.id } });
                    await refresh();
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <Progress value={j.progress * 100} className="mt-2 h-1.5" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
