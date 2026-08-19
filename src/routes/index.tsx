import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  Clapperboard,
  Download,
  Image as ImageIcon,
  Loader2,
  Play,
  Mic,
  Volume2,

  Sparkles,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { KaraokeCaption } from "@/components/karaoke-caption";


import {
  generateSceneImage,
  generateScript,
  pollSceneVideo,
  generateSceneVoice,
  startSceneVideo,
  suggestTopic,
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
  audio?: string | undefined;
  audioLoading?: boolean | undefined;
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
  const runVoice = useServerFn(generateSceneVoice);

  const [topic, setTopic] = useState("");
  const [angle, setAngle] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const pastTopics = useRef<string[]>([]);
  const runSuggest = useServerFn(suggestTopic);
  const kind: Kind = "faits";

  const [sceneCount, setSceneCount] = useState(5);
  const [style, setStyle] = useState<NarrationStyle>("revelation");
  const [visual, setVisual] = useState<VisualStyle>("papercraft");
  const [voice, setVoice] = useState("ballad");
  const [orientation, setOrientation] = useState<"vertical" | "square" | "horizontal">("square");
  const [script, setScript] = useState<Script | null>(null);
  const [loadingScript, setLoadingScript] = useState(false);
  const [states, setStates] = useState<Record<number, SceneState>>({});
  const busyRef = useRef(false);
  const audioRefs = useRef<Record<number, HTMLAudioElement | null>>({});
  const videoRefs = useRef<Record<number, HTMLVideoElement | null>>({});
  const [previewVoice, setPreviewVoice] = useState(false);
  const voiceSamples = useRef<Record<string, string>>({});
  const sampleRef = useRef<HTMLAudioElement | null>(null);


  const patch = useCallback((i: number, value: SceneState) => {
    setStates((prev) => ({ ...prev, [i]: { ...prev[i], ...value } }));
  }, []);

  const onSuggest = async () => {
    setSuggesting(true);
    try {
      const res = (await runSuggest({ data: { avoid: pastTopics.current.slice(-8) } })) as {
        topic: string;
        angle: string;
      };
      if (res.topic) {
        pastTopics.current.push(res.topic);
        setTopic(res.topic);
        setAngle(res.angle);
        toast.success("Sujet proposé");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de la proposition");
    } finally {
      setSuggesting(false);
    }
  };


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
        data: { imagePrompt: scene.imagePrompt, visual, square: orientation === "square" },
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

  const onVoice = async (scene: Scene) => {
    patch(scene.index, { audioLoading: true });
    try {
      const { audioDataUrl } = (await runVoice({
        data: { text: scene.narration, voice },
      })) as { audioDataUrl: string };
      patch(scene.index, { audio: audioDataUrl, audioLoading: false });
      toast.success(`Voix off scène ${scene.index + 1}`);
    } catch (e) {
      patch(scene.index, { audioLoading: false });
      toast.error(e instanceof Error ? e.message : "Échec de la voix off");
    }
  };

  const onPreviewVoice = async () => {
    setPreviewVoice(true);
    try {
      let src = voiceSamples.current[voice];
      if (!src) {
        const { audioDataUrl } = (await runVoice({
          data: {
            text: "Et si je te racontais un fait que presque personne ne connaît ? Écoute bien.",
            voice,
          },
        })) as { audioDataUrl: string };
        src = audioDataUrl;
        voiceSamples.current[voice] = audioDataUrl;
      }
      const el = sampleRef.current;
      if (el) {
        el.src = src;
        el.currentTime = 0;
        await el.play();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de l'aperçu de voix");
    } finally {
      setPreviewVoice(false);
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
            <div className="mt-2 flex items-center gap-3">
              <button
                onClick={onSuggest}
                disabled={suggesting}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs uppercase tracking-widest hover:border-primary disabled:opacity-50"
              >
                {suggesting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                Proposer un sujet par IA
              </button>
              {angle && <span className="text-xs text-muted-foreground">{angle}</span>}
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
              {(["vertical", "square", "horizontal"] as const).map((o) => (
                <button
                  key={o}
                  onClick={() => setOrientation(o)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm ${
                    orientation === o
                      ? "border-primary bg-primary/15"
                      : "border-border bg-secondary/40 text-muted-foreground"
                  }`}
                >
                  {o === "vertical" ? "9:16" : o === "square" ? "1:1 dans 9:16" : "16:9"}
                </button>
              ))}
            </div>

            <div>
              <label className="text-xs uppercase tracking-widest text-muted-foreground">
                Voix off
              </label>
              <select
                value={voice}
                onChange={(e) => setVoice(e.target.value)}
                className="mt-2 w-full rounded-lg border border-input bg-background/60 p-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              >
                {["ballad", "ash", "verse", "sage", "coral", "alloy"].map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
              <button
                onClick={onPreviewVoice}
                disabled={previewVoice}
                className="mt-2 inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs uppercase tracking-widest hover:border-primary disabled:opacity-50"
              >
                {previewVoice ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Volume2 className="h-3.5 w-3.5" />
                )}
                Écouter un exemple
              </button>
              <audio ref={sampleRef} className="hidden" />

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
                    className={`relative w-full bg-black ${
                      orientation === "horizontal" ? "aspect-video" : "aspect-[9/16]"
                    }`}
                  >
                    {st.videoUrl ? (
                      <video
                        key={st.videoUrl}
                        ref={(el) => {
                          videoRefs.current[scene.index] = el;
                        }}
                        src={st.videoUrl}

                        controls
                        loop
                        playsInline
                        preload="metadata"
                        muted={Boolean(st.audio)}
                        {...(st.image ? { poster: st.image } : {})}
                        onPlay={(e) => {
                          const a = audioRefs.current[scene.index];
                          if (a) {
                            a.currentTime = e.currentTarget.currentTime;
                            void a.play();
                          }
                        }}
                        onPause={() => audioRefs.current[scene.index]?.pause()}
                        onSeeked={(e) => {
                          const a = audioRefs.current[scene.index];
                          if (a) a.currentTime = e.currentTarget.currentTime;
                        }}
                        className="h-full w-full object-contain"
                      />
                    ) : st.image ? (
                      <img
                        src={st.image}
                        alt={`Plan ${scene.index + 1} : ${scene.overlay}`}
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                        <Clapperboard className="h-10 w-10 opacity-40" />
                      </div>
                    )}

                    <KaraokeCaption
                      text={scene.narration}
                      fallback={scene.overlay}
                      getMedia={() =>
                        audioRefs.current[scene.index] ?? videoRefs.current[scene.index] ?? null
                      }
                    />


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
                      <button
                        onClick={() => onVoice(scene)}
                        disabled={st.audioLoading}
                        className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs uppercase tracking-widest hover:border-primary disabled:opacity-50"
                      >
                        {st.audioLoading ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Mic className="h-3.5 w-3.5" />
                        )}
                        Voix off
                      </button>
                      {st.audio && (
                        <a
                          href={st.audio}
                          download={`scene-${scene.index + 1}.mp3`}
                          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs uppercase tracking-widest hover:border-primary"
                        >
                          <Download className="h-3.5 w-3.5" /> MP3
                        </a>
                      )}
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

                    {st.audio && (
                      <audio
                        ref={(el) => {
                          audioRefs.current[scene.index] = el;
                        }}
                        src={st.audio}
                        controls
                        className="mt-4 w-full"
                      />
                    )}
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
