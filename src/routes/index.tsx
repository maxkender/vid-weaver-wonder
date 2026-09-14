import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  LANGUAGES,
  MASTER_LANGUAGES,
  MASTER_LANGUAGE_IDS,
  languageLabel,
  type LanguageId,
} from "@/lib/languages";
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
  translateScript,
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

/** Phrase d'exemple pour l'aperçu de voix, dans la langue de l'onglet actif. */
const VOICE_SAMPLE_TEXT: Record<string, string> = {
  fr: "Et si je te racontais un fait que presque personne ne connaît ? Écoute bien.",
  en: "Here is a fact almost nobody knows. Listen closely.",
  es: "Te cuento un dato que casi nadie conoce. Escucha bien.",
  de: "Hier ist eine Tatsache, die fast niemand kennt. Hör genau zu.",
  it: "Ecco un fatto che quasi nessuno conosce. Ascolta bene.",
  pt: "Aqui está um facto que quase ninguém conhece. Escuta com atenção.",
};

type Kind = "faits" | "culture" | "pub";
type NarrationStyle =
  | "question"
  | "revelation"
  | "storytelling"
  | "listicle"
  | "mecanique";
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

type WordTiming = { word: string; start: number; end: number };

/** Voix off d'UNE langue pour un plan : audio + alignement mot à mot + durée. */
type VoiceTake = { audio: string; words: WordTiming[]; duration: number };

type SceneState = {
  /** MÉDIAS VISUELS — communs à toutes les langues du master, payés une fois. */
  image?: string | undefined;
  imageLoading?: boolean | undefined;
  videoId?: string | undefined;
  videoUrl?: string | undefined;
  videoLoading?: boolean | undefined;
  progress?: number | undefined;
  /** MÉDIAS PARLÉS — un enregistrement par langue produite. */
  voices?: Record<string, VoiceTake> | undefined;
  audioLoading?: boolean | undefined;
};

function voiceOf(st: SceneState | undefined, lang: string): VoiceTake | undefined {
  return st?.voices?.[lang];
}

/** Projets d'avant le master : une seule voix, rangée dans la langue source. */
function migrateStates(
  raw: Record<number, SceneState & { audio?: string; words?: WordTiming[] }>,
  sourceLang: string,
): Record<number, SceneState> {
  const out: Record<number, SceneState> = {};
  for (const [k, v] of Object.entries(raw)) {
    const { audio, words, ...rest } = v;
    out[Number(k)] = audio
      ? {
          ...rest,
          voices: { ...(rest.voices ?? {}), [sourceLang]: { audio, words: words ?? [], duration: 0 } },
        }
      : rest;
  }
  return out;
}

