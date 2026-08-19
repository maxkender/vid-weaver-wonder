import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  Clapperboard,
  Download,
  Image as ImageIcon,
  Loader2,
  Play,
  Sparkles,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";

import {
  generateSceneImage,
  generateScript,
  pollSceneVideo,
  startSceneVideo,
} from "@/lib/studio.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Studio CG — Générateur de vidéos de faits fascinants" },
      {
        name: "description",
        content:
          "Générez en un clic des vidéos courtes de culture générale : script IA, images cinématographiques, clips animés et textes incrustés.",
      },
      { property: "og:title", content: "Studio CG — Générateur de vidéos animées" },
      {
        property: "og:description",
        content:
          "Script, image, vidéo et voix off générés par IA pour vos vidéos de faits fascinants.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Studio,
});

type Kind = "faits" | "culture" | "pub";
type NarrationStyle = "question" | "revelation" | "storytelling" | "listicle";
type VisualStyle = "papercraft" | "cinematique" | "documentaire" | "retro";

type Scene = {
  index: number;
  narration: string;
  overlay: string;
  imagePrompt: string;
  videoPrompt: string;
};

type Script = {
  title: string;
  hook: string;
  scenes: Scene[];
  cta: string;
  hashtags: string[];
};

type SceneState = {
  image?: string | undefined;
  imageLoading?: boolean | undefined;
  videoId?: string | undefined;
  videoUrl?: string | undefined;
  videoLoading?: boolean | undefined;
  progress?: number | undefined;
};


const STYLES: { id: NarrationStyle; label: string; hint: string }[] = [
  {
    id: "question",
    label: "Grande question",
    hint: "« Mais savez-vous vraiment pourquoi… ? »",
  },
  { id: "revelation", label: "Révélation", hint: "Indices, puis retournement final" },
  { id: "storytelling", label: "Récit immersif", hint: "On raconte la scène vécue" },
  { id: "listicle", label: "Énumération", hint: "Une idée choc par scène" },
];

const VISUALS: { id: VisualStyle; label: string }[] = [
  { id: "papercraft", label: "Papier découpé" },
  { id: "cinematique", label: "Cinématique" },
  { id: "documentaire", label: "Documentaire" },
  { id: "retro", label: "Rétro 70s" },
];

