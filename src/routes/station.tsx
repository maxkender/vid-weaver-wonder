import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Download, Loader2, Play, Square } from "lucide-react";
import { toast } from "sonner";

import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  claimStationTask,
  failStationTask,
  finishStationTask,
  stationQueue,
  type StationTask,
} from "@/lib/render-station.functions";

export const Route = createFileRoute("/station")({
  head: () => ({
    meta: [
      { title: "Station de montage — file de production vidéo Sophia" },
      {
        name: "description",
        content:
          "Laissez cette page ouverte : elle monte automatiquement les vidéos commandées par l'OS marketing et les renvoie prêtes à télécharger.",
      },
      { property: "og:title", content: "Station de montage vidéo Sophia" },
      {
        property: "og:description",
        content:
          "Montage automatique des vidéos de la file de production, sans serveur ni installation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StationPage,
});

type QueueRow = Awaited<ReturnType<typeof stationQueue>>[number];

const STATUS_LABEL: Record<string, string> = {
  queued: "En file",
  scripting: "Script",
  images: "Images",
  voice: "Voix",
  clips: "Plans animés",
  rendering: "À monter",
  done: "Prête",
  failed: "Échec",
  cancelled: "Annulée",
};

async function audioDuration(url: string): Promise<number> {
  return new Promise((resolve) => {
    const a = new Audio();
    a.preload = "metadata";
    a.onloadedmetadata = () => resolve(Number.isFinite(a.duration) ? a.duration : 0);
    a.onerror = () => resolve(0);
    a.src = url;
  });
}

function StationPage() {
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [step, setStep] = useState("");
  const [rows, setRows] = useState<QueueRow[]>([]);
  const runningRef = useRef(false);
  const workingRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      setRows(await stationQueue());
    } catch {
      /* silencieux : la file se rafraîchira au prochain cycle */
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 15000);
    return () => clearInterval(id);
  }, [refresh]);

  const renderTask = useCallback(async (task: StationTask) => {
    const { assembleVideo } = await import("@/lib/assemble-video");
    const { randomTrack } = await import("@/lib/music-store");
    const { makeKaraokeSequence, makeRoundedSquareMask, sophiaWindow, voiceWindow, shiftTimings } =
      await import("@/lib/karaoke-overlay");
    const sophiaLogo = (await import("@/assets/sophia-logo.png.asset.json")).default;

    const dims = { width: 1080, height: 1920 };
    const mask = task.squareMask ? await makeRoundedSquareMask(dims.width, dims.height) : null;

    const scenes = await Promise.all(
      task.scenes.map(async (s) => {
        const raw = s.audioUrl ? await audioDuration(s.audioUrl) : s.duration;
        const win = raw ? voiceWindow(s.words ?? null, raw) : null;
        const duration = win ? win.end - win.start : raw || s.duration || 4;
        const words = win ? shiftTimings(s.words ?? null, win.start) : (s.words ?? []);
        return {
          ...(s.videoUrl ? { videoUrl: s.videoUrl } : {}),
          ...(s.imageUrl ? { imageUrl: s.imageUrl } : {}),
          ...(s.audioUrl ? { audio: s.audioUrl } : {}),
          ...(win ? { trimStart: win.start, trimEnd: win.end } : {}),
          mask,
          karaokeSeq: () =>
            makeKaraokeSequence(
              s.narration,
              dims.width,
              dims.height,
              duration,
              24,
              words,
              (() => {
                const w = sophiaWindow(s.narration, duration, words);
                return w ? { url: sophiaLogo.url, ...w } : null;
              })(),
            ),
          overlay: null,
          duration,
        };
      }),
    );

    const track = await randomTrack(task.visualStyle);
    const blob = await assembleVideo(scenes, {
      ...dims,
      music: track?.blob,
      musicVolume: 0.14,
      onProgress: (s) => setStep(s),
    });

    setStep("Envoi de la vidéo…");
    const { error } = await supabase.storage
      .from("renders")
      .uploadToSignedUrl(task.path, task.uploadToken, blob, { contentType: "video/mp4" });
    if (error) throw new Error(`Envoi impossible : ${error.message}`);

    const total = scenes.reduce((acc, s) => acc + (s.duration ?? 0), 0);
    await finishStationTask({ data: { jobId: task.jobId, path: task.path, durationSec: total } });
  }, []);

  const tickOnce = useCallback(async () => {
    if (workingRef.current) return;
    workingRef.current = true;
    try {
      const { task } = await claimStationTask({});
      if (!task) return;
      setBusy(task.title);
      setStep("Préparation…");
      try {
        await renderTask(task);
        toast.success(`Vidéo prête : ${task.title}`);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        await failStationTask({ data: { jobId: task.jobId, message } });
        toast.error(`Montage échoué : ${message}`);
      }
      setBusy(null);
      setStep("");
      await refresh();
    } catch {
      /* la file réessaiera */
    } finally {
      workingRef.current = false;
    }
  }, [renderTask, refresh]);

  useEffect(() => {
    if (!running) return;
    runningRef.current = true;
    let stop = false;
    const loop = async () => {
      while (!stop && runningRef.current) {
        await tickOnce();
        await new Promise((r) => setTimeout(r, 10000));
      }
    };
    void loop();
    return () => {
      stop = true;
      runningRef.current = false;
    };
  }, [running, tickOnce]);

  useEffect(() => {
    if (!busy) return;
    const guard = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [busy]);

  const pending = rows.filter((r) => r.status === "rendering").length;

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8">
      <Toaster />
      <div className="mb-6 flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link to="/" aria-label="Retour au studio">
            <ArrowLeft />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold">Station de montage</h1>
          <p className="text-sm text-muted-foreground">
            Laisse cette page ouverte : elle monte automatiquement les vidéos commandées par l'OS
            marketing et les renvoie prêtes à télécharger.
          </p>
        </div>
      </div>

      <section className="mb-6 rounded-lg border p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => setRunning((v) => !v)} variant={running ? "secondary" : "default"}>
            {running ? <Square /> : <Play />}
            {running ? "Arrêter la station" : "Démarrer la station"}
          </Button>
          <span className="text-sm text-muted-foreground">
            {busy ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" />
                {busy} — {step}
              </span>
            ) : running ? (
              `En veille — ${pending} vidéo(s) à monter`
            ) : (
              "Station à l'arrêt"
            )}
          </span>
        </div>
      </section>

      <section className="rounded-lg border">
        <h2 className="border-b px-4 py-3 text-sm font-medium">File de production</h2>
        <ul className="divide-y">
          {rows.length === 0 && (
            <li className="px-4 py-6 text-sm text-muted-foreground">Aucune commande pour l'instant.</li>
          )}
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{r.topic ?? "Sujet automatique"}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {r.language.toUpperCase()} · {STATUS_LABEL[r.status] ?? r.status}
                  {r.posterId ? ` · ${r.posterId}` : ""}
                  {r.error ? ` · ${r.error.slice(0, 80)}` : ""}
                </p>
              </div>
              {r.downloadUrl && (
                <Button asChild size="sm" variant="secondary">
                  <a href={r.downloadUrl} download>
                    <Download />
                    MP4
                  </a>
                </Button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