type HistoryItem = {
  id: string;
  title: string;
  date: number;
  script: Script;
  /** Script traduit par langue (la langue source pointe sur le script d'origine). */
  scripts?: Record<string, Script>;
};

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
  { id: "mecanique", label: "Mécanique", hint: "Comment ça marche vraiment" },
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
  const [targetSeconds, setTargetSeconds] = useState(50);
  const sceneCount = useMemo(
    () => Math.min(8, Math.max(3, Math.round((targetSeconds - 7) / 6))),
    [targetSeconds],
  );

  const [style, setStyle] = useState<NarrationStyle>("revelation");
  const [visual, setVisual] = useState<VisualStyle>("papercraft");
  const [engine, setEngine] = useState<VoiceEngine>("elevenlabs");
  const [accountVoices, setAccountVoices] = useState<{ id: string; label: string }[]>([]);
  const [favoriteVoices, setFavoriteVoices] = useState<string[]>([]);

  // ── MASTER MULTILINGUE ─────────────────────────────────────────────────────
  // Une langue SOURCE (celle dans laquelle le script est écrit) et les langues
  // à produire. Les images et les clips sont communs : seule la voix off change.
  const [sourceLang, setSourceLang] = useState<LanguageId>("fr");
  const [targetLangs, setTargetLangs] = useState<LanguageId[]>(["fr"]);
  const language = sourceLang;
  /** Langues produites, dans l'ordre : la source d'abord. */
  const langs = useMemo(() => {
    const rest = MASTER_LANGUAGE_IDS.filter(
      (l) => l !== sourceLang && targetLangs.includes(l as LanguageId),
    ) as LanguageId[];
    return [sourceLang, ...rest];
  }, [sourceLang, targetLangs]);

  const toggleLang = (id: LanguageId) => {
    if (id === sourceLang) return; // la langue source n'est jamais décochable
    setTargetLangs((prev) =>
      prev.includes(id) ? prev.filter((l) => l !== id) : [...prev, id],
    );
  };

  /** Un narrateur ElevenLabs par langue, mémorisé entre les sessions. */
  const [voiceByLang, setVoiceByLang] = useState<Record<string, string>>({});
  const [voiceLangTab, setVoiceLangTab] = useState<LanguageId>("fr");
  useEffect(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem("studio-voice-by-lang") ?? "{}",
      ) as Record<string, string>;
      if (saved && typeof saved === "object") setVoiceByLang(saved);
    } catch {
      setVoiceByLang({});
    }
  }, []);
  const voiceForLang = useCallback(
    (l: string) => voiceByLang[l] ?? defaultVoice(engine),
    [voiceByLang, engine],
  );
  const voice = voiceForLang(voiceLangTab);
  const setVoice = useCallback(
    (id: string) =>
      setVoiceByLang((prev) => {
        const next = { ...prev, [voiceLangTab]: id };
        try {
          localStorage.setItem("studio-voice-by-lang", JSON.stringify(next));
        } catch {
          /* quota plein : le choix reste valable pour la session */
        }
        return next;
      }),
    [voiceLangTab],
  );
  useEffect(() => setVoiceLangTab(sourceLang), [sourceLang]);
  // Si la langue de l'onglet actif est décochée, on revient sur la langue source.
  useEffect(() => {
    if (!langs.includes(voiceLangTab)) setVoiceLangTab(sourceLang);
  }, [langs, voiceLangTab, sourceLang]);

  /** Langues cochées sans narrateur choisi : avertissement non bloquant. */
  const langsWithoutVoice = useMemo(
    () => langs.filter((l) => !voiceByLang[l]),
    [langs, voiceByLang],
  );

  const runListVoices = useServerFn(listVoices);
  useEffect(() => {
    runListVoices({ data: { language: voiceLangTab } })
      .then((r) => setAccountVoices((r as { voices: { id: string; label: string }[] }).voices))
      .catch(() => setAccountVoices([]));
  }, [runListVoices, voiceLangTab]);

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

  /** Script traduit par langue ; la langue source pointe sur le script d'origine. */
  const [scripts, setScripts] = useState<Record<string, Script>>({});
  const scriptsRef = useRef<Record<string, Script>>({});
  useEffect(() => {
    scriptsRef.current = scripts;
  }, [scripts]);
  /** Langue affichée dans la liste des plans (texte + sous-titres d'aperçu). */
  const [viewLang, setViewLang] = useState<LanguageId>("fr");
  useEffect(() => setViewLang(sourceLang), [sourceLang]);
  const scriptFor = useCallback(
    (lang: string, fallback: Script | null = null) =>
      scriptsRef.current[lang] ?? fallback,
    [],
  );

  /** MP4 final par langue. */
  const [finalUrls, setFinalUrls] = useState<Record<string, string>>({});
  const [translating, setTranslating] = useState(false);

  // MODE MANUEL : portes de validation. Rien de payant ne part sans un clic.
  const [topicValidated, setTopicValidated] = useState(false);
  const [scriptValidated, setScriptValidated] = useState(false);
  const [imagesValidated, setImagesValidated] = useState(false);

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


  const saveHistory = useCallback(
    (id: string, next: Script, allScripts?: Record<string, Script>) => {
      const items = readHistory().filter((h) => h.id !== id);
      const previous = readHistory().find((h) => h.id === id);
      const updated = [
        {
          id,
          title: next.title || "Sans titre",
          date: Date.now(),
          script: next,
          scripts: allScripts ?? previous?.scripts ?? {},
        },
        ...items,
      ];
      writeHistory(updated);
      setHistory(updated);
    },
    [],
  );

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
          includeCta: settings.sophiaCta !== false,
          styleBrief: settings.narration[style].brief,
          wordsBias: settings.narration[style].wordsBias,
        },
      })) as Script;
      setScript(result);
      setStates({});
      setScripts({ [sourceLang]: result });
      scriptsRef.current = { [sourceLang]: result };
      setFinalUrls({});
      setScriptValidated(false);
      setImagesValidated(false);
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

  const runTranslate = useServerFn(translateScript);

  /**
   * MASTER : traduit le script source dans chaque autre langue cochée.
   * Les visuels ne sont jamais régénérés — seuls les textes parlés changent.
   */
  const onTranslateAll = async (
    doc: Script | null = script,
  ): Promise<Record<string, Script> | undefined> => {
    if (!doc) return undefined;
    const others = langs.filter((l) => l !== sourceLang);
    const next: Record<string, Script> = { ...scriptsRef.current, [sourceLang]: doc };
    if (!others.length) {
      setScripts(next);
      scriptsRef.current = next;
      return next;
    }
    setTranslating(true);
    try {
      for (const lang of others) {
        if (cancelledRef.current) break; // arrêt demandé avant une traduction
        setCurrentStep(`Traduction — ${languageLabel(lang)}…`);
        setAssembleStep(`Traduction — ${languageLabel(lang)}…`);
        try {
          const res = (await runTranslate({
            data: {
              title: doc.title ?? "",
              hook: doc.hook ?? "",
              cta: doc.cta ?? "",
              scenes: doc.scenes.map((s) => ({
                index: s.index,
                narration: s.narration,
                overlay: s.overlay ?? "",
              })),
              language: lang,
              maxSceneSeconds: 8,
            },
          })) as {
            title: string;
            hook: string;
            cta: string;
            scenes: { index: number; narration: string; overlay: string }[];
          };
          // Les prompts visuels sont repris À L'IDENTIQUE : ils ont déjà servi.
          const byIndex = new Map(res.scenes.map((s) => [s.index, s]));
          next[lang] = {
            ...doc,
            title: res.title || doc.title,
            hook: res.hook || doc.hook,
            cta: res.cta,
            scenes: doc.scenes.map((s) => ({
              ...s,
              narration: byIndex.get(s.index)?.narration ?? s.narration,
              overlay: byIndex.get(s.index)?.overlay ?? s.overlay,
            })),
          };
          toast.success(`Script traduit — ${languageLabel(lang)}`);
        } catch (e) {
          toast.error(
            e instanceof Error ? e.message : `Traduction impossible (${languageLabel(lang)})`,
          );
        }
      }
      setScripts(next);
      scriptsRef.current = next;
      if (projectId) saveHistory(projectId, doc, next);
      return next;
    } finally {
      setTranslating(false);
    }
  };

  /** Met à jour la narration traduite d'un plan (traductions éditables). */
  const updateTranslatedScene = (lang: string, index: number, value: string) => {
    setScripts((prev) => {
      const doc = prev[lang];
      if (!doc) return prev;
      const next = {
        ...prev,
        [lang]: {
          ...doc,
          scenes: doc.scenes.map((s) =>
            s.index === index ? { ...s, narration: value } : s,
          ),
        },
      };
      scriptsRef.current = next;
      return next;
    });
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

  /**
   * Coût estimé du MASTER : les clips animés sont payés UNE SEULE FOIS quel que
   * soit le nombre de langues. Seules les voix off se multiplient par langue.
   */
  const estimateCost = useCallback(
    (doc: Script | null = script) => {
      const scenes = doc?.scenes ?? [];
      const pending = scenes.filter((s) => !states[s.index]?.videoUrl);
      const perClip = Math.min(8, Math.max(4, Math.round(targetSeconds / Math.max(1, scenes.length))));
      const voices = scenes.length * langs.length;
      return {
        clips: pending.length,
        seconds: pending.length * perClip,
        perClip,
        voices,
        languages: langs.length,
      };
    },
    [script, states, targetSeconds, langs],
  );

  /** Confirmation obligatoire avant toute dépense de crédits en série. */
  const confirmCost = (doc: Script | null = script) => {
    const { clips, seconds, perClip, voices, languages } = estimateCost(doc);
    if (!clips) return true;
    return window.confirm(
      `Coût estimé : ${clips} clip${clips > 1 ? "s" : ""} × ${perClip} s payés UNE SEULE FOIS (${seconds} s de vidéo IA) + ${voices} voix off réparties sur ${languages} langue${languages > 1 ? "s" : ""}.\n\nLancer la génération ?`,
    );
  };

  /** Voix off d'UN plan dans UNE langue. Rangée dans states[i].voices[lang]. */
  const onVoice = async (scene: Scene, lang: string = sourceLang) => {
    if (cancelledRef.current) return undefined; // appel payant : arrêt demandé
    const doc = scriptFor(lang, script);
    const text = doc?.scenes.find((s) => s.index === scene.index)?.narration ?? scene.narration;
    patch(scene.index, { audioLoading: true });
    try {
      const { audioDataUrl, words } = (await runVoice({
        data: { text, voice: voiceForLang(lang), engine, language: lang as LanguageId },
      })) as { audioDataUrl: string; words?: WordTiming[] };
      const duration = await audioDuration(audioDataUrl);
      const take: VoiceTake = { audio: audioDataUrl, words: words ?? [], duration };
      setStates((prev) => ({
        ...prev,
        [scene.index]: {
          ...prev[scene.index],
          audioLoading: false,
          voices: { ...(prev[scene.index]?.voices ?? {}), [lang]: take },
        },
      }));
      return take;
    } catch (e) {
      patch(scene.index, { audioLoading: false });
      toast.error(
        e instanceof Error
          ? `${languageLabel(lang)} — ${e.message}`
          : `Échec de la voix off (${languageLabel(lang)})`,
      );
      return undefined;
    }
  };

  /**
   * ÉTAPE d : toutes les voix off, toutes les langues, tous les plans.
   * Peu coûteux, et c'est ce qui donne la durée réelle de chaque plan dans
   * chaque langue — donc la longueur de clip à commander une seule fois.
   */
  const generateAllVoices = async (
    doc: Script,
    snapshot: Record<number, SceneState>,
  ): Promise<Record<number, SceneState>> => {
    const out: Record<number, SceneState> = { ...snapshot };
    for (const lang of langs) {
      for (const scene of doc.scenes) {
        if (cancelledRef.current) return out; // arrêt vérifié avant CHAQUE voix
        if (out[scene.index]?.voices?.[lang]) continue;
        setCurrentStep(`Voix off ${languageLabel(lang)} — plan ${scene.index + 1}…`);
        setAssembleStep(`Voix off ${languageLabel(lang)} — plan ${scene.index + 1}…`);
        const take = await onVoice(scene, lang);
        if (take) {
          out[scene.index] = {
            ...out[scene.index],
            voices: { ...(out[scene.index]?.voices ?? {}), [lang]: take },
          };
        }
      }
    }
    return out;
  };

  /** Longueur de clip à commander : la langue la plus bavarde décide. */
  const clipSecondsFor = (st: SceneState | undefined) => {
    const longest = Math.max(
      0,
      ...langs.map((l) => st?.voices?.[l]?.duration ?? 0),
    );
    return longest || undefined;
  };

  const onGenerateAll = async () => {
    if (!script) return;
    if (!confirmCost(script)) return;
    beginRun();
    setGeneratingAll(true);
    setCurrentStep("Génération des plans…");
    try {
      // a/b — script source déjà écrit, on traduit dans les autres langues.
      await onTranslateAll(script);
      if (cancelledRef.current) return;

      // c — images EN CHAÎNE (chaque plan voit le plan d'ouverture + le précédent).
      let snapshot: Record<number, SceneState> = { ...states };
      for (const scene of script.scenes) {
        if (cancelledRef.current) break;
        setCurrentStep(`Image — plan ${scene.index + 1}…`);
        const existing = snapshot[scene.index]?.image;
        const image = existing ?? (await onImage(scene));
        if (scene.index === 0 && image) referenceImage.current = image;
        if (image) previousImage.current = image;
        if (image) snapshot[scene.index] = { ...snapshot[scene.index], image };
      }
      if (cancelledRef.current) return;

      // d — voix off de TOUTES les langues.
      snapshot = await generateAllVoices(script, snapshot);
      if (cancelledRef.current) return;

      // e/f — un seul clip par plan, dimensionné sur la langue la plus longue.
      const videoJobs: Promise<unknown>[] = [];
      for (const scene of script.scenes) {
        if (cancelledRef.current) break;
        if (snapshot[scene.index]?.videoUrl) continue;
        setCurrentStep(`Animation — plan ${scene.index + 1}…`);
        videoJobs.push(
          onVideo(scene, snapshot[scene.index]?.image, script, clipSecondsFor(snapshot[scene.index])),
        );
      }
      await Promise.all(videoJobs);
      if (cancelledRef.current) toast.warning("Pipeline arrêté");
      else toast.success("Master prêt : plans animés et voix de toutes les langues");
    } finally {
      setGeneratingAll(false);
      setCurrentStep(cancelledRef.current ? "Pipeline arrêté" : "");
    }
  };

  const onPreviewVoice = async () => {
    setPreviewVoice(true);
    try {
      const sampleKey = `${engine}:${voice}:${voiceLangTab}`;
      let src = voiceSamples.current[sampleKey];
      if (!src) {
        const { audioDataUrl } = (await runVoice({
          data: {
            text: VOICE_SAMPLE_TEXT[voiceLangTab] ?? VOICE_SAMPLE_TEXT["fr"]!,
            voice,
            engine,
            language: voiceLangTab,
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

  /**
   * Montage d'UNE langue : les mêmes clips animés, la voix et les sous-titres
   * de cette langue. Aucun visuel n'est régénéré.
   */
  const buildFinalVideo = async (
    snapshot: Record<number, SceneState | undefined>,
    autoDownload: boolean,
    scriptOverride?: Script,
    lang: string = sourceLang,
  ) => {
    const doc = scriptFor(lang, scriptOverride ?? script);

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

    // Un plan sans voix off produirait un blanc silencieux : on refabrique la
    // voix manquante de CETTE langue avant d'assembler.
    for (const item of all) {
      if (voiceOf(item.st, lang)) continue;
      setAssembleStep(`Voix off manquante — ${languageLabel(lang)}, scène ${item.scene.index + 1}…`);
      const res = await onVoice(item.scene, lang);
      if (!res) {
        throw new Error(
          `La voix off de la scène ${item.scene.index + 1} (${languageLabel(lang)}) n'a pas pu être générée : relance l'export.`,
        );
      }
      item.st = { ...item.st, voices: { ...(item.st.voices ?? {}), [lang]: res } };
    }
    const ordered = all;

    // Papier découpé : masque carré à coins arrondis, toujours présent.
    const mask = useSquareMask
      ? await makeRoundedSquareMask(dims.width, dims.height)
      : null;

    setAssembleStep(`Préparation des sous-titres — ${languageLabel(lang)}…`);
    const withDurations = await Promise.all(
      ordered.map(async ({ scene, st }) => {
        const take = voiceOf(st, lang);
        const raw = take ? take.duration || (await audioDuration(take.audio)) : undefined;
        // Silences de tête/queue retirés : la voix démarre tout de suite et le
        // plan s'arrête au dernier mot.
        const win = raw ? voiceWindow(take?.words ?? null, raw) : null;
        const duration = win ? win.end - win.start : raw;
        const words = win ? shiftTimings(take?.words ?? null, win.start) : (take?.words ?? []);
        const narration = scene.narration;
        return {
          ...(st.videoUrl ? { videoUrl: st.videoUrl } : {}),
          ...(st.image ? { imageUrl: st.image } : {}),
          audio: take?.audio,
          ...(win ? { trimStart: win.start, trimEnd: win.end } : {}),
          mask,

          // Les images de sous-titres sont fabriquées juste avant l'encodage du
          // plan (et libérées après) : sinon toutes les scènes tiennent en
          // mémoire en même temps et l'onglet plante pendant l'export.
          cues: duration
            ? () =>
                makeCaptionCues(
                  narration,
                  dims.width,
                  dims.height,
                  duration,
                  words,
                  settings.sophiaLogo
                    ? (() => {
                        const w = sophiaWindow(narration, duration, words);
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
      onProgress: (step) => setAssembleStep(`${languageLabel(lang)} — ${step}`),
    });

    if (projectId && lang === sourceLang) {
      const { saveFinalVideo } = await import("@/lib/project-store");
      await saveFinalVideo(projectId, blob);
    }

    const url = URL.createObjectURL(blob);
    setFinalUrls((prev) => {
      const old = prev[lang];
      if (old) URL.revokeObjectURL(old);
      return { ...prev, [lang]: url };
    });
    if (lang === sourceLang) setFinalUrl(url);
    if (autoDownload) downloadLang(lang, url, doc?.title ?? "video");
    toast.success(`Vidéo ${languageLabel(lang)} assemblée`);
    return url;
  };

  /** Nom de fichier suffixé par la langue : mon-sujet-de.mp4 */
  const downloadLang = (lang: string, url: string, title: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase()}-${lang}.mp4`;
    a.click();
  };

  const onDownloadAll = () => {
    const title = script?.title ?? "video";
    langs.forEach((lang, i) => {
      const url = finalUrls[lang];
      if (!url) return;
      // Les navigateurs bloquent les téléchargements simultanés : on les espace.
      setTimeout(() => downloadLang(lang, url, title), i * 700);
    });
  };

  const onAssemble = async () => {
    if (readyScenes.length === 0) return;
    setAssembling(true);
    setAssembleStep("Préparation…");
    try {
      for (const lang of langs) {
        if (cancelledRef.current) break; // arrêt vérifié entre chaque langue
        await buildFinalVideo(states, false, undefined, lang);
      }
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Échec de l'assemblage");
    } finally {
      setAssembling(false);
    }
  };

  /** MASTER complet : traductions → images → voix de toutes les langues → clips → un MP4 par langue. */
  const onExportEverything = async (scriptOverride?: Script, skipConfirm = false) => {
    const doc = scriptOverride ?? script;
    if (!doc) return;
    if (!skipConfirm && !confirmCost(doc)) return;
    if (!skipConfirm) beginRun();
    setAssembling(true);
    try {
      // b — traductions.
      setCurrentStep("Traductions…");
      await onTranslateAll(doc);
      if (cancelledRef.current) {
        setAssembleStep("Pipeline arrêté");
        return;
      }

      // c — images en chaîne : le plan précédent est la référence du suivant.
      setAssembleStep("Génération des images…");
      setCurrentStep("Images…");
      let snapshot: Record<number, SceneState> = { ...states };
      for (const scene of doc.scenes) {
        if (cancelledRef.current) break;
        const st = snapshot[scene.index] ?? {};
        const image = st.image ?? (await onImage(scene, doc));
        if (scene.index === 0 && image) referenceImage.current = image;
        if (image) previousImage.current = image;
        snapshot[scene.index] = { ...st, ...(image ? { image } : {}) };
      }
      if (cancelledRef.current) {
        setAssembleStep("Pipeline arrêté");
        return;
      }

      // d — voix off de toutes les langues (c'est elles qui donnent les durées).
      snapshot = await generateAllVoices(doc, snapshot);
      if (cancelledRef.current) {
        setAssembleStep("Pipeline arrêté");
        return;
      }

      // e/f — clips animés, une seule fois, calibrés sur la langue la plus longue.
      setCurrentStep("Plans animés…");
      const results = await Promise.all(
        doc.scenes.map(async (scene) => {
          const st = snapshot[scene.index] ?? {};
          // AUCUNE relance payante : un clip raté reste en échec (signalé ici)
          // et l'assemblage retombe sur l'image fixe du plan.
          const videoUrl =
            st.videoUrl ?? (await onVideo(scene, st.image, doc, clipSecondsFor(st)));
          if (!videoUrl && !cancelledRef.current) {
            toast.warning(`Plan ${scene.index + 1} : clip animé en échec → image fixe`);
          }
          return [scene.index, { ...st, ...(videoUrl ? { videoUrl } : {}) }] as const;
        }),
      );
      if (cancelledRef.current) {
        setAssembleStep("Pipeline arrêté");
        return;
      }
      for (const [i, st] of results) snapshot[i] = st as SceneState;

      // g — montage : une vidéo par langue, avec les MÊMES clips.
      for (const lang of langs) {
        if (cancelledRef.current) break; // arrêt vérifié entre chaque langue
        setCurrentStep(`Montage — ${languageLabel(lang)}…`);
        await buildFinalVideo(snapshot, true, doc, lang);
      }
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
      `Coût estimé : ${sceneCount} clips × ${perClip} s payés UNE SEULE FOIS (${sceneCount * perClip} s de vidéo IA) + ${sceneCount * langs.length} voix off pour ${langs.length} langue${langs.length > 1 ? "s" : ""}.\n\nLancer la génération complète ?`,
    );
    if (!ok) return;
    beginRun();
    // Mode automatique : mêmes étapes, sans les portes de validation.
    setTopicValidated(true);
    setScriptValidated(true);
    setImagesValidated(true);
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
        const res = await runSearchVoices({ data: { query: q, language: voiceLangTab } });
        if (!cancelled) setRemoteVoices(res.voices);
      } catch {
        /* recherche best-effort */
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [voiceQuery, engine, runSearchVoices, voiceLangTab]);

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
      // On exporte le plan dans la langue actuellement affichée.
      const take = voiceOf(st, viewLang);
      const narration =
        scriptFor(viewLang, script)?.scenes.find((s) => s.index === scene.index)?.narration ??
        scene.narration;
      const rawDuration = take ? take.duration || (await audioDuration(take.audio)) : undefined;
      const win = rawDuration ? voiceWindow(take?.words ?? null, rawDuration) : null;
      const duration = win ? win.end - win.start : rawDuration;
      const sceneWords = win ? shiftTimings(take?.words ?? null, win.start) : (take?.words ?? []);
      const logoWin =
        settings.sophiaLogo && duration ? sophiaWindow(narration, duration, sceneWords) : null;
      const cues = duration
        ? await makeCaptionCues(
            narration,
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
            audio: take?.audio,
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
    <div className="min-h-screen">
      <Toaster position="top-center" />

      {/* BARRE SUPÉRIEURE — état du pipeline, coût, arrêt d'urgence et navigation. */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
          <span className="text-[15px] font-semibold tracking-tight">Studio vidéo</span>

          <span className="text-xs text-muted-foreground">
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
            <span className="text-xs text-muted-foreground">
              Plans {doneScenes}/{totalScenes}
            </span>
          )}
          <span className="hidden text-xs text-muted-foreground md:inline">
            Coût estimé : {cost.clips} clip{cost.clips > 1 ? "s" : ""} × {cost.perClip} s payés une
            seule fois + {cost.voices} voix off ({cost.languages} langue
            {cost.languages > 1 ? "s" : ""})
          </span>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {!pipelinePaused && !(busy && stopped) && (
              <button onClick={onStopAll} className="btn-base btn-danger px-2.5 py-1.5 text-xs">
                <Square className="h-3 w-3" /> Stop
              </button>
            )}
            {pipelinePaused && (
              <button
                onClick={onResumePipeline}
                className="btn-base btn-ghost px-2.5 py-1.5 text-xs"
              >
                <Play className="h-3 w-3" /> Reprendre
              </button>
            )}
            <button
              onClick={() => setShowHistory((v) => !v)}
              className="btn-base btn-ghost px-2.5 py-1.5 text-xs"
            >
              <History className="h-3.5 w-3.5" /> Historique ({history.length})
            </button>
            <Link to="/parametres" className="btn-base btn-ghost px-2.5 py-1.5 text-xs">
              <Settings className="h-3.5 w-3.5" /> Paramètres
            </Link>
          </div>
        </div>
        <div className="mx-auto w-full max-w-6xl px-4 pb-2 md:hidden">
          <span className="text-xs text-muted-foreground">
            Coût estimé : {cost.clips} clip{cost.clips > 1 ? "s" : ""} × {cost.perClip} s + {cost.voices}{" "}
            voix off
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-6">
        {showHistory && (
          <div className="surface-card mb-6 space-y-2 p-4">
            {history.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Aucune vidéo enregistrée pour l'instant.
              </p>
            )}
            {history.map((h) => (
              <div key={h.id} className="flex items-center justify-between gap-3">
                <button
                  onClick={async () => {
                    setScript(h.script);
                    setProjectId(h.id);
                    setFinalUrl(null);
                    setFinalUrls({});
                    const saved = { ...(h.scripts ?? {}), [sourceLang]: h.script };
                    setScripts(saved);
                    scriptsRef.current = saved;
                    setShowHistory(false);
                    const { loadProjectMedia } = await import("@/lib/project-store");
                    const media = await loadProjectMedia(h.id);
                    setStates(migrateStates(media as Record<number, SceneState>, sourceLang));
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

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          {/* COLONNE GAUCHE — configuration du sujet et du ton. */}
          <section className="surface-card flex flex-col p-4">
            <label htmlFor="topic" className="label-x">
              Sujet de la vidéo
            </label>
            <textarea
              id="topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              rows={3}
              placeholder="Ex : pourquoi les octopodes ont trois cœurs"
              className="field mt-2 resize-none"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <select
                value={topicCategory}
                onChange={(e) => setTopicCategory(e.target.value as TopicCategory)}
                className="field w-auto max-w-full text-xs"
                aria-label="Catégorie de sujet"
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
                className="btn-base btn-ghost text-xs"
              >
                {suggesting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                Proposer un sujet
              </button>
              {angle && <span className="text-xs text-muted-foreground">{angle}</span>}
            </div>

            <p className="label-x mt-5">Style de narration</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {STYLES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setStyle(s.id)}
                  className={`rounded-[10px] border px-3 py-2 text-left text-sm transition-colors ${
                    style === s.id
                      ? "border-primary/60 bg-primary/15 text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span className="block font-medium">{s.label}</span>
                  <span className="block text-xs opacity-70">{s.hint}</span>
                </button>
              ))}
            </div>

            <p className="label-x mt-5">Direction artistique</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {VISUALS.map((v) => (
                <button
                  key={v.id}
                  onClick={() => setVisual(v.id)}
                  className={`chip ${visual === v.id ? "chip-active" : ""}`}
                >
                  {v.label}
                </button>
              ))}
            </div>

            {/* BARRE D'ACTIONS — une seule action pleine : la génération complète. */}
            <div className="mt-auto space-y-2 pt-5">
              <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
                <button
                  onClick={onAutoAll}
                  disabled={autoRunning || loadingScript || assembling}
                  className="btn-base btn-primary"
                >
                  {autoRunning ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  Générer toute la vidéo et exporter
                </button>

                {/* MODE MANUEL — porte 1 : le sujet. Rien de payant avant ce clic. */}
                <button
                  onClick={() => {
                    if (!topic.trim()) {
                      toast.error("Écris d'abord le sujet de la vidéo");
                      return;
                    }
                    setTopicValidated(true);
                    toast.success("Sujet validé — tu peux générer le script");
                  }}
                  disabled={topicValidated}
                  className="btn-base btn-ghost"
                >
                  {topicValidated ? "Sujet validé" : "Valider le sujet"}
                </button>

                <button
                  onClick={() => void onScript()}
                  disabled={loadingScript || !topicValidated}
                  className="btn-base btn-ghost"
                >
                  {loadingScript ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Wand2 className="h-4 w-4" />
                  )}
                  Générer le script
                </button>
              </div>
              {autoRunning && assembleStep && (
                <p className="text-xs text-muted-foreground">{assembleStep}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Étape suivante :{" "}
                {!topicValidated
                  ? "valider le sujet"
                  : !script
                    ? "écrire le script (gratuit)"
                    : !scriptValidated
                      ? "valider le script pour lancer les traductions"
                      : !imagesValidated
                        ? "générer puis valider les images"
                        : "animer les plans (payant)"}
              </p>
            </div>
          </section>

          {/* COLONNE DROITE — sortie : langues, durée, format, voix, musique. */}
          <section className="surface-card flex flex-col gap-4 p-4">
            <div>
              <label htmlFor="video-language" className="label-x">
                Langue d'écriture
              </label>
              <select
                id="video-language"
                value={sourceLang}
                onChange={(e) => {
                  const next = e.target.value as LanguageId;
                  setSourceLang(next);
                  setTargetLangs((prev) => (prev.includes(next) ? prev : [...prev, next]));
                }}
                className="field mt-2"
              >
                {LANGUAGES.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Le script est écrit dans cette langue, puis traduit dans les autres.
              </p>

              <p className="label-x mt-4">Langues à produire</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {MASTER_LANGUAGES.map((l) => {
                  const active = l.id === sourceLang || targetLangs.includes(l.id as LanguageId);
                  return (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => toggleLang(l.id as LanguageId)}
                      disabled={l.id === sourceLang}
                      className={`chip ${active ? "chip-active" : ""} ${
                        l.id === sourceLang ? "opacity-70" : ""
                      }`}
                    >
                      {l.label}
                      {l.id === sourceLang ? " · source" : ""}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Images et plans animés sont payés une seule fois : seules les voix off se
                multiplient.
              </p>
            </div>

            <div>
              <label htmlFor="duration" className="label-x">
                Durée de la vidéo : {targetSeconds}s
              </label>
              <input
                id="duration"
                type="range"
                min={15}
                max={75}
                step={5}
                value={targetSeconds}
                onChange={(e) => setTargetSeconds(Number(e.target.value))}
                className="mt-2 w-full"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {sceneCount} plans{settings.sophiaCta !== false ? " + CTA" : ""} · zone efficace
                entre 40 et 70 secondes
              </p>
            </div>

            <div>
              <p className="label-x">Format</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {(["vertical", "square", "horizontal"] as const).map((o) => (
                  <button
                    key={o}
                    onClick={() => setOrientation(o)}
                    className={`chip ${orientation === o ? "chip-active" : ""}`}
                  >
                    {o === "vertical" ? "9:16" : o === "square" ? "1:1 dans 9:16" : "16:9"}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="narrator-voice" className="label-x">
                Voix off
              </label>
              <div className="mt-2 flex flex-wrap gap-2">
                {(["lovable", "elevenlabs"] as const).map((e) => (
                  <button
                    key={e}
                    onClick={() => {
                      setEngine(e);
                      setVoice(defaultVoice(e));
                    }}
                    className={`chip flex-1 justify-center ${engine === e ? "chip-active" : ""}`}
                  >
                    {e === "lovable" ? "Standard" : "Premium (ElevenLabs)"}
                  </button>
                ))}
              </div>

              {/* Un onglet par langue produite : chaque langue a son narrateur. */}
              <div className="mt-2 flex flex-wrap gap-2">
                {langs.map((l) => {
                  const chosen = voiceByLang[l];
                  const label =
                    (chosen &&
                      (availableVoices.find((v) => v.id === chosen)?.label ??
                        accountVoices.find((v) => v.id === chosen)?.label ??
                        "narrateur choisi")) ||
                    "à choisir";
                  return (
                    <button
                      key={l}
                      type="button"
                      onClick={() => setVoiceLangTab(l)}
                      aria-pressed={voiceLangTab === l}
                      className={`chip flex-col items-start gap-0 py-1.5 text-left ${
                        voiceLangTab === l ? "chip-active" : ""
                      }`}
                    >
                      <span className="text-xs font-medium">{languageLabel(l)}</span>
                      <span className="max-w-[11rem] truncate text-[10px] text-muted-foreground">
                        {label}
                      </span>
                    </button>
                  );
                })}
              </div>
              <input
                type="search"
                value={voiceQuery}
                onChange={(e) => setVoiceQuery(e.target.value)}
                placeholder="Chercher un narrateur (Nicolas, Guillaume, Adam…)"
                aria-label="Chercher un narrateur par son nom"
                className="field mt-2"
              />
              <div className="mt-2 flex gap-2">
                <select
                  id="narrator-voice"
                  value={voice}
                  onChange={(e) => setVoice(e.target.value)}
                  className="field min-w-0 flex-1"
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
                  aria-label={
                    favoriteVoices.includes(voice)
                      ? "Retirer ce narrateur des favoris"
                      : "Ajouter ce narrateur aux favoris"
                  }
                  title={
                    favoriteVoices.includes(voice) ? "Retirer des favoris" : "Ajouter aux favoris"
                  }
                  className={`grid size-9 shrink-0 place-items-center rounded-[10px] border transition-colors ${
                    favoriteVoices.includes(voice)
                      ? "border-primary/60 bg-primary/15 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Star
                    className={`h-4 w-4 ${favoriteVoices.includes(voice) ? "fill-current" : ""}`}
                  />
                </button>
              </div>
              <button
                onClick={onPreviewVoice}
                disabled={previewVoice}
                className="btn-base btn-ghost mt-2 text-xs"
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
          </section>
        </div>

        {script && (
          <section className="mt-6 space-y-4">
            <div className="surface-card p-4">
              <h2 className="text-lg font-semibold">{script.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{script.hook}</p>

              <div className="mt-4 rounded-[10px] border border-border p-3">
                <span className="label-x">Outro Sophia (fixe sur toutes les vidéos)</span>
                <p className="mt-1.5 text-sm">{script.cta}</p>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {(script.hashtags ?? []).map((h) => (
                  <span
                    key={h}
                    className="rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground"
                  >
                    {h.startsWith("#") ? h : `#${h}`}
                  </span>
                ))}
              </div>

              {/* MODE MANUEL — portes 2 et 3 : script (puis traductions) et images. */}
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
                <button
                  onClick={async () => {
                    setScriptValidated(true);
                    await onTranslateAll(script);
                  }}
                  disabled={translating}
                  className="btn-base btn-ghost"
                >
                  {translating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  {scriptValidated ? "Retraduire le script" : "Valider le script (traduire)"}
                </button>
                <button
                  onClick={() => {
                    setImagesValidated(true);
                    toast.success("Images validées — l'animation est débloquée");
                  }}
                  disabled={imagesValidated || !script.scenes.some((s) => states[s.index]?.image)}
                  className="btn-base btn-ghost"
                >
                  {imagesValidated ? "Images validées" : "Valider les images"}
                </button>
                <span className="text-xs text-muted-foreground">
                  L'animation, seule étape vraiment coûteuse, ne part qu'après validation des
                  images.
                </span>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  onClick={onGenerateAll}
                  disabled={generatingAll || !imagesValidated}
                  className="btn-base btn-ghost"
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
                  className="btn-base btn-primary"
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
                  className="btn-base btn-ghost"
                >
                  {assembling ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Film className="h-3.5 w-3.5" />
                  )}
                  Assembler la vidéo entière
                </button>
                {Object.keys(finalUrls).length > 1 && (
                  <button onClick={onDownloadAll} className="btn-base btn-ghost">
                    <Download className="h-3.5 w-3.5" /> Tout télécharger
                  </button>
                )}
                <span className="text-xs text-muted-foreground">
                  {assembling
                    ? assembleStep
                    : `${readyScenes.length}/${script.scenes.length} scènes animées`}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    const allOpen = script.scenes.every((s) => editing[s.index]);
                    setEditing(
                      allOpen
                        ? {}
                        : Object.fromEntries(script.scenes.map((s) => [s.index, true])),
                    );
                  }}
                  className="btn-base btn-ghost text-xs"
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
                  className="btn-base btn-ghost text-xs"
                >
                  Copier la voix off complète
                </button>
              </div>
            </div>

            {/* Une vidéo par langue : mêmes clips, voix et sous-titres différents. */}
            {(Object.keys(finalUrls).length > 0 || finalUrl) && (
              <div className="surface-card p-4">
                <p className="label-x">Exports</p>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {langs
                    .filter((l) => finalUrls[l])
                    .map((l) => (
                      <div key={l} className="rounded-[10px] border border-border p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-muted-foreground">
                            {languageLabel(l)} · {l}
                          </span>
                          <a
                            href={finalUrls[l]}
                            download={`${(script.title || "video").replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase()}-${l}.mp4`}
                            className="btn-base btn-ghost px-2.5 py-1.5 text-xs"
                          >
                            <Download className="h-3.5 w-3.5" /> MP4
                          </a>
                        </div>
                        <video
                          src={finalUrls[l]}
                          controls
                          playsInline
                          className="mt-3 max-h-[60vh] w-full rounded-[10px] bg-black object-contain"
                        />
                      </div>
                    ))}
                </div>
                {!Object.keys(finalUrls).length && finalUrl && (
                  <video
                    src={finalUrl}
                    controls
                    playsInline
                    className="mt-3 max-h-[70vh] w-full rounded-[10px] bg-black object-contain"
                  />
                )}
              </div>
            )}

            {langs.length > 1 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">Langue affichée</span>
                {langs.map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setViewLang(l)}
                    className={`chip ${viewLang === l ? "chip-active" : ""}`}
                  >
                    {languageLabel(l)}
                  </button>
                ))}
                {translating && (
                  <span className="text-xs text-muted-foreground">Traduction en cours…</span>
                )}
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {(scriptFor(viewLang, script) ?? script).scenes.map((scene) => {
                const st = states[scene.index] ?? {};
                const take = voiceOf(st, viewLang);
                const isSource = viewLang === sourceLang;
                return (
                  <article key={scene.index} className="surface-card group overflow-hidden">
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
                          muted={Boolean(take?.audio)}
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
                          <Clapperboard className="h-8 w-8 opacity-40" />
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
                        words={take?.words}
                        showLogo={settings.sophiaLogo}
                        getMedia={() =>
                          audioRefs.current[scene.index] ?? videoRefs.current[scene.index] ?? null
                        }
                      />

                      {/* Numéro du plan et pastilles d'état, discrets. */}
                      <span className="pointer-events-none absolute left-2 top-2 rounded-md bg-black/65 px-1.5 py-0.5 text-[11px] text-white">
                        {scene.index + 1}
                      </span>
                      <span className="pointer-events-none absolute right-2 top-2 flex items-center gap-1.5 rounded-md bg-black/65 px-1.5 py-1">
                        <span
                          className={`dot ${st.image ? "dot-on" : ""}`}
                          title={st.image ? "Image prête" : "Pas d'image"}
                        />
                        <span
                          className={`dot ${st.videoUrl ? "dot-on" : ""}`}
                          title={st.videoUrl ? "Plan animé" : "Pas encore animé"}
                        />
                        {langs.map((l) => (
                          <span
                            key={l}
                            className={`dot ${voiceOf(st, l)?.audio ? "dot-on" : ""}`}
                            title={`Voix ${l.toUpperCase()}${voiceOf(st, l)?.audio ? " prête" : " manquante"}`}
                          />
                        ))}
                      </span>

                      {(st.imageLoading || st.videoLoading) && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60">
                          <Loader2 className="h-5 w-5 animate-spin text-primary" />
                          <span className="text-xs text-muted-foreground">
                            {st.videoLoading
                              ? `Animation ${st.progress ?? 0}%`
                              : "Création de l'image"}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2 p-3">
                      {editing[scene.index] ? (
                        <div className="space-y-2">
                          <textarea
                            value={scene.narration}
                            onChange={(e) =>
                              isSource
                                ? updateScene(scene.index, "narration", e.target.value)
                                : updateTranslatedScene(viewLang, scene.index, e.target.value)
                            }
                            rows={3}
                            className="field"
                          />
                          <input
                            value={scene.overlay}
                            onChange={(e) => updateScene(scene.index, "overlay", e.target.value)}
                            placeholder="Texte incrusté"
                            className="field text-xs"
                          />
                          <textarea
                            value={scene.imagePrompt}
                            onChange={(e) =>
                              updateScene(scene.index, "imagePrompt", e.target.value)
                            }
                            rows={2}
                            placeholder="Prompt image (anglais)"
                            className="field text-xs"
                          />
                          <textarea
                            value={scene.videoPrompt}
                            onChange={(e) =>
                              updateScene(scene.index, "videoPrompt", e.target.value)
                            }
                            rows={2}
                            placeholder="Prompt animation (anglais)"
                            className="field text-xs"
                          />
                        </div>
                      ) : (
                        <p className="text-sm">{scene.narration}</p>
                      )}

                      <p className="text-xs text-muted-foreground">
                        ≈ {estimateSpeechSeconds(scene.narration, viewLang).toFixed(1)} s de voix
                        {estimateSpeechSeconds(scene.narration, viewLang) > 8 &&
                          " — plus long que le clip, le plan sera légèrement ralenti"}
                      </p>

                      {/* Action principale visible, le reste dans un menu. */}
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => onVideo(scene)}
                          disabled={st.videoLoading || !imagesValidated}
                          className="btn-base btn-ghost px-2.5 py-1.5 text-xs"
                        >
                          <Play className="h-3.5 w-3.5" /> Animer
                        </button>

                        <details className="relative">
                          <summary className="btn-base btn-ghost cursor-pointer list-none px-2.5 py-1.5 text-xs">
                            Actions
                          </summary>
                          <div className="absolute right-0 z-20 mt-2 flex w-56 flex-col gap-1 rounded-[10px] border border-border bg-popover p-2 shadow-lg">
                            <button
                              onClick={() => onImage(scene)}
                              disabled={st.imageLoading}
                              className="btn-base btn-ghost justify-start px-2.5 py-1.5 text-xs"
                            >
                              <ImageIcon className="h-3.5 w-3.5" />
                              {st.image ? "Regénérer cette image" : "Image"}
                            </button>
                            <button
                              onClick={() =>
                                setEditing((prev) => ({
                                  ...prev,
                                  [scene.index]: !prev[scene.index],
                                }))
                              }
                              className="btn-base btn-ghost justify-start px-2.5 py-1.5 text-xs"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              {editing[scene.index] ? "Terminé" : "Modifier"}
                            </button>
                            <button
                              onClick={() => onVoice(scene, viewLang)}
                              disabled={st.audioLoading}
                              className="btn-base btn-ghost justify-start px-2.5 py-1.5 text-xs"
                            >
                              {st.audioLoading ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Mic className="h-3.5 w-3.5" />
                              )}
                              Voix off
                            </button>
                            {take?.audio && (
                              <a
                                href={take.audio}
                                download={`scene-${scene.index + 1}-${viewLang}.mp3`}
                                className="btn-base btn-ghost justify-start px-2.5 py-1.5 text-xs"
                              >
                                <Download className="h-3.5 w-3.5" /> MP3
                              </a>
                            )}
                            {st.videoUrl && (
                              <>
                                <a
                                  href={st.videoUrl}
                                  download={`scene-${scene.index + 1}-brut.mp4`}
                                  className="btn-base btn-ghost justify-start px-2.5 py-1.5 text-xs"
                                >
                                  <Download className="h-3.5 w-3.5" /> MP4 brut
                                </a>
                                <button
                                  onClick={() => onExportScene(scene)}
                                  disabled={exporting === scene.index}
                                  className="btn-base btn-ghost justify-start px-2.5 py-1.5 text-xs"
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
                        </details>
                      </div>

                      {take?.audio && (
                        <audio
                          key={viewLang}
                          ref={(el) => {
                            audioRefs.current[scene.index] = el;
                          }}
                          src={take.audio}
                          controls
                          className="w-full"
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
    </div>
  );
}
