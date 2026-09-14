import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { LANGUAGES, type LanguageId } from "@/lib/languages";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Clapperboard,
  Film,

  Download,
  Image as ImageIcon,
  Loader2,
  Play,
  Mic,
  Volume2,

  Sparkles,
  Wand2,
  History,
  Settings,
  Pencil,
  Star,
  Trash2,
  Square,
} from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { KaraokeCaption } from "@/components/karaoke-caption";
import { MusicLibrary } from "@/components/music-library";
import { audioDuration, estimateSpeechSeconds } from "@/lib/duration";
import { defaultVoice, voicesFor, type VoiceEngine } from "@/lib/voices";
import { defaultSettings, loadSettings, type StudioSettings } from "@/lib/style-presets";
import sophiaLogo from "@/assets/sophia-logo.png.asset.json";



import {
  generateSceneImage,
  generateScript,
  pollSceneVideo,
  generateSceneVoice,
  listVoices,
  searchVoices,
  startSceneVideo,
  suggestTopic,

} from "@/lib/studio.functions";
import { TOPIC_CATEGORIES, type TopicCategory } from "@/lib/topic-categories";
import { pipelineState, resumePipeline, stopPipeline } from "@/lib/jobs/control.functions";



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
  characters?: { name: string; description: string }[];
  palette?: string;
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
  /** Alignement exact mot par mot renvoyé par la voix off (ElevenLabs). */
  words?: { word: string; start: number; end: number }[] | undefined;
};




type HistoryItem = { id: string; title: string; date: number; script: Script };

const HISTORY_KEY = "studio-history-v1";
function readHistory(): HistoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(HISTORY_KEY) ?? "[]") as HistoryItem[];
  } catch {
    return [];
  }
}