function Studio() {
  const runScript = useServerFn(generateScript);
  const runImage = useServerFn(generateSceneImage);
  const runVideo = useServerFn(startSceneVideo);
  const runPoll = useServerFn(pollSceneVideo);

  const [topic, setTopic] = useState("");
  const kind: Kind = "faits";
  const [sceneCount, setSceneCount] = useState(5);
  const [style, setStyle] = useState<NarrationStyle>("revelation");
  const [visual, setVisual] = useState<VisualStyle>("papercraft");
  const [orientation, setOrientation] = useState<"vertical" | "horizontal">("vertical");
  const [script, setScript] = useState<Script | null>(null);
  const [loadingScript, setLoadingScript] = useState(false);
  const [states, setStates] = useState<Record<number, SceneState>>({});
  const busyRef = useRef(false);

  const patch = useCallback((i: number, value: SceneState) => {
    setStates((prev) => ({ ...prev, [i]: { ...prev[i], ...value } }));
  }, []);

  const onScript = async () => {
    setLoadingScript(true);
    try {
      const result = (await runScript({
        data: { topic, kind, sceneCount, style },
      })) as Script;
      setScript(result);
      setStates({});
      toast.success("Script généré");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de la génération du script");
    } finally {
      setLoadingScript(false);
    }
  };

  const onImage = async (scene: Scene) => {
    patch(scene.index, { imageLoading: true });
    try {
      const { dataUrl } = (await runImage({
        data: { imagePrompt: scene.imagePrompt, visual },
      })) as { dataUrl: string };
      patch(scene.index, { image: dataUrl, imageLoading: false });
    } catch (e) {
      patch(scene.index, { imageLoading: false });
      toast.error(e instanceof Error ? e.message : "Échec de l'image");
    }
  };

  const onVideo = async (scene: Scene) => {
    if (busyRef.current) {
      toast.info("Une vidéo est déjà en cours de génération.");
      return;
    }
    busyRef.current = true;
    patch(scene.index, { videoLoading: true, progress: 0, videoUrl: undefined });
    try {
      const state = states[scene.index];
      const { id } = (await runVideo({
        data: {
          videoPrompt: scene.videoPrompt,
          ...(state?.image ? { imageDataUrl: state.image } : {}),
          seconds: "8" as const,
          orientation,
          visual,
        },
      })) as { id: string };
      patch(scene.index, { videoId: id });

      for (let attempt = 0; attempt < 90; attempt++) {
        await new Promise((r) => setTimeout(r, 6000));
        const job = (await runPoll({ data: { id } })) as {
          status: string;
          progress: number;
          error: string | null;
        };
        patch(scene.index, { progress: job.progress });
        if (job.status === "completed") {
          patch(scene.index, {
            videoUrl: `/api/video-content/${id}`,
            videoLoading: false,
            progress: 100,
          });
          toast.success(`Scène ${scene.index + 1} prête`);
          return;
        }
        if (job.status === "failed") {
          throw new Error(job.error ?? "La génération vidéo a échoué.");
        }
      }
      throw new Error("Délai dépassé pour cette scène.");
    } catch (e) {
      patch(scene.index, { videoLoading: false });
      toast.error(e instanceof Error ? e.message : "Échec de la vidéo");
    } finally {
      busyRef.current = false;
    }
  };

  const fullNarration = useMemo(
    () =>
      script
        ? [script.hook, ...script.scenes.map((s) => s.narration), script.cta]
            .filter(Boolean)
            .join("\n")
        : "",
    [script],
  );

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-12">
      <Toaster position="top-center" />

      <header className="mb-10">
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary/60 px-3 py-1 text-xs tracking-widest uppercase text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5" /> Studio IA
        </span>
        <h1 className="mt-5 text-5xl leading-[0.95] sm:text-7xl">
          Générateur de <span className="text-gold">vidéos animées</span>
        </h1>
        <p className="mt-4 max-w-2xl text-muted-foreground">
          Un sujet, et le studio écrit le script, dessine chaque plan, l'anime en vidéo avec
          son, et prépare vos textes incrustés.
        </p>
      </header>

      <section className="surface-card p-6 sm:p-8">
        <div className="grid gap-6 md:grid-cols-[1.4fr_1fr]">
          <div>
            <label className="text-xs uppercase tracking-widest text-muted-foreground">
              Sujet de la vidéo
            </label>
            <textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              rows={3}
              placeholder="Ex : pourquoi les octopodes ont trois cœurs"
              className="mt-2 w-full resize-none rounded-lg border border-input bg-background/60 p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="mt-4 flex flex-wrap gap-2">
              {KINDS.map((k) => (
                <button
                  key={k.id}
                  onClick={() => setKind(k.id)}
                  className={`rounded-full border px-4 py-2 text-left text-sm transition-colors ${
                    kind === k.id
                      ? "border-primary bg-primary/15 text-foreground"
                      : "border-border bg-secondary/40 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span className="block font-semibold">{k.label}</span>
                  <span className="block text-xs opacity-70">{k.hint}</span>
                </button>
              ))}
            </div>

            <label className="mt-6 block text-xs uppercase tracking-widest text-muted-foreground">
              Style de narration
            </label>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {STYLES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setStyle(s.id)}
                  className={`rounded-lg border px-4 py-2 text-left text-sm transition-colors ${
                    style === s.id
                      ? "border-primary bg-primary/15 text-foreground"
                      : "border-border bg-secondary/40 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span className="block font-semibold">{s.label}</span>
                  <span className="block text-xs opacity-70">{s.hint}</span>
                </button>
              ))}
            </div>

            <label className="mt-6 block text-xs uppercase tracking-widest text-muted-foreground">
              Direction artistique
            </label>
            <div className="mt-2 flex flex-wrap gap-2">
              {VISUALS.map((v) => (
                <button
                  key={v.id}
                  onClick={() => setVisual(v.id)}
                  className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                    visual === v.id
                      ? "border-primary bg-primary/15 text-foreground"
                      : "border-border bg-secondary/40 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div>
              <label className="text-xs uppercase tracking-widest text-muted-foreground">
                Nombre de scènes : {sceneCount}
              </label>
              <input
                type="range"
                min={3}
                max={8}
                value={sceneCount}
                onChange={(e) => setSceneCount(Number(e.target.value))}
                className="mt-3 w-full accent-[oklch(0.79_0.16_72)]"
              />
            </div>
            <div className="flex gap-2">
              {(["vertical", "horizontal"] as const).map((o) => (
                <button
                  key={o}
                  onClick={() => setOrientation(o)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm ${
                    orientation === o
                      ? "border-primary bg-primary/15"
                      : "border-border bg-secondary/40 text-muted-foreground"
                  }`}
                >
                  {o === "vertical" ? "9:16" : "16:9"}
                </button>
              ))}
            </div>
            <button
              onClick={onScript}
              disabled={loadingScript}
              className="btn-gold inline-flex items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-bold uppercase tracking-wider disabled:opacity-60"
            >
              {loadingScript ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Wand2 className="h-4 w-4" />
              )}
              Générer le script
            </button>
          </div>
        </div>
      </section>

      {script && (
        <section className="mt-10">
          <div className="surface-card p-6 sm:p-8">
            <h2 className="text-3xl">{script.title}</h2>
            <p className="mt-2 text-lg text-primary">{script.hook}</p>
            <div className="mt-5 rounded-lg border border-border bg-secondary/40 p-4">
              <span className="text-xs uppercase tracking-widest text-muted-foreground">
                Outro Sophia (fixe sur toutes les vidéos)
              </span>
              <p className="mt-2 text-sm">{script.cta}</p>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {(script.hashtags ?? []).map((h) => (
                <span
                  key={h}
                  className="rounded-full bg-secondary/60 px-3 py-1 text-xs text-muted-foreground"
                >
                  {h.startsWith("#") ? h : `#${h}`}
                </span>
              ))}
            </div>
            <button
              onClick={() => {
                void navigator.clipboard.writeText(fullNarration);
                toast.success("Voix off copiée");
              }}
              className="mt-5 rounded-lg border border-border px-4 py-2 text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground"
            >
              Copier la voix off complète
            </button>
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            {script.scenes.map((scene) => {
              const st = states[scene.index] ?? {};
              return (
                <article key={scene.index} className="surface-card overflow-hidden">
                  <div
                    className={`relative w-full bg-black/50 ${
                      orientation === "vertical" ? "aspect-[9/16]" : "aspect-video"
                    }`}
                  >
                    {st.videoUrl ? (
                      <video
                        src={st.videoUrl}
                        controls
                        playsInline
                        className="h-full w-full object-cover"
                      />
                    ) : st.image ? (
                      <img
                        src={st.image}
                        alt={`Plan ${scene.index + 1} : ${scene.overlay}`}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                        <Clapperboard className="h-10 w-10 opacity-40" />
                      </div>
                    )}

                    <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-5">
                      <p className="caption-overlay text-2xl leading-tight text-white">
                        {scene.overlay}
                      </p>
                    </div>

                    {(st.imageLoading || st.videoLoading) && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                        <span className="text-xs uppercase tracking-widest text-muted-foreground">
                          {st.videoLoading
                            ? `Animation ${st.progress ?? 0}%`
                            : "Création de l'image"}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="p-5">
                    <span className="text-xs uppercase tracking-widest text-muted-foreground">
                      Scène {scene.index + 1}
                    </span>
                    <p className="mt-2 text-sm">{scene.narration}</p>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        onClick={() => onImage(scene)}
                        disabled={st.imageLoading}
                        className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs uppercase tracking-widest hover:border-primary disabled:opacity-50"
                      >
                        <ImageIcon className="h-3.5 w-3.5" /> Image
                      </button>
                      <button
                        onClick={() => onVideo(scene)}
                        disabled={st.videoLoading}
                        className="btn-gold inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-widest disabled:opacity-50"
                      >
                        <Play className="h-3.5 w-3.5" /> Animer
                      </button>
                      {st.videoUrl && (
                        <a
                          href={st.videoUrl}
                          download={`scene-${scene.index + 1}.mp4`}
                          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs uppercase tracking-widest hover:border-primary"
                        >
                          <Download className="h-3.5 w-3.5" /> MP4
                        </a>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}