function writeHistory(items: HistoryItem[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, 30)));
}

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
  const [topicCategory, setTopicCategory] = useState<TopicCategory>("aleatoire");

  const pastTopics = useRef<string[]>([]);
  const runSuggest = useServerFn(suggestTopic);
  const kind: Kind = "faits";

  // On choisit la DURÉE de la vidéo ; le nombre de plans en découle.
  const [targetSeconds, setTargetSeconds] = useState(35);
  const sceneCount = useMemo(
    () => Math.min(8, Math.max(3, Math.round((targetSeconds - 7) / 6))),
    [targetSeconds],
  );

  const [style, setStyle] = useState<NarrationStyle>("revelation");
  const [language, setLanguage] = useState<LanguageId>("fr");
  const [visual, setVisual] = useState<VisualStyle>("papercraft");
  const [engine, setEngine] = useState<VoiceEngine>("elevenlabs");
  const [voice, setVoice] = useState(defaultVoice("elevenlabs"));
  const [accountVoices, setAccountVoices] = useState<{ id: string; label: string }[]>([]);
  const [favoriteVoices, setFavoriteVoices] = useState<string[]>([]);

  const runListVoices = useServerFn(listVoices);
  useEffect(() => {
    runListVoices({})
      .then((r) => setAccountVoices((r as { voices: { id: string; label: string }[] }).voices))
      .catch(() => setAccountVoices([]));
  }, [runListVoices]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("studio-favorite-voices") ?? "[]") as unknown;
      if (Array.isArray(saved)) setFavoriteVoices(saved.filter((id): id is string => typeof id === "string"));
    } catch {
      setFavoriteVoices([]);
    }
  }, []);

  const [settings, setSettings] = useState<StudioSettings>(defaultSettings());
  useEffect(() => setSettings(loadSettings()), []);

  const [orientation, setOrientation] = useState<"vertical" | "square" | "horizontal">("square");
  const [script, setScript] = useState<Script | null>(null);
  const [loadingScript, setLoadingScript] = useState(false);
  const [states, setStates] = useState<Record<number, SceneState>>({});
  const patch = useCallback((i: number, value: SceneState) => {
    setStates((prev) => ({ ...prev, [i]: { ...prev[i], ...value } }));
  }, []);

  /**
   * Drapeau d'arrêt : vérifié AVANT chaque appel payant (image, clip, voix) et
   * à chaque tour de polling. Rien n'est supprimé, on cesse simplement de
   * commander de nouveaux appels.
   */
  const cancelledRef = useRef(false);
  const [stopped, setStopped] = useState(false);
  const [currentStep, setCurrentStep] = useState("");

  const beginRun = useCallback(() => {
    cancelledRef.current = false;
    setStopped(false);
  }, []);

  const stopRun = useCallback(() => {
    cancelledRef.current = true;
    setStopped(true);
    setCurrentStep("Pipeline arrêté");
    toast.warning("Pipeline arrêté");
  }, []);



  
  const audioRefs = useRef<Record<number, HTMLAudioElement | null>>({});
  const videoRefs = useRef<Record<number, HTMLVideoElement | null>>({});
  const [previewVoice, setPreviewVoice] = useState(false);
  const voiceSamples = useRef<Record<string, string>>({});
  const sampleRef = useRef<HTMLAudioElement | null>(null);
  const [assembling, setAssembling] = useState(false);
  const [assembleStep, setAssembleStep] = useState("");
  const [finalUrl, setFinalUrl] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [editing, setEditing] = useState<Record<number, boolean>>({});

  /** Bible visuelle : personnages + palette répétés sur chaque plan. */
  const bible = useMemo(() => {
    if (!script) return "";
    const chars = (script.characters ?? [])
      .map((c) => `${c.name}: ${c.description}`)
      .join(" | ");
    return [chars, script.palette ?? ""].filter(Boolean).join(" || ");
  }, [script]);

  const bibleFor = (doc: Script | null) => {
    if (!doc) return "";
    const chars = (doc.characters ?? [])
      .map((c) => `${c.name}: ${c.description}`)
      .join(" | ");
    return [chars, doc.palette ?? ""].filter(Boolean).join(" || ");
  };

  const visualOpts = useMemo(
    () => ({
      bible,
      visualBrief: settings.visual[visual].brief,
      quality: settings.visual[visual].quality,
    }),
    [bible, settings, visual],
  );

  /** Masque carré : dépend de la direction artistique réglée dans Paramètres. */
  const useSquareMask = settings.visual[visual].square && orientation !== "horizontal";

  /** Image de référence (1er plan généré) pour garder les mêmes personnages. */
  const referenceImage = useRef<string | null>(null);
  /** Image du plan précédent : continuité d'une scène à l'autre. */
  const previousImage = useRef<string | null>(null);


  useEffect(() => {
    setHistory(readHistory());
  }, []);


  const saveHistory = useCallback((id: string, next: Script) => {
    const items = readHistory().filter((h) => h.id !== id);
    const updated = [
      { id, title: next.title || "Sans titre", date: Date.now(), script: next },
      ...items,
    ];
    writeHistory(updated);
    setHistory(updated);
  }, []);

  const updateScene = useCallback(
    (index: number, field: keyof Scene, value: string) => {
      setScript((prev) => {
        if (!prev) return prev;
        const next = {
          ...prev,
          scenes: prev.scenes.map((s) => (s.index === index ? { ...s, [field]: value } : s)),
        };
        if (projectId) saveHistory(projectId, next);
        return next;
      });
    },
    [projectId, saveHistory],
  );

  const deleteHistory = useCallback((id: string) => {
    const updated = readHistory().filter((h) => h.id !== id);
    writeHistory(updated);
    setHistory(updated);
    void import("@/lib/project-store").then((m) => m.deleteProjectMedia(id));
  }, []);


  /**
   * Reprise après fermeture d'onglet ou plantage : un clip déjà commandé (donc
   * déjà facturé) est récupéré au lieu d'être régénéré.
   */
  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current) return;
    const pending = Object.entries(states).filter(
      ([, st]) => st?.videoId && !st?.videoUrl,
    );
    if (!pending.length) return;
    resumed.current = true;
    void (async () => {
      for (const [key, st] of pending) {
        if (cancelledRef.current) return;
        const index = Number(key);
        const id = st!.videoId!;
        for (let attempt = 0; attempt < 60; attempt++) {
          if (cancelledRef.current) return;
          const job = (await runPoll({ data: { id } }).catch(() => null)) as
            | { status: string; progress: number; error: string | null }
            | null;
          if (!job) break;
          if (job.status === "completed") {
            patch(index, {
              videoUrl: `/api/video-content/${id}`,
              videoLoading: false,
              progress: 100,
            });
            toast.success(`Scène ${index + 1} récupérée`);
            break;
          }
          if (job.status === "failed") break;
          patch(index, { videoLoading: true, progress: job.progress });
          await new Promise((r) => setTimeout(r, 6000));
        }
      }
    })();
  }, [states, patch]);

  // Persiste les médias (images / vidéos / voix) du projet courant pour l'historique.
  useEffect(() => {
    if (!projectId) return;
    const t = setTimeout(() => {
      void import("@/lib/project-store").then((m) => m.saveProjectMedia(projectId, states));
    }, 600);
    return () => clearTimeout(t);
  }, [projectId, states]);


  const onSuggest = async () => {
    setSuggesting(true);
    try {
      // Historique des sujets déjà proposés, conservé entre les sessions :
      // l'IA ne peut plus retomber sur les mêmes idées après un rechargement.
      let seen: string[] = [];
      try {
        seen = JSON.parse(localStorage.getItem("sophia:past-topics") ?? "[]") as string[];
      } catch {
        seen = [];
      }
      const avoid = [...seen, ...pastTopics.current]
        .filter((t, i, a) => t && a.indexOf(t) === i)
        .slice(-40);
      const res = (await runSuggest({
        data: { avoid, style, category: topicCategory, language },
      })) as {

        topic: string;
        angle: string;
      };
      if (res.topic) {
        pastTopics.current.push(res.topic);
        try {
          localStorage.setItem(
            "sophia:past-topics",
            JSON.stringify([...avoid, res.topic].slice(-60)),
          );
        } catch {
          /* quota plein : sans gravité */
        }
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


  const onScript = async (): Promise<Script | undefined> => {
    setLoadingScript(true);
    try {
      const result = (await runScript({
        data: {
          topic,
          kind,
          sceneCount,
          style,
          targetSeconds,
          language,
          styleBrief: settings.narration[style].brief,
          wordsBias: settings.narration[style].wordsBias,
        },
      })) as Script;
      setScript(result);
      setStates({});
      referenceImage.current = null;
      previousImage.current = null;

      const id = `p${Date.now()}`;
      setProjectId(id);
      saveHistory(id, result);
      toast.success("Script généré");
      return result;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de la génération du script");
      return undefined;
    } finally {
      setLoadingScript(false);
    }
  };

  /** Résumé narratif : ce qui vient d'être raconté et ce qui suit. */
  const storyContext = (scene: Scene, doc: Script | null = script) => {
    if (!doc) return undefined;
    const all = doc.scenes;
    const before = all
      .filter((s) => s.index < scene.index)
      .slice(-3)
      .map((s) => `shot ${s.index + 1}: ${s.imagePrompt}`);
    const next = all.find((s) => s.index === scene.index + 1);
    const parts = [
      `full story: ${doc.title ?? topic}`,
      before.length ? `previous shots — ${before.join(" | ")}` : "this is the opening shot",
      `current shot ${scene.index + 1} of ${all.length}`,
      next ? `next shot will be: ${next.imagePrompt}` : "this is the final shot",
    ];
    return parts.join(". ").slice(0, 3500);
  };

  const onImage = async (scene: Scene, doc: Script | null = script) => {
    if (cancelledRef.current) return undefined; // appel payant : arrêt demandé
    patch(scene.index, { imageLoading: true });
    try {
      const consistent = settings.useReferenceImage && scene.index > 0;
      const ref = consistent ? referenceImage.current : null;
      // Continuité : on montre aussi le plan précédent au modèle.
      const prev = consistent ? (previousImage.current ?? null) : null;
      const story = storyContext(scene, doc);
      const sceneVisualOpts = { ...visualOpts, bible: bibleFor(doc) };
      const { dataUrl } = (await runImage({
        data: {
          imagePrompt: scene.imagePrompt,
          visual,
          square: orientation === "square",
          ...sceneVisualOpts,
          ...(story ? { story } : {}),
          ...(ref ? { referenceImage: ref } : {}),
          ...(prev && prev !== ref ? { previousImage: prev } : {}),
        },
      })) as { dataUrl: string };

      if (scene.index === 0 || !referenceImage.current) referenceImage.current = dataUrl;
      previousImage.current = dataUrl;
      patch(scene.index, { image: dataUrl, imageLoading: false });
      return dataUrl;
    } catch (e) {
      patch(scene.index, { imageLoading: false });
      toast.error(e instanceof Error ? e.message : "Échec de l'image");
      return undefined;
    }
  };


  const onVideo = async (
    scene: Scene,
    imageOverride?: string,
    doc: Script | null = script,
    voiceSeconds?: number,
  ) => {
    // Économie de crédits : on ne relance pas un plan déjà généré.
    const done = states[scene.index]?.videoUrl;
    if (done && !imageOverride) return done;
    if (cancelledRef.current) return undefined; // appel payant : arrêt demandé
    patch(scene.index, { videoLoading: true, progress: 0, videoUrl: undefined });
    try {
      const image = imageOverride ?? states[scene.index]?.image;
      // En mode « 1:1 dans 9:16 », on compose nous-mêmes le carré au centre d'un
      // cadre vertical noir : le modèle vidéo ne produit que du 9:16 et
      // recadrerait sinon l'image à sa guise (sujet coupé, cadrage instable).
      // L'image carrée d'origine reste celle affichée et servant de référence.
      let videoInput = image;
      if (image && orientation === "square" && settings.precomposeSquare !== false) {
        const { composeSquareInVertical } = await import("@/lib/square-frame");
        const dims = settings.hd ? { w: 1080, h: 1920 } : { w: 720, h: 1280 };
        videoInput = await composeSquareInVertical(image, dims.w, dims.h);
      }
      const story = storyContext(scene, doc);
      const literalVideoPrompt = [
        `Illustrate exactly this spoken narration: ${scene.narration}`,
        `The reference image depicts: ${scene.imagePrompt}`,
        "Keep every character, object, costume and location from the reference image unchanged",
        scene.videoPrompt,
      ].join(". ").slice(0, 1950);
      const seconds = voiceSeconds
        ? voiceSeconds <= 4
          ? "4"
          : voiceSeconds <= 6
            ? "6"
            : "8"
        : undefined;
      const { id } = (await runVideo({
        data: {
          videoPrompt: literalVideoPrompt,
          ...(videoInput ? { imageDataUrl: videoInput } : {}),
          narration: scene.narration,
          ...(seconds ? { seconds } : {}),
          orientation,
          visual,
          ...visualOpts,
          bible: bibleFor(doc),
          ...(story ? { story } : {}),
          motion: settings.visual[visual].motion,
          hd: settings.hd,
        },
      })) as { id: string };
      patch(scene.index, { videoId: id });

      for (let attempt = 0; attempt < 90; attempt++) {
        if (cancelledRef.current) {
          patch(scene.index, { videoLoading: false });
          return undefined;
        }
        await new Promise((r) => setTimeout(r, 6000));
        if (cancelledRef.current) {
          patch(scene.index, { videoLoading: false });
          return undefined;
        }
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
          return `/api/video-content/${id}`;

        }
        if (job.status === "failed") {
          throw new Error(job.error ?? "La génération vidéo a échoué.");
        }
      }
      throw new Error("Délai dépassé pour cette scène.");
    } catch (e) {
      patch(scene.index, { videoLoading: false });
      toast.error(e instanceof Error ? e.message : "Échec de la vidéo");
      return undefined;
    }
  };


  const [generatingAll, setGeneratingAll] = useState(false);

  /** Coût estimé : plans encore à animer × secondes commandées par plan. */
  const estimateCost = useCallback(
    (doc: Script | null = script) => {
      const scenes = doc?.scenes ?? [];
      const pending = scenes.filter((s) => !states[s.index]?.videoUrl);
      const perClip = Math.min(8, Math.max(4, Math.round(targetSeconds / Math.max(1, scenes.length))));
      return { clips: pending.length, seconds: pending.length * perClip, perClip };
    },
    [script, states, targetSeconds],
  );

  /** Confirmation obligatoire avant toute dépense de crédits en série. */
  const confirmCost = (doc: Script | null = script) => {
    const { clips, seconds, perClip } = estimateCost(doc);
    if (!clips) return true;
    return window.confirm(
      `Coût estimé : ${clips} clip${clips > 1 ? "s" : ""} × ${perClip} s = ${seconds} s de vidéo IA facturées.\n\nLancer la génération ?`,
    );
  };

  const onGenerateAll = async () => {
    if (!script) return;
    if (!confirmCost(script)) return;
    beginRun();
    setGeneratingAll(true);
    setCurrentStep("Génération des plans…");
    try {
      // Les images sont générées EN CHAÎNE (chaque plan voit le plan d'ouverture
      // + le plan précédent) pour que la vidéo se lise comme une seule histoire.
      // Les vidéos, elles, partent dès que leur image est prête (pas de crédit
      // dépensé deux fois : on saute les plans déjà générés).
      const videoJobs: Promise<unknown>[] = [];
      for (const scene of script.scenes) {
        if (cancelledRef.current) break;
        const existing = states[scene.index]?.image;
        const image = existing ?? (await onImage(scene));
        if (scene.index === 0 && image) referenceImage.current = image;
        if (image) previousImage.current = image;
        if (states[scene.index]?.videoUrl) continue;
        if (cancelledRef.current) break;
        // La voix (peu coûteuse) est produite AVANT le clip : on commande alors
        // la durée exacte (4/6/8 s) au lieu de payer 8 s systématiquement.
        const audio = states[scene.index]?.audio ?? (await onVoice(scene))?.audioDataUrl;
        const voiceSeconds = audio ? await audioDuration(audio) : undefined;
        if (cancelledRef.current) break;
        videoJobs.push(onVideo(scene, image, script, voiceSeconds));
      }
      await Promise.all(videoJobs);
      if (cancelledRef.current) toast.warning("Pipeline arrêté");
      else toast.success("Toutes les scènes sont prêtes");
    } finally {
      setGeneratingAll(false);
      setCurrentStep(cancelledRef.current ? "Pipeline arrêté" : "");
    }
  };



  const onVoice = async (scene: Scene) => {
    if (cancelledRef.current) return undefined; // appel payant : arrêt demandé
    patch(scene.index, { audioLoading: true });
    try {
      const { audioDataUrl, words } = (await runVoice({
        data: { text: scene.narration, voice, engine, language },
      })) as { audioDataUrl: string; words?: { word: string; start: number; end: number }[] };
      patch(scene.index, { audio: audioDataUrl, words: words ?? [], audioLoading: false });
      toast.success(`Voix off scène ${scene.index + 1}`);
      return { audioDataUrl, words: words ?? [] };
    } catch (e) {
      patch(scene.index, { audioLoading: false });
      toast.error(e instanceof Error ? e.message : "Échec de la voix off");
      return undefined;
    }
  };




  const onPreviewVoice = async () => {
    setPreviewVoice(true);
    try {
      const sampleKey = `${engine}:${voice}`;
      let src = voiceSamples.current[sampleKey];
      if (!src) {
        const { audioDataUrl } = (await runVoice({
          data: {
            text: "Et si je te racontais un fait que presque personne ne connaît ? Écoute bien.",
            voice,
            engine,
            language,
          },
        })) as { audioDataUrl: string };
        src = audioDataUrl;
        voiceSamples.current[sampleKey] = audioDataUrl;
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
  const readyScenes = useMemo(
    () =>
      (script?.scenes ?? [])
        .map((s) => states[s.index])
        .filter((st): st is SceneState => Boolean(st?.videoUrl || st?.image)),
    [script, states],
  );


  const buildFinalVideo = async (
    snapshot: Record<number, SceneState | undefined>,
    autoDownload: boolean,
    scriptOverride?: Script,
  ) => {
    const doc = scriptOverride ?? script;

    const { assembleVideo } = await import("@/lib/assemble-video");
    const { randomTrack } = await import("@/lib/music-store");
    const { makeCaptionCues, makeRoundedSquareMask, sophiaWindow, voiceWindow, shiftTimings } =
      await import("@/lib/karaoke-overlay");
    const dims =
      orientation === "horizontal"
        ? { width: settings.hd ? 1920 : 1280, height: settings.hd ? 1080 : 720 }
        : { width: settings.hd ? 1080 : 720, height: settings.hd ? 1920 : 1280 };
    // AUCUN plan n'est écarté : un plan sans clip animé est rendu à partir de
    // son image fixe, pour que l'histoire (et la durée) restent complètes.
    const all = (doc?.scenes ?? [])
      .map((s) => ({ scene: s, st: (snapshot[s.index] ?? {}) as SceneState }))
      .filter((x) => Boolean(x.st.videoUrl || x.st.image));
    if (!all.length) throw new Error("Aucune scène à assembler.");

    // Un plan sans voix off produirait un blanc silencieux (typiquement le hook
    // du début) : on refabrique la voix manquante AVANT d'assembler, pour ne
    // jamais perdre le début de l'histoire.
    for (const item of all) {
      if (item.st.audio) continue;
      setAssembleStep(`Voix off manquante — scène ${item.scene.index + 1}…`);
      const res = await onVoice(item.scene);
      if (!res) {
        throw new Error(
          `La voix off de la scène ${item.scene.index + 1} n'a pas pu être générée : relance l'export.`,
        );
      }
      item.st = { ...item.st, audio: res.audioDataUrl, words: res.words };

    }
    const ordered = all;




    // Papier découpé : masque carré à coins arrondis, toujours présent.
    const mask = useSquareMask
      ? await makeRoundedSquareMask(dims.width, dims.height)
      : null;

    setAssembleStep("Préparation des sous-titres…");
    const withDurations = await Promise.all(
      ordered.map(async ({ scene, st }) => {
        const raw = st.audio ? await audioDuration(st.audio) : undefined;
        // Silences de tête/queue retirés : la voix démarre tout de suite et le
        // plan s'arrête au dernier mot.
        const win = raw ? voiceWindow(st.words ?? null, raw) : null;
        const duration = win ? win.end - win.start : raw;
        const words = win ? shiftTimings(st.words ?? null, win.start) : (st.words ?? []);
        return {
          ...(st.videoUrl ? { videoUrl: st.videoUrl } : {}),
          ...(st.image ? { imageUrl: st.image } : {}),
          audio: st.audio,
          ...(win ? { trimStart: win.start, trimEnd: win.end } : {}),
          mask,

          // Les images de sous-titres sont fabriquées juste avant l'encodage du
          // plan (et libérées après) : sinon toutes les scènes tiennent en
          // mémoire en même temps et l'onglet plante pendant l'export.
          cues: duration
            ? () =>
                makeCaptionCues(
                  scene.narration,
                  dims.width,
                  dims.height,
                  duration,
                  words,
                  settings.sophiaLogo
                    ? (() => {
                        const w = sophiaWindow(scene.narration, duration, words);
                        return w ? { url: sophiaLogo.url, ...w } : null;
                      })()
                    : null,
                )
            : null,
          // Jamais de gros titre en majuscules : pas d'overlay de secours.
          overlay: null,
          duration,

        };
      }),
    );



    const track = await randomTrack(style);
    if (track) setAssembleStep(`Musique : ${track.name}`);
    else
      toast.warning(
        "Aucune musique dans la banque : ajoute des MP3 dans « Musiques » pour qu'elles soient mixées.",
      );

    const blob = await assembleVideo(withDurations, {
      ...dims,
      music: track?.blob,
      musicVolume: settings.musicVolume,
      onProgress: (step) => setAssembleStep(step),
    });

    if (projectId) {
      const { saveFinalVideo } = await import("@/lib/project-store");
      await saveFinalVideo(projectId, blob);
    }

    const url = URL.createObjectURL(blob);
    setFinalUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
    if (autoDownload) {
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(doc?.title ?? "video").replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase()}.mp4`;
      a.click();
    }
    toast.success(
      track ? `Vidéo assemblée (musique : ${track.name})` : "Vidéo finale assemblée",
    );
  };

  const onAssemble = async () => {
    if (readyScenes.length === 0) return;
    setAssembling(true);
    setAssembleStep("Préparation…");
    try {
      await buildFinalVideo(states, false);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Échec de l'assemblage");
    } finally {
      setAssembling(false);
    }
  };

  /** Tout d'un coup : images + vidéos + voix off manquantes, puis export MP4. */
  const onExportEverything = async (scriptOverride?: Script, skipConfirm = false) => {
    const doc = scriptOverride ?? script;
    if (!doc) return;
    if (!skipConfirm && !confirmCost(doc)) return;
    if (!skipConfirm) beginRun();
    setAssembling(true);
    try {
      setAssembleStep("Génération des scènes manquantes…");
      setCurrentStep("Images…");
      // Images obligatoirement en chaîne : le plan précédent est la référence
      // visuelle du suivant. Les clips peuvent ensuite être générés en parallèle.
      const prepared: { scene: Scene; st: SceneState; image?: string }[] = [];
      for (const scene of doc.scenes) {
        if (cancelledRef.current) break;
        const st = states[scene.index] ?? {};
        const image = st.image ?? (await onImage(scene, doc));
        if (scene.index === 0 && image) referenceImage.current = image;
        if (image) previousImage.current = image;
        prepared.push({ scene, st, ...(image ? { image } : {}) });
      }
      if (cancelledRef.current) {
        setAssembleStep("Pipeline arrêté");
        return;
      }
      setCurrentStep("Voix off et plans animés…");
      const results = await Promise.all(
        prepared.map(async ({ scene, st, image }) => {
          let audio = st.audio;
          let words = st.words;
          if (!audio && !cancelledRef.current) {
            const res = (await runVoice({
              data: { text: scene.narration, voice, engine, language },
            }).catch((e: unknown) => {
              toast.error(
                e instanceof Error ? e.message : `Voix off impossible (plan ${scene.index + 1})`,
              );
              return null;
            })) as
              | { audioDataUrl: string; words?: { word: string; start: number; end: number }[] }
              | null;
            if (res) {
              audio = res.audioDataUrl;
              words = res.words ?? [];
              patch(scene.index, { audio, words });
            }
          }
          const voiceSeconds = audio ? await audioDuration(audio) : undefined;
          // AUCUNE relance payante : un clip raté reste en échec (signalé ici)
          // et l'assemblage retombe sur l'image fixe du plan.
          const videoUrl = st.videoUrl ?? (await onVideo(scene, image, doc, voiceSeconds));
          if (!videoUrl && !cancelledRef.current) {
            toast.warning(`Plan ${scene.index + 1} : clip animé en échec → image fixe`);
          }
          return [scene.index, { ...st, image, videoUrl, audio, words }] as const;

        }),
      );
      if (cancelledRef.current) {
        setAssembleStep("Pipeline arrêté");
        return;
      }
      const snapshot: Record<number, SceneState | undefined> = { ...states };
      for (const [i, st] of results) snapshot[i] = st as SceneState;
      setCurrentStep("Montage…");
      await buildFinalVideo(snapshot, true, doc);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Échec de l'export complet");
    } finally {
      setAssembling(false);
      setCurrentStep(cancelledRef.current ? "Pipeline arrêté" : "");
    }
  };

  /** Un seul clic depuis le sujet : script → images → vidéos → voix → MP4. */
  const [autoRunning, setAutoRunning] = useState(false);

  // Garde-fou : on prévient avant de fermer l'onglet pendant une génération payante.
  const busy = generatingAll || autoRunning || assembling;
  useEffect(() => {
    if (!busy) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [busy]);

  // Coupe-circuit de la file serveur (jobs automatiques de l'OS).
  const runStopPipeline = useServerFn(stopPipeline);
  const runResumePipeline = useServerFn(resumePipeline);
  const runPipelineState = useServerFn(pipelineState);
  const [pipelinePaused, setPipelinePaused] = useState(false);
  useEffect(() => {
    void (async () => {
      try {
        const r = (await runPipelineState({})) as { paused: boolean };
        setPipelinePaused(Boolean(r.paused));
      } catch {
        setPipelinePaused(false);
      }
    })();
  }, [runPipelineState]);

  /** STOP global : arrête le navigateur ET la file serveur. */
  const onStopAll = async () => {
    stopRun();
    try {
      await runStopPipeline({ data: { reason: "Arrêt manuel depuis le studio" } });
      setPipelinePaused(true);
    } catch {
      /* la file serveur peut être indisponible : l'arrêt local reste effectif */
    }
  };

  const onResumePipeline = async () => {
    try {
      await runResumePipeline({});
      setPipelinePaused(false);
      setStopped(false);
      cancelledRef.current = false;
      toast.success("File relancée");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reprise impossible");
    }
  };

  /** Panneau d'état : plans prêts / total et coût estimé. */
  const totalScenes = script?.scenes.length ?? 0;
  const doneScenes = (script?.scenes ?? []).filter((s) => states[s.index]?.videoUrl).length;
  const cost = estimateCost();

  const onAutoAll = async () => {
    if (!topic.trim()) {
      toast.error("Écris d'abord le sujet de la vidéo");
      return;
    }
    const perClip = Math.min(8, Math.max(4, Math.round(targetSeconds / Math.max(1, sceneCount))));
    const ok = window.confirm(
      `Coût estimé : ${sceneCount} clips × ${perClip} s = ${sceneCount * perClip} s de vidéo IA facturées.\n\nLancer la génération complète ?`,
    );
    if (!ok) return;
    beginRun();
    setAutoRunning(true);
    try {
      setAssembleStep("Écriture du script…");
      setCurrentStep("Écriture du script…");
      const fresh = await onScript();
      if (!fresh || cancelledRef.current) return;
      await onExportEverything(fresh, true);
    } finally {
      setAutoRunning(false);
      setCurrentStep(cancelledRef.current ? "Pipeline arrêté" : "");
    }
  };




  const [exporting, setExporting] = useState<number | null>(null);

  const [voiceQuery, setVoiceQuery] = useState("");
  const [remoteVoices, setRemoteVoices] = useState<{ id: string; label: string }[]>([]);
  const runSearchVoices = useServerFn(searchVoices);

  // Recherche dans la bibliothèque ElevenLabs (au-delà des voix déjà chargées).
  useEffect(() => {
    const q = voiceQuery.trim();
    if (engine !== "elevenlabs" || q.length < 2) {
      setRemoteVoices([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await runSearchVoices({ data: { query: q } });
        if (!cancelled) setRemoteVoices(res.voices);
      } catch {
        /* recherche best-effort */
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [voiceQuery, engine, runSearchVoices]);

  const availableVoices = useMemo(() => {
    const base = engine === "elevenlabs" && accountVoices.length ? accountVoices : voicesFor(engine);
    const q = voiceQuery.trim().toLowerCase();
    const filtered = q ? base.filter((v) => v.label.toLowerCase().includes(q)) : base;
    const seen = new Set(filtered.map((v) => v.id));
    const extra = remoteVoices.filter((v) => !seen.has(v.id));
    return [...filtered, ...extra].sort((a, b) => {
      const favoriteDelta = Number(favoriteVoices.includes(b.id)) - Number(favoriteVoices.includes(a.id));
      return favoriteDelta || a.label.localeCompare(b.label, "fr");
    });
  }, [accountVoices, engine, favoriteVoices, voiceQuery, remoteVoices]);


  const toggleFavoriteVoice = () => {
    const next = favoriteVoices.includes(voice)
      ? favoriteVoices.filter((id) => id !== voice)
      : [voice, ...favoriteVoices];
    setFavoriteVoices(next);
    localStorage.setItem("studio-favorite-voices", JSON.stringify(next));
    toast.success(next.includes(voice) ? "Narrateur ajouté aux favoris" : "Narrateur retiré des favoris");
  };

  /** Exporte une scène en MP4 avec la voix off et le texte incrusté. */
  const onExportScene = async (scene: Scene) => {
    const st = states[scene.index];
    if (!st?.videoUrl) return;
    setExporting(scene.index);
    try {
      const { assembleVideo } = await import("@/lib/assemble-video");
      const { makeOverlayPng } = await import("@/lib/overlay-png");
      const { makeCaptionCues, makeRoundedSquareMask, sophiaWindow, voiceWindow, shiftTimings } =
        await import("@/lib/karaoke-overlay");
      const dims =
        orientation === "horizontal"
          ? { width: settings.hd ? 1920 : 1280, height: settings.hd ? 1080 : 720 }
          : { width: settings.hd ? 1080 : 720, height: settings.hd ? 1920 : 1280 };
      const rawDuration = st.audio ? await audioDuration(st.audio) : undefined;
      const win = rawDuration ? voiceWindow(st.words ?? null, rawDuration) : null;
      const duration = win ? win.end - win.start : rawDuration;
      const sceneWords = win ? shiftTimings(st.words ?? null, win.start) : (st.words ?? []);
      const logoWin =
        settings.sophiaLogo && duration
          ? sophiaWindow(scene.narration, duration, sceneWords)
          : null;
      const cues = duration
        ? await makeCaptionCues(
            scene.narration,
            dims.width,
            dims.height,
            duration,
            sceneWords,
            logoWin ? { url: sophiaLogo.url, ...logoWin } : null,
          )
        : null;
      const mask = useSquareMask
        ? await makeRoundedSquareMask(dims.width, dims.height)
        : null;

      const blob = await assembleVideo(
        [
          {
            videoUrl: st.videoUrl,
            audio: st.audio,
            ...(win ? { trimStart: win.start, trimEnd: win.end } : {}),
            cues,
            mask,
            overlay: cues
              ? null
              : await makeOverlayPng(scene.overlay, dims.width, dims.height),
            duration,
          },
        ],


        dims,
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `scene-${scene.index + 1}.mp4`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Échec de l'export");
    } finally {
      setExporting(null);
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
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            onClick={() => setShowHistory((v) => !v)}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs uppercase tracking-widest hover:border-primary"
          >
            <History className="h-3.5 w-3.5" /> Historique ({history.length})
          </button>
          <Link
            to="/parametres"
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs uppercase tracking-widest hover:border-primary"
          >
            <Settings className="h-3.5 w-3.5" /> Paramètres
          </Link>
        </div>

        {/* Panneau d'état, toujours visible : étape, avancement, coût estimé et
            arrêt d'urgence. Il reste affiché au repos pour pouvoir mettre en
            pause la file serveur (jobs automatiques) avant même qu'elle parte. */}
        {true && (
          <div className="mt-4 flex flex-wrap items-center gap-4 rounded-lg border border-border bg-secondary/30 px-4 py-3 text-xs">
            <span className="uppercase tracking-widest text-muted-foreground">
              {currentStep ||
                (busy
                  ? "Génération en cours…"
                  : stopped
                    ? "Pipeline arrêté"
                    : pipelinePaused
                      ? "File en pause"
                      : "File active — prête")}
            </span>
            {totalScenes > 0 && (
              <span className="text-muted-foreground">
                Plans : {doneScenes}/{totalScenes}
              </span>
            )}
            <span className="text-muted-foreground">
              Coût estimé : {cost.clips} clip{cost.clips > 1 ? "s" : ""} × {cost.perClip} s ={" "}
              {cost.seconds} s
            </span>
            <div className="ml-auto flex items-center gap-2">
              {!pipelinePaused && !(busy && stopped) && (
                <button
                  onClick={onStopAll}
                  className="inline-flex items-center gap-2 rounded-lg border border-destructive px-3 py-1.5 uppercase tracking-widest text-destructive hover:bg-destructive/10"
                >
                  <Square className="h-3 w-3" /> Stop
                </button>
              )}
              {pipelinePaused && (
                <button
                  onClick={onResumePipeline}
                  className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 uppercase tracking-widest hover:border-primary"
                >
                  <Play className="h-3 w-3" /> Reprendre
                </button>
              )}
            </div>
          </div>
        )}


        {showHistory && (
          <div className="mt-4 space-y-2 rounded-lg border border-border bg-secondary/30 p-4">
            {history.length === 0 && (
              <p className="text-xs text-muted-foreground">Aucune vidéo enregistrée pour l'instant.</p>
            )}
            {history.map((h) => (
              <div key={h.id} className="flex items-center justify-between gap-3">
                <button
                  onClick={async () => {
                    setScript(h.script);
                    setProjectId(h.id);
                    setFinalUrl(null);
                    setShowHistory(false);
                    const { loadProjectMedia } = await import("@/lib/project-store");
                    const media = await loadProjectMedia(h.id);
                    setStates(media);
                    const { loadFinalVideo } = await import("@/lib/project-store");
                    const savedFinal = await loadFinalVideo(h.id);
                    if (savedFinal) setFinalUrl(URL.createObjectURL(savedFinal));
                    toast.success("Projet rechargé");
                  }}

                  className="flex-1 truncate text-left text-sm hover:text-primary"
                >
                  {h.title}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {new Date(h.date).toLocaleString("fr-FR")}
                  </span>
                </button>
                <button
                  onClick={() => deleteHistory(h.id)}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="Supprimer"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
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
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <select
                value={topicCategory}
                onChange={(e) => setTopicCategory(e.target.value as TopicCategory)}
                className="rounded-lg border border-input bg-background/60 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-ring"
              >
                {TOPIC_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
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
              <label
                htmlFor="video-language"
                className="text-xs uppercase tracking-widest text-muted-foreground"
              >
                Langue de la vidéo
              </label>
              <select
                id="video-language"
                value={language}
                onChange={(e) => setLanguage(e.target.value as LanguageId)}
                className="mt-2 w-full rounded-lg border border-input bg-background/60 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              >
                {LANGUAGES.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                Script, voix off et sous-titres sont générés dans cette langue.
              </p>
            </div>

            <div>
              <label className="text-xs uppercase tracking-widest text-muted-foreground">
                Durée de la vidéo : {targetSeconds}s
              </label>
              <input
                type="range"
                min={15}
                max={75}
                step={5}
                value={targetSeconds}
                onChange={(e) => setTargetSeconds(Number(e.target.value))}
                className="mt-3 w-full accent-[oklch(0.79_0.16_72)]"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {sceneCount} plans + CTA · le texte est calibré pour tenir exactement dans cette
                durée
              </p>
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
              <label htmlFor="narrator-voice" className="text-xs uppercase tracking-widest text-muted-foreground">
                Voix off
              </label>
              <div className="mt-2 flex gap-2">
                {(["lovable", "elevenlabs"] as const).map((e) => (
                  <button
                    key={e}
                    onClick={() => {
                      setEngine(e);
                      setVoice(defaultVoice(e));
                    }}
                    className={`flex-1 rounded-lg border px-3 py-2 text-xs uppercase tracking-widest ${
                      engine === e
                        ? "border-primary bg-primary/15"
                        : "border-border bg-secondary/40 text-muted-foreground"
                    }`}
                  >
                    {e === "lovable" ? "Standard" : "Premium (ElevenLabs)"}
                  </button>
                ))}
              </div>
              <input
                type="search"
                value={voiceQuery}
                onChange={(e) => setVoiceQuery(e.target.value)}
                placeholder="Chercher un narrateur (Nicolas, Guillaume, Adam…)"
                aria-label="Chercher un narrateur par son nom"
                className="mt-2 w-full rounded-lg border border-input bg-background/60 p-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <div className="mt-2 flex gap-2">
                <select
                  id="narrator-voice"
                  value={voice}
                  onChange={(e) => setVoice(e.target.value)}
                  className="min-w-0 flex-1 rounded-lg border border-input bg-background/60 p-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                >
                  {!availableVoices.some((v) => v.id === voice) && (
                    <option value={voice}>Narrateur sélectionné</option>
                  )}
                  {availableVoices.map((v) => (
                    <option key={v.id} value={v.id}>
                      {favoriteVoices.includes(v.id) ? `★ ${v.label}` : v.label}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={toggleFavoriteVoice}
                  aria-label={favoriteVoices.includes(voice) ? "Retirer ce narrateur des favoris" : "Ajouter ce narrateur aux favoris"}
                  title={favoriteVoices.includes(voice) ? "Retirer des favoris" : "Ajouter aux favoris"}
                  className={`grid size-10 shrink-0 place-items-center rounded-lg border transition-colors ${
                    favoriteVoices.includes(voice)
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border text-muted-foreground hover:border-primary hover:text-primary"
                  }`}
                >
                  <Star className={`h-4 w-4 ${favoriteVoices.includes(voice) ? "fill-current" : ""}`} />
                </button>
              </div>
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

            <MusicLibrary
              styles={STYLES.map((s) => ({ id: s.id, label: s.label }))}
              activeStyle={style}
            />



            <button
              onClick={onAutoAll}
              disabled={autoRunning || loadingScript || assembling}
              className="btn-gold inline-flex items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-bold uppercase tracking-wider disabled:opacity-60"
            >
              {autoRunning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Générer toute la vidéo et exporter
            </button>
            {autoRunning && assembleStep && (
              <p className="-mt-1 text-center text-xs text-muted-foreground">{assembleStep}</p>
            )}

            <button
              onClick={() => void onScript()}

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

            <div className="mt-6 rounded-lg border border-border bg-secondary/30 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={onGenerateAll}
                  disabled={generatingAll}
                  className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-xs font-bold uppercase tracking-widest hover:border-primary disabled:opacity-50"
                >
                  {generatingAll ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  Tout animer en parallèle
                </button>
                <button
                  onClick={() => onExportEverything()}
                  disabled={assembling || generatingAll}
                  className="btn-gold inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-xs font-bold uppercase tracking-widest disabled:opacity-50"
                >
                  {assembling ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  Tout générer &amp; exporter (MP4 + voix + texte)
                </button>
                <button
                  onClick={onAssemble}
                  disabled={assembling || readyScenes.length === 0}
                  className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-xs font-bold uppercase tracking-widest hover:border-primary disabled:opacity-50"
                >
                  {assembling ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Film className="h-3.5 w-3.5" />
                  )}
                  Assembler la vidéo entière
                </button>

                <span className="text-xs uppercase tracking-widest text-muted-foreground">
                  {assembling
                    ? assembleStep
                    : `${readyScenes.length}/${script.scenes.length} scènes animées`}
                </span>
                {finalUrl && (
                  <a
                    href={finalUrl}
                    download="video-finale.mp4"
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs uppercase tracking-widest hover:border-primary"
                  >
                    <Download className="h-3.5 w-3.5" /> MP4 final
                  </a>
                )}
              </div>
              {finalUrl && (
                <video
                  src={finalUrl}
                  controls
                  playsInline
                  className="mt-4 max-h-[70vh] w-full rounded-lg bg-black object-contain"
                />
              )}
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                onClick={() => {
                  const allOpen = script.scenes.every((s) => editing[s.index]);
                  setEditing(
                    allOpen
                      ? {}
                      : Object.fromEntries(script.scenes.map((s) => [s.index, true])),
                  );
                }}
                className="rounded-lg border border-border px-4 py-2 text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground"
              >
                {script.scenes.every((s) => editing[s.index])
                  ? "Fermer l'édition du script"
                  : "Modifier le script avant les images"}
              </button>
              <button
                onClick={() => {
                  void navigator.clipboard.writeText(fullNarration);
                  toast.success("Voix off copiée");
                }}
                className="rounded-lg border border-border px-4 py-2 text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground"
              >
                Copier la voix off complète
              </button>
            </div>

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

                    {useSquareMask && (
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <div
                          className="aspect-square w-[88%] rounded-[7%]"
                          style={{ boxShadow: "0 0 0 9999px #000" }}
                        />
                      </div>
                    )}


                    <KaraokeCaption
                      text={scene.narration}
                      fallback={scene.overlay}
                      words={st.words}
                      showLogo={settings.sophiaLogo}
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
                    {editing[scene.index] ? (
                      <div className="mt-3 space-y-2">
                        <textarea
                          value={scene.narration}
                          onChange={(e) => updateScene(scene.index, "narration", e.target.value)}
                          rows={3}
                          className="w-full rounded-lg border border-border bg-background p-2 text-sm"
                        />
                        <input
                          value={scene.overlay}
                          onChange={(e) => updateScene(scene.index, "overlay", e.target.value)}
                          placeholder="Texte incrusté"
                          className="w-full rounded-lg border border-border bg-background p-2 text-xs"
                        />
                        <textarea
                          value={scene.imagePrompt}
                          onChange={(e) => updateScene(scene.index, "imagePrompt", e.target.value)}
                          rows={2}
                          placeholder="Prompt image (anglais)"
                          className="w-full rounded-lg border border-border bg-background p-2 text-xs"
                        />
                        <textarea
                          value={scene.videoPrompt}
                          onChange={(e) => updateScene(scene.index, "videoPrompt", e.target.value)}
                          rows={2}
                          placeholder="Prompt animation (anglais)"
                          className="w-full rounded-lg border border-border bg-background p-2 text-xs"
                        />
                      </div>
                    ) : (
                      <p className="mt-2 text-sm">{scene.narration}</p>
                    )}
                    <p className="mt-2 text-xs uppercase tracking-widest text-muted-foreground">
                      ≈ {estimateSpeechSeconds(scene.narration, language).toFixed(1)} s de voix
                      {estimateSpeechSeconds(scene.narration, language) > 8 && " — plus long que le clip, le plan sera légèrement ralenti"}
                    </p>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        onClick={() => onImage(scene)}
                        disabled={st.imageLoading}
                        className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs uppercase tracking-widest hover:border-primary disabled:opacity-50"
                      >
                        <ImageIcon className="h-3.5 w-3.5" /> Image
                      </button>
                      <button
                        onClick={() =>
                          setEditing((prev) => ({ ...prev, [scene.index]: !prev[scene.index] }))
                        }
                        className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs uppercase tracking-widest hover:border-primary"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        {editing[scene.index] ? "Terminé" : "Modifier"}
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
                        <>
                          <a
                            href={st.videoUrl}
                            download={`scene-${scene.index + 1}-brut.mp4`}
                            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs uppercase tracking-widest hover:border-primary"
                          >
                            <Download className="h-3.5 w-3.5" /> MP4 brut
                          </a>
                          <button
                            onClick={() => onExportScene(scene)}
                            disabled={exporting === scene.index}
                            className="btn-gold inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-widest disabled:opacity-50"
                          >
                            {exporting === scene.index ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Download className="h-3.5 w-3.5" />
                            )}
                            MP4 + voix + texte
                          </button>
                        </>
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
