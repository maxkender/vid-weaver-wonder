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
  ListChecks,
  Settings,
  Pencil,
  Star,
  Trash2,
  Square,
} from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { KaraokeCaption } from "@/components/karaoke-caption";
import { MusicLibrary } from "@/components/music-library";
import {
  audioDuration,
  durationRange,
  MAX_VOICE_SPEED,
} from "@/lib/duration";
import {
  addTokens,
  emptyUsage,
  formatEuros,
  hasUsage,
  moneyTotal,
  totalVoiceChars,
  type TokenUsage,
  type UsageReport,
} from "@/lib/usage";
import {
  SQUARE_CENTER_OFFSET_RATIO,
  SQUARE_MARGIN_RATIO,
  SQUARE_RADIUS_RATIO,
  voiceWindow,
} from "@/lib/karaoke-overlay";
import { calibrationMode, charWindow, narrationChars } from "@/lib/calibration";
import {
  charsPerSecond,
  MAX_CONDENSE_PASSES,
  MIN_VOICE_SPEED,
  normalizeSeconds,
  predictSeconds,
  rateKey,
  type VoiceRate,
} from "@/lib/voice-rate";
import { listVoiceRates, recordVoiceRate } from "@/lib/voice-rate.functions";
import {
  
  defaultVoiceFor,
  isValidElevenVoiceId,
  voicesFor,
  type VoiceEngine,
} from "@/lib/voices";
import {
  defaultSettings,
  loadSettings,
  SHOT_TYPES,
  type ShotTypeId,
  type StudioSettings,
} from "@/lib/style-presets";
import { alternativeShot, assignShotTypes, shotPrompt } from "@/lib/shot-rotation";
import { fingerprintSimilarity, imageFingerprint, TOO_SIMILAR } from "@/lib/image-similarity";
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
  verifyTopicFacts,
  type FactCheck,
} from "@/lib/studio.functions";
import { TOPIC_CATEGORIES, type TopicCategory } from "@/lib/topic-categories";
import {
  markTopicUsed,
  nextValidatedTopic,
  setTopicStatus,
  type QueuedTopic,
} from "@/lib/topics.functions";
import { createExportUpload, getExportDownloadUrl } from "@/lib/exports.functions";
import { pipelineState, resumePipeline, stopPipeline } from "@/lib/jobs/control.functions";




/**
 * Récapitulatif du coût RÉEL d'une vidéo. Les quantités sont toujours
 * affichées ; un montant n'apparaît que si l'utilisateur a renseigné ses
 * tarifs dans Paramètres — aucun prix n'est inventé.
 */
function UsageRecap({
  usage,
  priceVideoSecond,
  priceImage,
  compact,
}: {
  usage: UsageReport;
  priceVideoSecond: number | null;
  priceImage: number | null;
  compact?: boolean;
}) {
  const chars = totalVoiceChars(usage);
  const money = moneyTotal(usage, { perVideoSecond: priceVideoSecond, perImage: priceImage });
  const calls =
    usage.textCalls.script + usage.textCalls.factCheck + usage.textCalls.translation;
  if (compact) {
    return (
      <span className="text-[11px] text-muted-foreground">
        {usage.clips.count} clips / {usage.clips.seconds} s · {usage.images} images ·{" "}
        {chars.toLocaleString("fr-FR")} car.
        {money !== null ? ` · ${formatEuros(money)}` : ""}
      </span>
    );
  }
  return (
    <div className="surface-card space-y-2 p-3 text-xs">
      <div className="text-sm font-medium">Coût réel de cette vidéo</div>
      <div className="grid gap-1 text-muted-foreground sm:grid-cols-2">
        <span>
          Clips animés : {usage.clips.count} ({usage.clips.seconds} s commandées)
        </span>
        <span>Images générées : {usage.images}</span>
        <span>
          Voix off : {chars.toLocaleString("fr-FR")} caractères (1 crédit ElevenLabs par
          caractère)
        </span>
        <span>
          Appels de texte : {calls} (script {usage.textCalls.script}, vérification{" "}
          {usage.textCalls.factCheck}, traductions {usage.textCalls.translation})
        </span>
      </div>
      {Object.keys(usage.voiceChars).length > 0 && (
        <div className="flex flex-wrap gap-2 text-muted-foreground">
          {Object.entries(usage.voiceChars).map(([l, n]) => (
            <span key={l}>
              {l.toUpperCase()} {n.toLocaleString("fr-FR")} car.
            </span>
          ))}
        </div>
      )}
      {usage.tokens && (
        <div className="text-muted-foreground">
          Jetons IA relevés : {usage.tokens.totalTokens?.toLocaleString("fr-FR") ?? "—"}
        </div>
      )}
      <div className={money !== null ? "font-medium text-foreground" : "text-muted-foreground"}>
        {money !== null
          ? `Total vidéo + images : ${formatEuros(money)} (hors crédits voix)`
          : "Renseigne tes tarifs dans Paramètres pour voir un montant en euros."}
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/_admin/")({
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

/** Drapeau préfixant les libellés de voix natives renvoyés par le serveur. */
const LANGUAGE_FLAGS: Record<string, string> = {
  fr: "🇫🇷",
  en: "🇬🇧",
  es: "🇪🇸",
  de: "🇩🇪",
  it: "🇮🇹",
  pt: "🇵🇹",
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
  /** Les trois accroches candidates, leur note et la raison du choix. */
  hookOptions?: string[];
  hookScores?: string[];
  hookChoice?: string;
  /** Relecture finale : plan le plus faible, pourquoi, et ce qu'on apprend. */
  audit?: { weakest: number; reason: string; learned: string };
  scenes: Scene[];
  cta: string;
  hashtags: string[];
  characters?: { name: string; description: string }[];
  palette?: string;
};

type WordTiming = { word: string; start: number; end: number };

/** Voix off d'UNE langue pour un plan : audio + alignement mot à mot + durée. */
type VoiceTake = {
  audio: string;
  words: WordTiming[];
  /** Durée BRUTE du fichier audio (silences compris) : base du montage. */
  duration: number;
  /** Durée RÉELLEMENT parlée, silences de tête et de queue retirés. */
  speaking?: number;
};

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

/** Vidéo exportée et sauvegardée en ligne (bucket privé du projet). */
type ExportInfo = {
  /** Chemin dans le stockage : permet de re-signer un lien expiré. */
  path: string;
  /** Lien de téléchargement signé (7 jours). */
  url: string;
  expiresAt: number;
  size: number;
  duration: number;
};

type HistoryItem = {
  id: string;
  title: string;
  date: number;
  script: Script;
  /** Script traduit par langue (la langue source pointe sur le script d'origine). */
  scripts?: Record<string, Script>;
  /** Vidéos exportées, par langue : survivent au rechargement et au changement de machine. */
  exports?: Record<string, ExportInfo>;
  /** Langue d'écriture du projet. */
  sourceLang?: string;
  /** Langues de production cochées au moment de la sauvegarde. */
  langs?: string[];
  /** Narrateur retenu par langue. */
  voices?: Record<string, string>;
  /** Coût réellement consommé par cette vidéo. */
  usage?: UsageReport;
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

/** Poids d'un fichier en unités lisibles. */
function formatSize(bytes: number) {
  if (!bytes) return "—";
  const mo = bytes / (1024 * 1024);
  return mo >= 1 ? `${mo.toFixed(1)} Mo` : `${Math.round(bytes / 1024)} Ko`;
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
  /** Sujet pris dans la file validée : marqué « utilisé » au lancement de la vidéo. */
  const [queuedTopicId, setQueuedTopicId] = useState<string | null>(null);
  const [takingTopic, setTakingTopic] = useState(false);

  /** Vérification des faits : tourne avant l'écriture, ne coûte que du texte. */
  const [factCheck, setFactCheck] = useState<FactCheck | null>(null);
  const [checkingFacts, setCheckingFacts] = useState(false);
  const factCheckRef = useRef<{ topic: string; data: FactCheck } | null>(null);
  const runVerifyFacts = useServerFn(verifyTopicFacts);
  const runSetTopicStatus = useServerFn(setTopicStatus);

  const pastTopics = useRef<string[]>([]);
  const runSuggest = useServerFn(suggestTopic);
  const runNextTopic = useServerFn(nextValidatedTopic);
  const runMarkUsed = useServerFn(markTopicUsed);
  const kind: Kind = "faits";

  // On choisit la DURÉE de la vidéo ; le nombre de plans en découle.
  const [targetSeconds, setTargetSeconds] = useState(60);

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
    (l: string) => voiceByLang[l] ?? defaultVoiceFor(engine, l),
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

  /**
   * DÉBIT RÉEL DES VOIX, mémorisé en base (donc partagé avec le service de
   * nuit). Une voix espagnole et une voix allemande ne lisent pas le même
   * nombre de caractères par seconde : c'est la mesure, pas l'estimation par
   * les mots, qui décide du budget de texte de chaque langue.
   */
  const [voiceRates, setVoiceRates] = useState<Record<string, VoiceRate>>({});
  const runListRates = useServerFn(listVoiceRates);
  const runRecordRate = useServerFn(recordVoiceRate);
  useEffect(() => {
    runListRates({})
      .then((r) => setVoiceRates(((r as { rates?: Record<string, VoiceRate> }).rates) ?? {}))
      .catch(() => undefined);
  }, [runListRates]);
  const voiceRatesRef = useRef<Record<string, VoiceRate>>({});
  useEffect(() => {
    voiceRatesRef.current = voiceRates;
  }, [voiceRates]);
  /** Caractères par seconde (à la vitesse 1,0) de la voix de cette langue. */
  const cpsFor = useCallback(
    (l: string) => {
      const k = rateKey(voiceForLang(l), l);
      // La référence est mise à jour dès la prise de calibration, sans attendre
      // le prochain rendu React.
      return charsPerSecond(l, voiceRates[k] ?? voiceRatesRef.current[k]);
    },
    [voiceRates, voiceForLang],
  );

  /**
   * Langues cochées sans aucun narrateur utilisable : ni choix de l'utilisateur,
   * ni voix par défaut pour cette langue. Avertissement non bloquant.
   */
  const langsWithoutVoice = useMemo(
    () => langs.filter((l) => !voiceByLang[l] && !defaultVoiceFor(engine, l)),
    [langs, voiceByLang, engine],
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

  // Un plan = 7 secondes de voix off en moyenne. Le CTA (≈ 6 s) est une scène
  // ajoutée à part : on ne la compte pas dans les plans du récit.
  const sceneCount = useMemo(() => {
    const cta = settings.sophiaCta !== false ? 6 : 0;
    return Math.min(8, Math.max(3, Math.round((targetSeconds - cta) / 7)));
  }, [targetSeconds, settings.sophiaCta]);

  const [orientation, setOrientation] = useState<"vertical" | "square" | "horizontal">("square");
  const [script, setScript] = useState<Script | null>(null);
  /** Miroir du script source, toujours à jour pour les mises à jour successives. */
  const scriptRef = useRef<Script | null>(null);
  useEffect(() => {
    scriptRef.current = script;
  }, [script]);

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

  /**
   * RATTRAPAGE DE DURÉE PAR LA VITESSE DE VOIX.
   * Quand une langue dépasse encore la cible APRÈS la condensation du texte,
   * on accélère la voix off de CETTE langue uniquement, plafonnée à 1,15 :
   * au-delà la diction se dégrade. La vitesse est appliquée à la SYNTHÈSE, donc
   * les repères mot à mot renvoyés par ElevenLabs restent justes — on ne
   * recalcule jamais les sous-titres et on ne touche pas à atempo au montage.
   */
  const baseVoiceSpeed = settings.voiceSpeed ?? 1.05;

  /** Caractères parlés d'une version (c'est ce qu'ElevenLabs lit et facture). */
  const scriptChars = useCallback(
    (s: Script | null | undefined) =>
      (s?.scenes ?? []).reduce((n, sc) => n + (sc.narration ?? "").trim().length, 0),
    [],
  );
  const scriptOf = useCallback(
    (l: string) => scripts[l] ?? (l === sourceLang ? script : null),
    [scripts, script, sourceLang],
  );

  /** Vitesse de synthèse à retenir pour rattraper un dépassement résiduel. */
  const plannedSpeed = useCallback(
    (predicted: number, hi: number) => {
      const needed = predicted > hi ? (baseVoiceSpeed * predicted) / hi : baseVoiceSpeed;
      return Math.max(
        MIN_VOICE_SPEED,
        Math.min(MAX_VOICE_SPEED, Math.round(needed * 100) / 100),
      );
    },
    [baseVoiceSpeed],
  );

  const speedByLang = useMemo(() => {
    const hi = durationRange(targetSeconds).hi;
    const out: Record<string, number> = {};
    for (const l of langs) {
      const s = scriptOf(l);
      if (!s) continue;
      // Durée PRÉDITE à partir du débit réellement mesuré de cette voix.
      const est = predictSeconds(scriptChars(s), cpsFor(l), baseVoiceSpeed);
      out[l] = plannedSpeed(est, hi);
    }
    return out;
  }, [langs, scriptOf, targetSeconds, baseVoiceSpeed, cpsFor, scriptChars, plannedSpeed]);

  const speedFor = useCallback(
    (lang: string) => speedByLang[lang] ?? baseVoiceSpeed,
    [speedByLang, baseVoiceSpeed],
  );

  /**
   * Durée par langue : durée RÉELLEMENT PARLÉE dès que la voix existe (silences
   * de tête et de queue retirés), sinon durée prédite à partir du débit mesuré
   * de cette voix et de la vitesse retenue pour cette langue.
   */
  const langDurations = useMemo(() => {
    return langs
      .map((l) => {
        const s = scriptOf(l);
        if (!s) return null;
        const speed = speedByLang[l] ?? baseVoiceSpeed;
        const cps = cpsFor(l);
        let measured = false;
        const total = (s.scenes ?? []).reduce((sum, sc) => {
          const take = states[sc.index]?.voices?.[l];
          const real = take?.speaking ?? take?.duration ?? 0;
          if (real > 0) {
            measured = true;
            return sum + real;
          }
          return sum + predictSeconds((sc.narration ?? "").trim().length, cps, speed);
        }, 0);
        return { lang: l, seconds: total, speed, measured };
      })
      .filter(
        (
          x,
        ): x is { lang: LanguageId; seconds: number; speed: number; measured: boolean } =>
          x !== null,
      );
  }, [langs, scriptOf, states, speedByLang, baseVoiceSpeed, cpsFor]);

  /**
   * Langues encore hors fenêtre APRÈS condensation et accélération : tant qu'il
   * en reste une, aucune animation ne doit être commandée — les clips sont
   * payés une seule fois pour toutes les langues.
   */
  const durationOverflow = useMemo(() => {
    const hi = durationRange(targetSeconds).hi;
    return langDurations
      .filter((d) => d.seconds > hi + 0.5)
      .map((d) => ({ lang: d.lang, over: Math.round(d.seconds - hi) }));
  }, [langDurations, targetSeconds]);

  const durationBlockMessage = durationOverflow.length
    ? `Durée hors cible : ${durationOverflow
        .map((d) => `${d.lang.toUpperCase()} +${d.over} s`)
        .join(" · ")}. Condense ces versions avant d'animer : les plans animés sont payés une seule fois pour toutes les langues.`
    : "";

  /** MP4 final par langue. */
  const [finalUrls, setFinalUrls] = useState<Record<string, string>>({});
  /** Vidéos sauvegardées en ligne, par langue (liens signés 7 jours). */
  const [exportInfos, setExportInfos] = useState<Record<string, ExportInfo>>({});
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
  /** Zone pour coller un script entier, une ligne par plan. */
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteDraft, setPasteDraft] = useState("");


  /** Fenêtre de confirmation modale remplaçant window.confirm. */
  type LaunchCost = {
    clips: number;
    seconds: number;
    perClip: number;
    voices: number;
    languages: number;
    /** Secondes de vidéo IA économisées si le plan CTA Sophia était décoché. */
    ctaSaving: number;
  };
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmPayload, setConfirmPayload] = useState<LaunchCost | null>(null);
  /** COÛT RÉEL de la vidéo en cours : quantités effectivement commandées. */
  const [usage, setUsage] = useState<UsageReport>(emptyUsage);
  const usageRef = useRef<UsageReport>(usage);
  const bumpUsage = useCallback((fn: (u: UsageReport) => UsageReport) => {
    setUsage((prev) => {
      const next = fn(prev);
      usageRef.current = next;
      return next;
    });
  }, []);
  const confirmResolverRef = useRef<((value: boolean) => void) | null>(null);
  /** Une seule fenêtre de confirmation à la fois (double clic ignoré). */
  const confirmOpenRef = useRef(false);

  const requestCostConfirmation = (payload: LaunchCost): Promise<boolean> => {
    // Un second clic pendant qu'une fenêtre est ouverte n'ouvre rien de plus.
    if (confirmOpenRef.current) return Promise.resolve(false);
    // Filet de sécurité : si un resolver traînait, on le libère avec « non »
    // au lieu de laisser son `await` suspendu à jamais (bouton apparemment mort).
    const stale = confirmResolverRef.current;
    confirmResolverRef.current = null;
    stale?.(false);
    confirmOpenRef.current = true;
    setConfirmPayload(payload);
    setConfirmOpen(true);
    return new Promise((resolve) => {
      confirmResolverRef.current = resolve;
    });
  };

  /** Attente visible : l'utilisateur sait qu'une fenêtre l'attend. */
  const confirmWithStep = async (run: () => Promise<boolean>) => {
    setCurrentStep("En attente de ta confirmation — voir la fenêtre");
    try {
      return await run();
    } finally {
      setCurrentStep("");
    }
  };

  /**
   * MODULES DE MONTAGE PRÉCHARGÉS dès l'ouverture du studio. Sinon, après un
   * redéploiement du site pendant que l'onglet est resté ouvert, l'ancien nom de
   * fichier n'existe plus et le montage échoue alors que les clips sont payés.
   */
  const assemblerRef = useRef<Promise<{
    assemble: typeof import("@/lib/assemble-video");
    music: typeof import("@/lib/music-store");
    karaoke: typeof import("@/lib/karaoke-overlay");
    overlay: typeof import("@/lib/overlay-png");
  }> | null>(null);

  const loadAssembler = useCallback(async () => {
    if (!assemblerRef.current) {
      assemblerRef.current = Promise.all([
        import("@/lib/assemble-video"),
        import("@/lib/music-store"),
        import("@/lib/karaoke-overlay"),
        import("@/lib/overlay-png"),
      ]).then(([assemble, music, karaoke, overlay]) => ({
        assemble,
        music,
        karaoke,
        overlay,
      }));
    }
    try {
      return await assemblerRef.current;
    } catch {
      assemblerRef.current = null;
      throw new Error(
        "Le studio a été mis à jour pendant la session. Recharge la page : tes plans et tes voix sont conservés, rien ne sera repayé.",
      );
    }
  }, []);

  // Préchargement en arrière-plan : le montage n'aura plus besoin du réseau.
  useEffect(() => {
    void loadAssembler().catch(() => undefined);
  }, [loadAssembler]);

  const onConfirmLaunch = () => {
    const resolve = confirmResolverRef.current;
    confirmResolverRef.current = null;
    confirmOpenRef.current = false;
    setConfirmOpen(false);
    resolve?.(true);
  };

  const onCancelLaunch = () => {
    const resolve = confirmResolverRef.current;
    confirmResolverRef.current = null;
    confirmOpenRef.current = false;
    setConfirmOpen(false);
    resolve?.(false);
  };

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
          ...(previous?.exports ? { exports: previous.exports } : {}),
          // Réglages multilingues : sans eux, le rechargement d'un projet
          // retombait sur la seule langue source et relançait les traductions.
          sourceLang,
          langs: [...langs],
          voices: { ...voiceByLang },
        },
        ...items,
      ];
      writeHistory(updated);
      setHistory(updated);
    },
    [sourceLang, langs, voiceByLang],
  );

  /** Le coût consommé suit le projet : il reste lisible dans l'historique. */
  useEffect(() => {
    if (!projectId || !hasUsage(usage)) return;
    const items = readHistory();
    if (!items.some((h) => h.id === projectId)) return;
    const updated = items.map((h) => (h.id === projectId ? { ...h, usage } : h));
    writeHistory(updated);
    setHistory(updated);
  }, [projectId, usage]);

  /** Range le lien d'une vidéo exportée avec le projet (survit au rechargement). */
  const saveExportToHistory = useCallback((id: string, lang: string, info: ExportInfo) => {
    const items = readHistory();
    const updated = items.map((h) =>
      h.id === id ? { ...h, exports: { ...(h.exports ?? {}), [lang]: info } } : h,
    );
    writeHistory(updated);
    setHistory(updated);
  }, []);

  const updateScene = useCallback(
    (index: number, field: keyof Scene, value: string) => {
      const prev = scriptsRef.current[sourceLang] ?? scriptRef.current;
      if (!prev) return;
      const next: Script = {
        ...prev,
        scenes: prev.scenes.map((s) => (s.index === index ? { ...s, [field]: value } : s)),
      };
      // La langue source vit AUSSI dans `scripts` : sans cette mise à jour, la
      // carte du plan continuait d'afficher l'ancienne phrase et les voix off
      // partaient sur le texte d'avant.
      const nextAll = { ...scriptsRef.current, [sourceLang]: next };
      scriptsRef.current = nextAll;
      scriptRef.current = next;
      setScript(next);
      setScripts(nextAll);
      if (projectId) saveHistory(projectId, next, nextAll);
    },
    [projectId, saveHistory, sourceLang],
  );


  /** Remplace tout le script source à partir d'un texte collé, une ligne par plan. */
  const replaceScriptFromText = useCallback(
    (raw: string) => {
      const lines = raw
        .split(/\r?\n+/)
        .map((l) => l.replace(/^\s*\d+[.)\-–]\s*/, "").trim())
        .filter(Boolean);
      if (!script) return 0;
      if (!lines.length) return 0;
      const next: Script = {
        ...script,
        scenes: script.scenes.map((s, i) => ({ ...s, narration: lines[i] ?? s.narration })),
      };
      setScript(next);
      const nextAll = { ...scriptsRef.current, [sourceLang]: next };
      scriptsRef.current = nextAll;
      setScripts(nextAll);
      if (projectId) saveHistory(projectId, next, nextAll);
      return Math.min(lines.length, next.scenes.length);
    },
    [script, projectId, saveHistory, sourceLang],
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
        setFactCheck(null);
        factCheckRef.current = null;
        toast.success("Sujet proposé");
      }

    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de la proposition");
    } finally {
      setSuggesting(false);
    }
  };

  /** Prend le premier sujet VALIDÉ de la file (garde-fou qualité). */
  const onTakeQueuedTopic = async () => {
    setTakingTopic(true);
    try {
      const res = (await runNextTopic()) as { topic: QueuedTopic | null };
      if (!res.topic) {
        toast.error("Aucun sujet validé dans la file — va en valider dans « Sujets »");
        return;
      }
      setTopic(res.topic.topic);
      setAngle(res.topic.angle ?? "");
      setFactCheck(null);
      factCheckRef.current = null;
      setQueuedTopicId(res.topic.id);
      setTopicValidated(true);
      toast.success("Sujet pris dans la file");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lecture de la file impossible");
    } finally {
      setTakingTopic(false);
    }
  };

  /**
   * Vérifie le sujet et ses chiffres AVANT toute écriture. Le résultat est mis
   * en cache tant que le sujet ne change pas : un seul appel par sujet.
   */
  const ensureFactCheck = async (): Promise<FactCheck | null> => {
    const current = topic.trim();
    if (!current) {
      toast.error("Écris d'abord le sujet de la vidéo");
      return null;
    }
    if (factCheckRef.current?.topic === current) return factCheckRef.current.data;
    // Appel payant : on refuse de partir si l'arrêt a été demandé.
    if (cancelledRef.current) {
      toast.warning("Pipeline arrêté");
      return null;
    }
    setCheckingFacts(true);
    setCurrentStep("Vérification des faits…");
    try {
      const res = (await runVerifyFacts({
        data: { topic: current, angle, language },
      })) as FactCheck;
      bumpUsage((u) => ({
        ...u,
        textCalls: { ...u.textCalls, factCheck: u.textCalls.factCheck + 1 },
      }));
      setFactCheck(res);
      const corrected = res.correctedTopic.trim() || current;
      factCheckRef.current = { topic: corrected, data: res };
      if (res.verdict === "revoir") {
        toast.error("Fait central faux ou invérifiable — sujet à revoir");
        if (queuedTopicId) {
          void runSetTopicStatus({ data: { id: queuedTopicId, status: "revoir" } }).catch(
            () => undefined,
          );
          setQueuedTopicId(null);
        }
        return res;
      }
      if (corrected !== current) {
        setTopic(corrected);
        toast.success("Sujet corrigé après vérification");
      } else {
        toast.success("Faits vérifiés");
      }
      return res;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Vérification impossible");
      return null;
    } finally {
      setCheckingFacts(false);
      setCurrentStep("");
    }
  };

  const onScript = async (): Promise<Script | undefined> => {
    // Aucune écriture (ni dépense ensuite) sur des faits non vérifiés.
    const checked = await ensureFactCheck();
    if (!checked || checked.verdict === "revoir") return undefined;
    // Appel payant : arrêt vérifié juste avant l'écriture du script.
    if (cancelledRef.current) {
      toast.warning("Pipeline arrêté");
      return undefined;
    }
    setLoadingScript(true);
    // Le sujet de la file est consommé au moment où la vidéo part réellement.
    if (queuedTopicId) {
      void runMarkUsed({ data: { id: queuedTopicId, videoJobId: projectId ?? "" } })
        .then(() => setQueuedTopicId(null))
        .catch(() => undefined);
    }
    try {
      const result = (await runScript({
        data: {
          topic: checked.correctedTopic || topic,
          facts: checked.facts,
          kind,
          sceneCount,
          style,
          targetSeconds,
          language,
          productionLanguages: langs,
          includeCta: settings.sophiaCta !== false,
          styleBrief: settings.narration[style].brief,
          wordsBias: settings.narration[style].wordsBias,
          // Longueur du script SOURCE calculée sur le débit mesuré de sa voix.
          sourceCharsPerSecond: cpsFor(language),
          voiceSpeed: baseVoiceSpeed,
          // Niveau de langue et règles d'accroche (page Paramètres).
          languageBrief: settings.guides.language,
          hookBrief: settings.guides.hook,
          structureBrief: settings.guides.structure,
          auditBrief: settings.guides.audit,
        },
      })) as Script;
      setScript(result);
      // Nouveau script = nouvelle vidéo : le compteur de coût repart de zéro,
      // en conservant la vérification des faits déjà payée pour ce sujet.
      const alreadyChecked = usageRef.current.textCalls.factCheck;
      usageRef.current = {
        ...emptyUsage(),
        textCalls: { script: 1, factCheck: alreadyChecked, translation: 0 },
      };
      setUsage(usageRef.current);
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
      // Nouveau projet : la liste des vidéos exportées repart de zéro.
      setExportInfos({});
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
  const runCreateUpload = useServerFn(createExportUpload);
  const runExportUrl = useServerFn(getExportDownloadUrl);

  /**
   * Empreinte du texte source : sert à savoir si une traduction déjà faite est
   * encore valable. Seul le texte parlé compte (les visuels ne sont pas traduits).
   */
  const sourceSignature = (doc: Script) =>
    [doc.title ?? "", doc.hook ?? "", doc.cta ?? "", ...doc.scenes.map((s) => `${s.index}:${s.narration}`)].join("¦");
  /** Empreinte source de la traduction déjà obtenue, par langue. */
  const translationSourceRef = useRef<Record<string, string>>({});

  /**
   * DÉBIT DE DÉPART D'UNE VOIX JAMAIS ENTENDUE : une seule prise COURTE de
   * calibration (deux phrases), mesurée puis mémorisée. Tout le calibrage des
   * longueurs se fait ensuite sur le texte seul, sans appeler ElevenLabs.
   */
  const ensureVoiceRates = async (targets: string[], doc: Script | null) => {
    for (const lang of targets) {
      if (cancelledRef.current) return;
      const voiceId = voiceForLang(lang);
      if (!voiceId) continue;
      if (voiceRatesRef.current[rateKey(voiceId, lang)]) continue;
      const src = scriptsRef.current[lang] ?? (lang === sourceLang ? doc : null);
      const sample = (src?.scenes?.[0]?.narration ?? "").trim().slice(0, 200);
      if (sample.length < 40) continue;
      setCurrentStep(`Calibration de la voix — ${languageLabel(lang)}…`);
      try {
        const { audioDataUrl, words, characters } = (await runVoice({
          data: { text: sample, voice: voiceId, engine, language: lang as LanguageId, speed: 1 },
        })) as { audioDataUrl: string; words?: WordTiming[]; characters?: number };
        bumpUsage((u) => ({
          ...u,
          voiceChars: {
            ...u.voiceChars,
            [lang]: (u.voiceChars[lang] ?? 0) + (characters ?? sample.length),
          },
        }));
        const duration = await audioDuration(audioDataUrl);
        const win = voiceWindow(words ?? [], duration);
        const speaking = Math.max(0.3, win ? win.end - win.start : duration);
        const r = (await runRecordRate({
          data: {
            voiceId,
            language: lang,
            chars: characters ?? sample.length,
            seconds: speaking,
          },
        })) as { rate?: VoiceRate | null };
        if (r.rate) {
          voiceRatesRef.current = {
            ...voiceRatesRef.current,
            [rateKey(voiceId, lang)]: r.rate,
          };
          setVoiceRates((p) => ({ ...p, [rateKey(voiceId, lang)]: r.rate as VoiceRate }));
        }
      } catch {
        // Pas de mesure possible : on garde le débit par défaut de la langue.
      }
    }
  };

  /**
   * MASTER : traduit le script source dans chaque autre langue cochée.
   * Les visuels ne sont jamais régénérés — seuls les textes parlés changent.
   * `reuse` : une langue déjà traduite depuis CE texte source n'est pas refaite.
   */
  const onTranslateAll = async (
    doc: Script | null = script,
    reuse = false,
    only?: LanguageId[],
  ): Promise<Record<string, Script> | undefined> => {
    if (!doc) return undefined;
    const sig = sourceSignature(doc);
    let others = langs.filter((l) => l !== sourceLang);
    const next: Record<string, Script> = { ...scriptsRef.current, [sourceLang]: doc };
    if (only) others = others.filter((l) => only.includes(l));
    else if (reuse) {
      others = others.filter(
        (l) => !next[l] || translationSourceRef.current[l] !== sig,
      );
    }
    if (!others.length) {
      setScripts(next);
      scriptsRef.current = next;
      return next;
    }
    setTranslating(true);
    // Une voix jamais entendue n'a pas de débit : UNE prise courte suffit à le
    // mesurer, tout le reste du calibrage se fait ensuite sur le texte.
    await ensureVoiceRates([sourceLang, ...others], doc);
    const { lo: loSec, hi: hiSec } = durationRange(targetSeconds);
    /** Écart à la fenêtre de durée : 0 quand la langue est dans la cible. */
    const gap = (sec: number) => (sec < loSec ? loSec - sec : sec > hiSec ? sec - hiSec : 0);

    try {
      for (const lang of others) {
        if (cancelledRef.current) break; // arrêt demandé avant une traduction
        setCurrentStep(`Traduction — ${languageLabel(lang)}…`);
        setAssembleStep(`Traduction — ${languageLabel(lang)}…`);
        try {
          type TransRes = {
            title: string;
            hook: string;
            cta: string;
            scenes: { index: number; narration: string; overlay: string }[];
          };
          // BUDGET DE CARACTÈRES DE CETTE LANGUE : la durée dépend du débit
          // réel de SA voix, pas du nombre de mots français. À 6,8 c/s, une
          // cible de 63 s ne laisse pas le même texte qu'à 10,4 c/s.
          const cps = cpsFor(lang);
          const window = charWindow(loSec, hiSec, cps, baseVoiceSpeed);
          const charsOf = (scenes: { narration: string }[]) =>
            narrationChars(scenes.map((s) => s.narration));
          const predicted = (scenes: { narration: string }[]) =>
            predictSeconds(charsOf(scenes), cps, baseVoiceSpeed);
          const callTranslate = (
            src: { title: string; hook: string; cta: string; scenes: TransRes["scenes"] },
            adjust: boolean,
            mode: "ok" | "shorten" | "lengthen" = "ok",
          ) =>
            runTranslate({
              data: {
                title: src.title,
                hook: src.hook,
                cta: src.cta,
                scenes: src.scenes.map((s) => ({
                  index: s.index,
                  narration: s.narration,
                  overlay: s.overlay ?? "",
                })),
                language: lang,
                maxSceneSeconds: 8,
                // Chaque langue doit tenir dans la même fenêtre de durée que la
                // source : ni vidéo trop courte, ni secondes de clip payées en trop.
                minTotalSeconds: loSec,
                maxTotalSeconds: hiSec,
                adjust,
                charTarget: window.target,
                charMin: window.min,
                charMax: window.max,
                charMode: mode,
                // Une traduction ne remonte jamais d'un cran en niveau de langue.
                languageBrief: settings.guides.language,
              },
            }).then((r) => {
              bumpUsage((u) => ({
                ...u,
                textCalls: { ...u.textCalls, translation: u.textCalls.translation + 1 },
              }));
              return r;
            }) as Promise<TransRes>;

          const existing = only ? next[lang] : undefined;
          const startFrom = existing ?? doc;
          let res = await callTranslate(
            {
              title: startFrom.title ?? "",
              hook: startFrom.hook ?? "",
              cta: startFrom.cta ?? "",
              scenes: startFrom.scenes.map((s) => ({
                index: s.index,
                narration: s.narration,
                overlay: s.overlay ?? "",
              })),
            },
            Boolean(existing),
          );
          // CONTRÔLE DU TOTAL, SYMÉTRIQUE ET SUR LE TEXTE SEUL (aucune voix
          // n'est synthétisée ici) : jusqu'à trois passes sur CETTE langue,
          // qui RACCOURCISSENT ou RALLONGENT selon le sens de l'écart, puis on
          // garde le résultat le plus proche de la fenêtre.
          let best = res;
          let bestGap = gap(predicted(res.scenes));
          for (
            let pass = 0;
            pass < MAX_CONDENSE_PASSES && bestGap > 0 && !cancelledRef.current;
            pass++
          ) {
            const mode = calibrationMode(charsOf(res.scenes), window);
            if (mode === "ok") break;
            setCurrentStep(
              `${mode === "shorten" ? "Condensation" : "Étoffement"} — ${languageLabel(lang)}…`,
            );
            res = await callTranslate(res, true, mode);
            const g = gap(predicted(res.scenes));
            if (g < bestGap) {
              best = res;
              bestGap = g;
            }
            if (bestGap === 0) break;
          }
          res = best;
          if (bestGap > 0) {
            // Second levier : la vitesse de synthèse de CETTE langue (≤ 1,15).
            const speed = plannedSpeed(predicted(res.scenes), hiSec);
            const after = predictSeconds(
              res.scenes.reduce((n, s) => n + (s.narration ?? "").trim().length, 0),
              cps,
              speed,
            );
            if (gap(after) > 0) {
              toast.warning(
                `${languageLabel(lang)} : ${Math.round(after)} s prédites même à voix ×${speed.toFixed(2)}, hors de la cible ${loSec}-${hiSec} s.`,
              );
            }
          }
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
          // Mémorise le texte source d'où vient cette traduction : tant qu'il
          // ne change pas, on ne repaiera jamais la même traduction.
          translationSourceRef.current[lang] = sig;
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
      // L'en-tête ne doit jamais rester sur une étape terminée.
      setCurrentStep("");
      setAssembleStep("");
    }
  };

  /** Met à jour la narration traduite d'un plan (traductions éditables). */
  const updateTranslatedScene = (lang: string, index: number, value: string) => {
    const doc = scriptsRef.current[lang];
    if (!doc) return;
    const next = {
      ...scriptsRef.current,
      [lang]: {
        ...doc,
        scenes: doc.scenes.map((s) => (s.index === index ? { ...s, narration: value } : s)),
      },
    };
    scriptsRef.current = next;
    setScripts(next);
    // La traduction corrigée doit survivre au rechargement, comme la source.
    if (projectId && scriptRef.current) saveHistory(projectId, scriptRef.current, next);
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

  /**
   * TYPES DE PLAN de la vidéo : la direction artistique ne bouge pas, mais
   * l'échelle et le cadrage changent à chaque plan et jamais deux fois de suite.
   */
  const shotTypesRef = useRef<ShotTypeId[]>([]);
  const shotTypeFor = (scene: Scene, doc: Script | null) => {
    const all = doc?.scenes ?? [];
    if (shotTypesRef.current.length !== all.length) {
      shotTypesRef.current = assignShotTypes(all.map((s) => `${s.narration} ${s.imagePrompt}`));
    }
    return shotTypesRef.current[scene.index] ?? SHOT_TYPES[0].id;
  };

  const onImage = async (
    scene: Scene,
    doc: Script | null = script,
    shotOverride?: ShotTypeId,
  ) => {
    if (cancelledRef.current) return undefined; // appel payant : arrêt demandé
    patch(scene.index, { imageLoading: true });
    try {
      const consistent = settings.useReferenceImage && scene.index > 0;
      const ref = consistent ? referenceImage.current : null;
      // Continuité : on montre aussi le plan précédent au modèle.
      const prev = consistent ? (previousImage.current ?? null) : null;
      const story = storyContext(scene, doc);
      const sceneVisualOpts = { ...visualOpts, bible: bibleFor(doc) };
      const { dataUrl, usage: imgUsage } = (await runImage({
        data: {
          imagePrompt: scene.imagePrompt,
          visual,
          square: orientation === "square",
          ...sceneVisualOpts,
          // Plan 1 : composition d'accroche, quel que soit le style visuel.
          ...(scene.index === 0 && settings.opening.image.trim()
            ? { opening: settings.opening.image.trim() }
            : {}),
          ...(story ? { story } : {}),
          // Échelle et cadrage imposés : jamais le même type que le plan voisin.
          shot: `${shotPrompt(shotOverride ?? shotTypeFor(scene, doc))} ${settings.guides.shots}`.trim(),
          ...(ref ? { referenceImage: ref } : {}),
          ...(prev && prev !== ref ? { previousImage: prev } : {}),
        },
      })) as { dataUrl: string; usage?: TokenUsage | null };
      bumpUsage((u) => ({ ...u, images: u.images + 1, tokens: addTokens(u.tokens, imgUsage) }));

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
      // Mode brouillon : plans commandés en 720×1280, durées libres (4/6/8 s).
      // L'export, lui, reste toujours en 1080×1920 (image simplement agrandie).
      const draft = settings.draft720 === true;
      if (image && orientation === "square" && settings.precomposeSquare !== false) {
        const { composeSquareInVertical } = await import("@/lib/square-frame");
        const dims = draft ? { w: 720, h: 1280 } : { w: 1080, h: 1920 };
        videoInput = await composeSquareInVertical(image, dims.w, dims.h);
      }
      const story = storyContext(scene, doc);
      const literalVideoPrompt = [
        `Illustrate exactly this spoken narration: ${scene.narration}`,
        `The reference image depicts: ${scene.imagePrompt}`,
        "Keep every character, object, costume and location from the reference image unchanged",
        scene.videoPrompt,
      ].join(". ").slice(0, 1950);
      // Hors brouillon, le 1080p n'existe qu'en plans de 8 s : on les impose.
      const seconds: "4" | "6" | "8" | undefined = !draft
        ? "8"
        : voiceSeconds
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
          // Plan 1 : mouvement d'accroche dès la première image.
          ...(scene.index === 0 && settings.opening.motion.trim()
            ? { opening: settings.opening.motion.trim() }
            : {}),
          hd: !draft,
        },
      })) as { id: string };
      patch(scene.index, { videoId: id });
      // Coût RÉELLEMENT commandé (à comparer avec l'estimation d'avant départ).
      bumpUsage((u) => ({
        ...u,
        clips: { count: u.clips.count + 1, seconds: u.clips.seconds + Number(seconds ?? 8) },
      }));

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
        // Le plan CTA Sophia est un clip animé comme les autres : le décocher
        // économise exactement sa durée.
        ctaSaving: settings.sophiaCta !== false && pending.length ? perClip : 0,
      };
    },
    [script, states, targetSeconds, langs, settings.sophiaCta],
  );

  /** Confirmation obligatoire avant toute dépense de crédits en série. */
  const confirmCost = async (doc: Script | null = script) => {
    const cost = estimateCost(doc);
    if (!cost.clips) return true;
    const cap = settings.spendCapSeconds ?? 72;
    if (cost.seconds > cap) {
      toast.error(
        `Plafond de dépense dépassé : ${cost.seconds} s de vidéo IA demandées pour un plafond de ${cap} s. Réduis la durée, le nombre de plans, ou relève le plafond dans Paramètres.`,
      );
      return false;
    }
    return requestCostConfirmation(cost);
  };

  /** Voix off d'UN plan dans UNE langue. Rangée dans states[i].voices[lang]. */
  const onVoice = async (scene: Scene, lang: string = sourceLang) => {
    if (cancelledRef.current) return undefined; // appel payant : arrêt demandé
    const doc = scriptFor(lang, script);
    const text = doc?.scenes.find((s) => s.index === scene.index)?.narration ?? scene.narration;
    patch(scene.index, { audioLoading: true });
    try {
      const { audioDataUrl, words, characters } = (await runVoice({
        data: {
          text,
          voice: voiceForLang(lang),
          engine,
          language: lang as LanguageId,
          // Vitesse propre à cette langue : rattrapage de durée appliqué à la
          // synthèse, donc les repères mot à mot restent calés sur l'audio réel.
          speed: speedFor(lang),
        },
      })) as { audioDataUrl: string; words?: WordTiming[]; characters?: number };
      bumpUsage((u) => ({
        ...u,
        voiceChars: {
          ...u.voiceChars,
          [lang]: (u.voiceChars[lang] ?? 0) + (characters ?? text.length),
        },
      }));
      const duration = await audioDuration(audioDataUrl);
      // Durée RÉELLEMENT PARLÉE : les silences de tête et de queue sont rognés
      // avant toute mesure, exactement comme au montage. Une seconde de blanc
      // par prise, c'est huit secondes de trop sur la vidéo.
      const win = voiceWindow(words ?? [], duration);
      const speaking = Math.max(0.3, win ? win.end - win.start : duration);
      const take: VoiceTake = { audio: audioDataUrl, words: words ?? [], duration, speaking };
      setStates((prev) => ({
        ...prev,
        [scene.index]: {
          ...prev[scene.index],
          audioLoading: false,
          voices: { ...(prev[scene.index]?.voices ?? {}), [lang]: take },
        },
      }));
      // DÉBIT RÉEL MÉMORISÉ : ramené à la vitesse 1,0 pour rester comparable.
      const usedVoice = voiceForLang(lang);
      void runRecordRate({
        data: {
          voiceId: usedVoice,
          language: lang,
          chars: characters ?? text.length,
          seconds: normalizeSeconds(speaking, speedFor(lang)),
        },
      })
        .then((r) => {
          const rate = (r as { rate?: VoiceRate | null }).rate;
          if (rate) setVoiceRates((p) => ({ ...p, [rateKey(usedVoice, lang)]: rate }));
        })
        .catch(() => undefined);
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
      ...langs.map((l) => {
        const take = st?.voices?.[l];
        return take?.speaking ?? take?.duration ?? 0;
      }),
    );
    return longest || undefined;
  };

  /** Toutes les langues cochées ont-elles leur voix off sur ce plan ? */
  const hasAllVoices = (st: SceneState | undefined) =>
    langs.length > 0 && langs.every((l) => Boolean(st?.voices?.[l]?.duration));

  /**
   * Langues hors fenêtre, calculées sur un INSTANTANÉ (pas sur l'état React,
   * qui est en retard au milieu d'un pipeline). Durée réellement parlée dès
   * qu'une voix existe, prédiction par le débit mesuré sinon.
   */
  const outOfWindowFrom = (doc: Script, snapshot: Record<number, SceneState>) => {
    const { lo, hi } = durationRange(targetSeconds);
    const out: { lang: LanguageId; over: number }[] = [];
    for (const l of langs) {
      const s = l === sourceLang ? doc : scriptsRef.current[l];
      if (!s) continue;
      const cps = cpsFor(l);
      const predictedTotal = predictSeconds(scriptChars(s), cps, baseVoiceSpeed);
      const speed = plannedSpeed(predictedTotal, hi);
      const total = s.scenes.reduce((sum, sc) => {
        const take = snapshot[sc.index]?.voices?.[l];
        const real = take?.speaking ?? take?.duration ?? 0;
        return (
          sum +
          (real > 0 ? real : predictSeconds((sc.narration ?? "").trim().length, cps, speed))
        );
      }, 0);
      // SYMÉTRIQUE : une version trop COURTE est un échec au même titre qu'une
      // version trop longue (écart négatif).
      if (total > hi + 0.5) out.push({ lang: l, over: Math.round(total - hi) });
      else if (total < lo - 0.5) out.push({ lang: l, over: -Math.round(lo - total) });
    }
    return out;
  };

  /** Conservé : ne signale que les langues qui DÉPASSENT (avant animation). */
  const overflowFrom = (doc: Script, snapshot: Record<number, SceneState>) =>
    outOfWindowFrom(doc, snapshot).filter((o) => o.over > 0);

  const overflowLabel = (over: { lang: LanguageId; over: number }[]) =>
    over
      .map((o) => `${o.lang.toUpperCase()} ${o.over > 0 ? "+" : "−"}${Math.abs(o.over)} s`)
      .join(" · ");

  const onGenerateAll = async () => {
    if (!script) return;
    if (!(await confirmWithStep(() => confirmCost(script)))) return;
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

      // d — CONTRÔLE SUR LE TEXTE, AVANT TOUTE VOIX : une langue hors fenêtre
      // fige le défaut dans toutes les versions, puisque les clips sont communs.
      const textOver = outOfWindowFrom(script, snapshot);
      if (textOver.length) {
        toast.error(
          `Production bloquée — ${overflowLabel(textOver)}. Recalibre ces versions (bouton Traduire) : aucune voix off ni aucun plan animé n'a été commandé.`,
        );
        return;
      }

      // e — voix off de TOUTES les langues, une seule fois par plan et par langue.
      snapshot = await generateAllVoices(script, snapshot);
      if (cancelledRef.current) return;

      const over = overflowFrom(script, snapshot);
      if (over.length) {
        toast.error(
          `Animation bloquée — ${overflowLabel(over)}. Durées mesurées hors cible : le débit des voix vient d'être recalé, relance le calibrage avant d'animer.`,
        );
        return;
      }


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
      setAssembleStep(cancelledRef.current ? "Pipeline arrêté" : "");
    }
  };

  const onPreviewVoice = async () => {
    setPreviewVoice(true);
    try {
      const sampleKey = `${engine}:${voice}:${voiceLangTab}:${speedFor(voiceLangTab)}`;
      let src = voiceSamples.current[sampleKey];
      if (!src) {
        const { audioDataUrl } = (await runVoice({
          data: {
            text: VOICE_SAMPLE_TEXT[voiceLangTab] ?? VOICE_SAMPLE_TEXT["fr"]!,
            voice,
            engine,
            language: voiceLangTab,
            speed: speedFor(voiceLangTab),
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

    const mods = await loadAssembler();
    const { assembleVideo } = mods.assemble;
    const { randomTrack } = mods.music;
    const { makeCaptionCues, makeRoundedSquareMask, sophiaWindow, voiceWindow, shiftTimings } =
      mods.karaoke;
    // L'export est TOUJOURS en 1080p, même en mode brouillon : les plans 720p
    // sont simplement agrandis.
    const dims =
      orientation === "horizontal"
        ? { width: 1920, height: 1080 }
        : { width: 1080, height: 1920 };
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

    // Niveau de la voix mesuré ICI, dans le navigateur (quelques millisecondes)
    // au lieu d'une passe `loudnorm` dans ffmpeg, qui faisait tourner tout le
    // graphe audio à 192 kHz et triplait la durée du montage.
    const { measureVoiceGainDb } = await import("@/lib/audio-gain");
    const voiceGainDb = await measureVoiceGainDb(withDurations.map((s) => s.audio));

    const blob = await assembleVideo(withDurations, {
      ...dims,
      music: track?.blob ?? undefined,
      musicVolume: settings.musicVolume,
      musicGainDb: track?.gainDb ?? 0,
      voiceGainDb,
      langLabel: languageLabel(lang),
      onStretchWarning: (message) => toast.warning(message),
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
    // Sauvegarde en ligne : jamais bloquante, l'export local reste valide.
    void saveExportOnline(lang, blob, url);
    return url;
  };

  /**
   * Envoie la vidéo sur le stockage du projet via une URL signée (le fichier ne
   * passe pas par le serveur de l'application) puis range le lien avec le projet.
   * Un échec de stockage n'invalide JAMAIS l'export : il reste téléchargeable.
   */
  const saveExportOnline = async (lang: string, blob: Blob, objectUrl: string) => {
    if (!projectId) return;
    try {
      setAssembleStep(`${languageLabel(lang)} — sauvegarde en ligne…`);
      const { path, token, bucket } = (await runCreateUpload({
        data: { projectId, language: lang },
      })) as { path: string; token: string; bucket: string };
      const { supabase } = await import("@/integrations/supabase/client");
      const { error } = await supabase.storage
        .from(bucket)
        .uploadToSignedUrl(path, token, blob, { contentType: "video/mp4" });
      if (error) throw new Error(error.message);
      const { url, expiresAt } = (await runExportUrl({ data: { path, days: 7 } })) as {
        url: string;
        expiresAt: number;
      };
      const { videoDuration } = await import("@/lib/duration");
      const duration = await videoDuration(objectUrl);
      const info: ExportInfo = { path, url, expiresAt, size: blob.size, duration };
      setExportInfos((prev) => ({ ...prev, [lang]: info }));
      saveExportToHistory(projectId, lang, info);
    } catch (e) {
      console.error(e);
      toast.warning(
        `Vidéo ${languageLabel(lang)} : la sauvegarde en ligne a échoué (${
          e instanceof Error ? e.message : "stockage indisponible"
        }). La vidéo reste téléchargeable ici.`,
      );
    }
  };

  /**
   * Renouvelle les liens signés d'un projet rechargé : un lien de 7 jours peut
   * avoir expiré, le fichier, lui, est toujours dans le stockage.
   */
  const refreshExportLinks = async (id: string, saved?: Record<string, ExportInfo>) => {
    const entries = Object.entries(saved ?? {});
    if (!entries.length) return;
    for (const [lang, info] of entries) {
      if (info.expiresAt && info.expiresAt > Date.now() + 60_000) continue;
      try {
        const { url, expiresAt } = (await runExportUrl({
          data: { path: info.path, days: 7 },
        })) as { url: string; expiresAt: number };
        const next: ExportInfo = { ...info, url, expiresAt };
        setExportInfos((prev) => ({ ...prev, [lang]: next }));
        saveExportToHistory(id, lang, next);
      } catch {
        /* stockage indisponible : on garde l'ancien lien affiché */
      }
    }
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
    const failedLangs: string[] = [];
    try {
      for (const lang of langs) {
        if (cancelledRef.current) break; // arrêt vérifié entre chaque langue
        // Une langue en échec est signalée, les suivantes continuent.
        try {
          await buildFinalVideo(states, false, undefined, lang);
        } catch (e) {
          console.error(e);
          failedLangs.push(languageLabel(lang));
          toast.error(
            `Montage ${languageLabel(lang)} échoué : ${e instanceof Error ? e.message : String(e)}`,
          );
        }
        try {
          (await loadAssembler()).assemble.resetFFmpeg();
        } catch {
          /* sans gravité */
        }
      }
      if (failedLangs.length) {
        toast.warning(`Langues non montées : ${failedLangs.join(", ")}`);
      }
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Échec de l'assemblage");

    } finally {
      setAssembling(false);
      setCurrentStep(cancelledRef.current ? "Pipeline arrêté" : "");
      setAssembleStep(cancelledRef.current ? "Pipeline arrêté" : "");
    }
  };

  /** MASTER complet : traductions → images → voix de toutes les langues → clips → un MP4 par langue. */
  const onExportEverything = async (scriptOverride?: Script, skipConfirm = false) => {
    const doc = scriptOverride ?? script;
    if (!doc) return;
    if (!skipConfirm && !(await confirmWithStep(() => confirmCost(doc)))) return;
    if (!skipConfirm) beginRun();
    setAssembling(true);
    try {
      // b — traductions.
      setCurrentStep("Traductions…");
      // Réutilise les traductions déjà obtenues depuis CE même texte source :
      // on ne repaie pas 5 traductions pour un résultat identique.
      await onTranslateAll(doc, true);
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

      // CONTRÔLE DE RESSEMBLANCE entre plans voisins : deux plans quasi
      // identiques (même sujet, même cadrage) donnent une vidéo qui tourne en
      // rond. Le plan fautif est régénéré UNE SEULE FOIS avec un autre type de
      // plan — jamais de boucle, jamais de seconde tentative.
      if (!cancelledRef.current) {
        const prints: (number[] | null)[] = [];
        for (const scene of doc.scenes) {
          const img = snapshot[scene.index]?.image;
          prints[scene.index] = img ? await imageFingerprint(img) : null;
        }
        for (const scene of doc.scenes) {
          if (cancelledRef.current || scene.index === 0) break;
          const a = prints[scene.index - 1];
          const b = prints[scene.index];
          if (!a || !b || fingerprintSimilarity(a, b) < TOO_SIMILAR) continue;
          const swap = alternativeShot(shotTypeFor(scene, doc), [
            shotTypesRef.current[scene.index - 1],
            shotTypesRef.current[scene.index + 1],
          ]);
          shotTypesRef.current[scene.index] = swap;
          setAssembleStep(`Plan ${scene.index + 1} trop proche du précédent — nouveau cadrage…`);
          const again = await onImage(scene, doc, swap);
          if (again) {
            snapshot[scene.index] = { ...(snapshot[scene.index] ?? {}), image: again };
            prints[scene.index] = await imageFingerprint(again);
          }
        }
      }

      if (cancelledRef.current) {
        setAssembleStep("Pipeline arrêté");
        return;
      }

      // d — CALIBRAGE DES DURÉES SUR LE TEXTE SEUL. Aucune voix n'est
      // synthétisée ici : on se sert du débit MESURÉ de chaque voix. Régénérer
      // les voix à chaque passe revenait à payer trois fois la même prise, et
      // cinq fois plus avec cinq langues.
      let over = outOfWindowFrom(doc, snapshot);
      for (let round = 0; round < 2 && over.length && !cancelledRef.current; round++) {
        const bad = over.map((o) => o.lang).filter((l) => l !== sourceLang);
        if (!bad.length) break;
        setAssembleStep(`Calibrage — ${bad.map((l) => languageLabel(l)).join(", ")}…`);
        setCurrentStep(`Calibrage — ${overflowLabel(over)}`);
        await onTranslateAll(doc, false, bad);
        if (cancelledRef.current) break;
        over = outOfWindowFrom(doc, snapshot);
      }
      if (cancelledRef.current) {
        setAssembleStep("Pipeline arrêté");
        return;
      }
      if (over.length) {
        toast.error(
          `Animation bloquée — ${overflowLabel(over)}. Ces versions restent hors de la cible après calibrage du texte et accélération de la voix : aucune voix off ni aucun plan animé n'a été commandé.`,
        );
        setAssembleStep("Durée hors cible : animation bloquée");
        return;
      }

      // e — voix off, UNE SEULE FOIS par plan et par langue, maintenant que
      // toutes les langues sont dans la fenêtre. La durée réellement entendue
      // corrige ensuite le débit mémorisé pour les prochaines vidéos.
      snapshot = await generateAllVoices(doc, snapshot);
      if (cancelledRef.current) {
        setAssembleStep("Pipeline arrêté");
        return;
      }
      const realOver = outOfWindowFrom(doc, snapshot);
      if (realOver.length) {
        toast.warning(
          `Durées mesurées hors cible — ${overflowLabel(realOver)}. Le débit des voix vient d'être recalé : relance le calibrage avant d'animer.`,
        );
        setAssembleStep("Durée mesurée hors cible : animation bloquée");
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
      // Chaque langue est isolée : une langue en échec n'annule plus les autres.
      const failedLangs: string[] = [];
      for (const lang of langs) {
        if (cancelledRef.current) break; // arrêt vérifié entre chaque langue
        setCurrentStep(`Montage — ${languageLabel(lang)}…`);
        try {
          await buildFinalVideo(snapshot, true, doc, lang);
        } catch (e) {
          console.error(e);
          failedLangs.push(languageLabel(lang));
          toast.error(
            `Montage ${languageLabel(lang)} échoué : ${e instanceof Error ? e.message : String(e)}`,
          );
        }
        // Moteur de montage recyclé entre deux langues : sa mémoire ne
        // s'accumule plus au fil du rendu.
        try {
          (await loadAssembler()).assemble.resetFFmpeg();
        } catch {
          /* sans gravité */
        }
      }
      if (failedLangs.length) {
        toast.warning(`Langues non montées : ${failedLangs.join(", ")}`);
      }

    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Échec de l'export complet");
    } finally {
      setAssembling(false);
      setCurrentStep(cancelledRef.current ? "Pipeline arrêté" : "");
      setAssembleStep(cancelledRef.current ? "Pipeline arrêté" : "");
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
    const planned = sceneCount * perClip;
    const cap = settings.spendCapSeconds ?? 72;
    if (planned > cap) {
      toast.error(
        `Plafond de dépense dépassé : ${planned} s de vidéo IA demandées pour un plafond de ${cap} s. Réduis la durée, le nombre de plans, ou relève le plafond dans Paramètres.`,
      );
      return;
    }
    const ok = await confirmWithStep(() =>
      requestCostConfirmation({
        clips: sceneCount,
        seconds: planned,
        perClip,
        voices: sceneCount * langs.length,
        languages: langs.length,
        ctaSaving: settings.sophiaCta !== false ? perClip : 0,
      }),
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
      setAssembleStep(cancelledRef.current ? "Pipeline arrêté" : "");
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

  /**
   * Liste utilisable : favoris, puis voix de la langue de l'onglet, puis le reste,
   * plafonnée à une trentaine d'entrées tant qu'aucune recherche n'est saisie.
   */
  const voiceGroups = useMemo(() => {
    const base = engine === "elevenlabs" && accountVoices.length ? accountVoices : voicesFor(engine);
    const q = voiceQuery.trim().toLowerCase();
    const filtered = q ? base.filter((v) => v.label.toLowerCase().includes(q)) : base;
    const seen = new Set(filtered.map((v) => v.id));
    const all = [...filtered, ...remoteVoices.filter((v) => !seen.has(v.id))];

    const mark = LANGUAGE_FLAGS[voiceLangTab] ?? "";
    const byLabel = (a: { label: string }, b: { label: string }) =>
      a.label.localeCompare(b.label, "fr");

    const favs = all.filter((v) => favoriteVoices.includes(v.id)).sort(byLabel);
    const rest = all.filter((v) => !favoriteVoices.includes(v.id));
    const native = rest.filter((v) => mark && v.label.startsWith(mark)).sort(byLabel);
    const others = rest.filter((v) => !(mark && v.label.startsWith(mark))).sort(byLabel);

    const cap = q ? 120 : 30;
    const room = Math.max(0, cap - favs.length);
    const nativeShown = native.slice(0, room);
    const othersShown = others.slice(0, Math.max(0, room - nativeShown.length));

    return [
      { key: "fav", label: "Favoris", voices: favs },
      { key: "native", label: `Voix ${languageLabel(voiceLangTab)}`, voices: nativeShown },
      { key: "other", label: "Autres voix", voices: othersShown },
    ].filter((g) => g.voices.length > 0);
  }, [accountVoices, engine, favoriteVoices, voiceQuery, remoteVoices, voiceLangTab]);

  const availableVoices = useMemo(
    () => voiceGroups.flatMap((g) => g.voices),
    [voiceGroups],
  );



  /** Saisie manuelle d'un identifiant ElevenLabs pour la langue de l'onglet actif. */
  const [voiceIdDraft, setVoiceIdDraft] = useState("");
  const applyVoiceId = () => {
    const id = voiceIdDraft.trim();
    if (!id) {
      toast.error("Colle d'abord un identifiant de voix ElevenLabs.");
      return;
    }
    if (!isValidElevenVoiceId(id)) {
      toast.error("Cet identifiant ne ressemble pas à un ID ElevenLabs (20 caractères environ).");
      return;
    }
    setVoice(id);
    setVoiceIdDraft("");
    toast.success(`Voix appliquée pour ${languageLabel(voiceLangTab)}`);
  };

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
      const mods = await loadAssembler();
      const { assembleVideo } = mods.assemble;
      const { makeOverlayPng } = mods.overlay;
      const { makeCaptionCues, makeRoundedSquareMask, sophiaWindow, voiceWindow, shiftTimings } =
        mods.karaoke;
      const dims =
        orientation === "horizontal"
          ? { width: 1920, height: 1080 }
          : { width: 1080, height: 1920 };
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


        { ...dims, onStretchWarning: (message: string) => toast.warning(message) },
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
          {usage.clips.count > 0 && (
            <span className="hidden text-xs text-foreground md:inline">
              · Consommé : {usage.clips.count} clip{usage.clips.count > 1 ? "s" : ""} /{" "}
              {usage.clips.seconds} s
            </span>
          )}

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
            <Link to="/sujets" className="btn-base btn-ghost px-2.5 py-1.5 text-xs">
              <ListChecks className="h-3.5 w-3.5" /> Sujets
            </Link>
            <Link to="/parametres" className="btn-base btn-ghost px-2.5 py-1.5 text-xs">
              <Settings className="h-3.5 w-3.5" /> Paramètres
            </Link>
          </div>
        </div>
        <div className="mx-auto w-full max-w-6xl px-4 pb-2 md:hidden">
          <span className="text-xs text-muted-foreground">
            Coût estimé : {cost.clips} clip{cost.clips > 1 ? "s" : ""} × {cost.perClip} s + {cost.voices}{" "}
            voix off
            {usage.clips.count > 0
              ? ` · Consommé : ${usage.clips.count} clips / ${usage.clips.seconds} s`
              : ""}
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
              <div key={h.id} className="flex flex-wrap items-center justify-between gap-3">
                <button
                  onClick={async () => {
                    setScript(h.script);
                    setProjectId(h.id);
                    setFinalUrl(null);
                    setFinalUrls({});
                    setExportInfos(h.exports ?? {});
                    // Langue d'écriture du projet (celle d'origine, pas celle
                    // affichée au moment du clic).
                    const src = (MASTER_LANGUAGE_IDS as readonly string[]).includes(
                      h.sourceLang ?? "",
                    )
                      ? (h.sourceLang as LanguageId)
                      : sourceLang;
                    const saved = { ...(h.scripts ?? {}), [src]: h.script };
                    setScripts(saved);
                    scriptsRef.current = saved;
                    setShowHistory(false);
                    const { loadProjectMedia } = await import("@/lib/project-store");
                    const media = await loadProjectMedia(h.id);
                    const restoredStates = migrateStates(
                      media as Record<number, SceneState>,
                      src,
                    );
                    setStates(restoredStates);
                    // Langues de production : celles enregistrées, complétées
                    // par toutes celles qui ont déjà un script traduit ou une
                    // voix off — pour qu'aucun travail payé ne semble perdu.
                    const found = new Set<string>([src, ...(h.langs ?? [])]);
                    for (const l of Object.keys(saved)) found.add(l);
                    for (const st of Object.values(restoredStates)) {
                      for (const l of Object.keys(st?.voices ?? {})) found.add(l);
                    }
                    const restoredLangs = (MASTER_LANGUAGE_IDS as readonly string[]).filter(
                      (l) => found.has(l),
                    ) as LanguageId[];
                    setSourceLang(src);
                    setTargetLangs(restoredLangs);
                    setViewLang(src);
                    if (h.voices && Object.keys(h.voices).length) {
                      setVoiceByLang((prev) => ({ ...prev, ...h.voices }));
                    }
                    const { loadFinalVideo } = await import("@/lib/project-store");
                    const savedFinal = await loadFinalVideo(h.id);
                    if (savedFinal) setFinalUrl(URL.createObjectURL(savedFinal));
                    // Les liens signés expirent : on les renouvelle au rechargement.
                    void refreshExportLinks(h.id, h.exports);
                    toast.success("Projet rechargé");
                  }}
                  className="flex-1 truncate text-left text-sm hover:text-primary"
                >
                  {h.title}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {new Date(h.date).toLocaleString("fr-FR")}
                  </span>
                </button>
                <span className="flex flex-wrap items-center gap-2">
                  {h.usage && (
                    <UsageRecap
                      usage={h.usage}
                      priceVideoSecond={settings.priceVideoSecond ?? null}
                      priceImage={settings.priceImage ?? null}
                      compact
                    />
                  )}
                  {Object.entries(h.exports ?? {}).map(([l, info]) => (
                    <a
                      key={l}
                      href={info.url}
                      download={`${h.title.replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase()}-${l}.mp4`}
                      className="btn-base btn-ghost px-2 py-1 text-[11px]"
                      title={`${formatSize(info.size)} · lien valable 7 jours`}
                    >
                      <Download className="h-3 w-3" /> {l.toUpperCase()}
                    </a>
                  ))}
                  <button
                    onClick={() => deleteHistory(h.id)}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Supprimer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </span>
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
              <button
                onClick={onTakeQueuedTopic}
                disabled={takingTopic}
                className="btn-base btn-ghost text-xs"
              >
                {takingTopic ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ListChecks className="h-3.5 w-3.5" />
                )}
                Prendre le prochain sujet de la file
              </button>
              {angle && <span className="text-xs text-muted-foreground">{angle}</span>}
            </div>

            {/* VÉRIFICATION DES FAITS : ce qui a été rectifié, ce qui servira
                au script, ce qui a été écarté. Étape gratuite. */}
            {factCheck && (
              <div
                className={`mt-3 rounded-[10px] border p-3 text-xs ${
                  factCheck.verdict === "revoir"
                    ? "border-destructive/40 bg-destructive/10"
                    : "border-border"
                }`}
              >
                <p className="font-medium">
                  {factCheck.verdict === "revoir"
                    ? "Sujet à revoir : l'affirmation centrale ne tient pas"
                    : "Faits vérifiés"}
                </p>
                {factCheck.note && (
                  <p className="mt-1 text-muted-foreground">{factCheck.note}</p>
                )}
                {factCheck.correctedTopic && (
                  <p className="mt-2">
                    <span className="text-muted-foreground">Sujet retenu : </span>
                    {factCheck.correctedTopic}
                  </p>
                )}
                {factCheck.facts.length > 0 && (
                  <>
                    <p className="mt-2 text-muted-foreground">Faits retenus</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4">
                      {factCheck.facts.map((f, i) => (
                        <li key={i}>{f}</li>
                      ))}
                    </ul>
                  </>
                )}
                {factCheck.discarded.length > 0 && (
                  <>
                    <p className="mt-2 text-muted-foreground">Écarté car douteux</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted-foreground">
                      {factCheck.discarded.map((f, i) => (
                        <li key={i}>{f}</li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}


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
              {langsWithoutVoice.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Voix non choisie pour :{" "}
                  {langsWithoutVoice.map((l) => languageLabel(l)).join(", ")}
                </p>
              )}
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
                    void (async () => {
                      const res = await ensureFactCheck();
                      if (!res || res.verdict === "revoir") return;
                      setTopicValidated(true);
                      toast.success("Sujet vérifié — tu peux générer le script");
                    })();
                  }}
                  disabled={topicValidated || checkingFacts}
                  className="btn-base btn-ghost"
                >
                  {checkingFacts ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  {topicValidated
                    ? "Sujet validé"
                    : checkingFacts
                      ? "Vérification…"
                      : "Vérifier et valider le sujet"}
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
                min={60}
                max={90}
                step={5}
                value={targetSeconds}
                onChange={(e) => setTargetSeconds(Number(e.target.value))}
                className="mt-2 w-full"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {sceneCount} plans{settings.sophiaCta !== false ? " + CTA" : ""} · 60 secondes est
                le minimum et la cible du format
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
                      setVoice(defaultVoiceFor(e, voiceLangTab));
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
                  {voiceGroups.map((g) => (
                    <optgroup key={g.key} label={g.label}>
                      {g.voices.map((v) => (
                        <option key={v.id} value={v.id}>
                          {favoriteVoices.includes(v.id) ? `★ ${v.label}` : v.label}
                        </option>
                      ))}
                    </optgroup>
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

              {/* Saisie directe d'un identifiant ElevenLabs, même absent de la liste. */}
              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={voiceIdDraft}
                  onChange={(e) => setVoiceIdDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      applyVoiceId();
                    }
                  }}
                  placeholder="Ou colle un ID ElevenLabs"
                  aria-label="Coller un identifiant de voix ElevenLabs"
                  className="field min-w-0 flex-1"
                />
                <button type="button" onClick={applyVoiceId} className="btn-base btn-ghost shrink-0">
                  Appliquer
                </button>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                ID retenu pour {languageLabel(voiceLangTab)} :{" "}
                <span className="font-mono">{voice}</span>
              </p>

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

              {/* ACCROCHE — les trois candidates, leur note sur les six
                  conditions et la raison du choix, pour pouvoir juger. */}
              {(script.hookOptions ?? []).length > 1 && (
                <div className="mt-3 rounded-[10px] border border-border p-3">
                  <span className="label-x">Accroches proposées</span>
                  <ul className="mt-1.5 space-y-1.5 text-sm">
                    {(script.hookOptions ?? []).map((h, i) => {
                      const kept = h.trim() === (script.hook ?? "").trim();
                      return (
                        <li key={`${h}-${i}`} className={kept ? "" : "text-muted-foreground"}>
                          <span className="mr-1.5 text-xs uppercase">
                            {kept ? "retenue" : "écartée"}
                          </span>
                          {h}
                          {(script.hookScores ?? [])[i] && (
                            <span className="block text-xs text-muted-foreground">
                              {(script.hookScores ?? [])[i]}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  {script.hookChoice && (
                    <p className="mt-2 text-xs text-muted-foreground">{script.hookChoice}</p>
                  )}
                </div>
              )}

              {/* CONTRÔLE FINAL — « à quelle seconde je scrolle ? ». */}
              {script.audit && (script.audit.reason || script.audit.learned) && (
                <div className="mt-3 rounded-[10px] border border-border p-3 text-sm">
                  <span className="label-x">Relecture « spectateur qui scrolle »</span>
                  {script.audit.reason && (
                    <p className="mt-1.5">
                      Plan le plus faible
                      {script.audit.weakest >= 0 ? ` (plan ${script.audit.weakest + 1})` : ""} —{" "}
                      {script.audit.reason} Il a été réécrit une fois.
                    </p>
                  )}
                  {script.audit.learned && (
                    <p className="mt-1 text-muted-foreground">
                      Ce qu'on apprend : {script.audit.learned}
                    </p>
                  )}
                </div>
              )}


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
                  disabled={generatingAll || !imagesValidated || durationOverflow.length > 0}
                  title={durationOverflow.length ? durationBlockMessage : undefined}
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

            {/* Une vidéo par langue : mêmes clips, voix et sous-titres différents.
                La liste survit au rechargement grâce aux liens sauvegardés en ligne. */}
            {(Object.keys(finalUrls).length > 0 ||
              Object.keys(exportInfos).length > 0 ||
              finalUrl) && (
              <div className="surface-card p-4">
                <p className="label-x">Vidéos exportées</p>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {Array.from(
                    new Set([...Object.keys(finalUrls), ...Object.keys(exportInfos)]),
                  ).map((l) => {
                    const info = exportInfos[l];
                    const playable = finalUrls[l] ?? info?.url;
                    const fileName = `${(script.title || "video")
                      .replace(/[^\p{L}\p{N}]+/gu, "-")
                      .toLowerCase()}-${l}.mp4`;
                    return (
                      <div key={l} className="rounded-[10px] border border-border p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs text-muted-foreground">
                            {LANGUAGE_FLAGS[l] ?? ""} {l.toUpperCase()}
                            {info?.duration ? ` · ${Math.round(info.duration)} s` : ""}
                            {info?.size ? ` · ${formatSize(info.size)}` : ""}
                            {!info && " · non sauvegardée en ligne"}
                          </span>
                          <span className="flex flex-wrap items-center gap-2">
                            <a
                              href={playable}
                              download={fileName}
                              className="btn-base btn-ghost px-2.5 py-1.5 text-xs"
                            >
                              <Download className="h-3.5 w-3.5" /> Télécharger
                            </a>
                            {info?.url && (
                              <button
                                onClick={() => {
                                  void navigator.clipboard
                                    .writeText(info.url)
                                    .then(() => toast.success("Lien copié"))
                                    .catch(() => toast.error("Copie impossible"));
                                }}
                                className="btn-base btn-ghost px-2.5 py-1.5 text-xs"
                              >
                                Copier le lien
                              </button>
                            )}
                          </span>
                        </div>
                        {playable && (
                          <video
                            src={playable}
                            controls
                            playsInline
                            preload="metadata"
                            className="mt-3 max-h-[60vh] w-full rounded-[10px] bg-black object-contain"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
                {!Object.keys(finalUrls).length &&
                  !Object.keys(exportInfos).length &&
                  finalUrl && (
                    <video
                      src={finalUrl}
                      controls
                      playsInline
                      className="mt-3 max-h-[70vh] w-full rounded-[10px] bg-black object-contain"
                    />
                  )}
              </div>
            )}

            {langDurations.length > 0 &&
              (() => {
                const lo = targetSeconds;
                const hi = durationRange(targetSeconds).hi;
                const off = langDurations.filter((d) => d.seconds < lo || d.seconds > hi);
                const anyMeasured = langDurations.some((d) => d.measured);
                return (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span className="text-muted-foreground">
                      {anyMeasured ? "Durée mesurée" : "Durée prédite (débit réel des voix)"}{" "}
                      (cible {lo}-{hi} s)
                    </span>
                    {langDurations.map(({ lang: l, seconds, speed }) => {
                      const bad = seconds < lo || seconds > hi;
                      const boosted = speed > baseVoiceSpeed + 0.001;
                      return (
                        <span
                          key={l}
                          className={
                            bad ? "font-medium text-destructive" : "text-muted-foreground"
                          }
                          title={
                            bad
                              ? `Hors de la cible ${lo}-${hi} secondes`
                              : boosted
                                ? "Voix accélérée pour tenir dans la durée cible"
                                : undefined
                          }
                        >
                          {l.toUpperCase()} ≈ {Math.round(seconds)} s
                          {boosted ? ` · voix ×${speed.toFixed(2).replace(".", ",")}` : ""}
                          {bad ? " ⚠" : ""}
                        </span>
                      );
                    })}
                    {off.length > 0 && (
                      <span className="text-destructive">
                        Écart restant après correction :{" "}
                        {off
                          .map(
                            (d) =>
                              `${d.lang.toUpperCase()} ${d.seconds < lo ? "−" : "+"}${Math.round(
                                d.seconds < lo ? lo - d.seconds : d.seconds - hi,
                              )} s`,
                          )
                          .join(" · ")}
                        . Ajuste le script avant d'animer les plans.
                      </span>
                    )}
                    {durationOverflow.length > 0 && (
                      <span className="w-full font-medium text-destructive">
                        {durationBlockMessage}
                      </span>
                    )}
                  </div>
                );
              })()}

            {hasUsage(usage) && (
              <UsageRecap
                usage={usage}
                priceVideoSecond={settings.priceVideoSecond ?? null}
                priceImage={settings.priceImage ?? null}
              />
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
              {/* On lit l'ÉTAT (et non la référence) : sans cela, une phrase
                  modifiée ne réapparaissait jamais dans la carte du plan. */}
              {(scripts[viewLang] ?? script).scenes.map((scene) => {
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
                        <div className="pointer-events-none absolute inset-0">
                          <div
                            className="absolute left-1/2 aspect-square"
                            style={{
                              // Géométrie reprise du montage : aucune valeur en dur ici.
                              width: `${(1 - 2 * SQUARE_MARGIN_RATIO) * 100}%`,
                              top: `${(0.5 + SQUARE_CENTER_OFFSET_RATIO) * 100}%`,
                              transform: "translate(-50%, -50%)",
                              borderRadius: `${SQUARE_RADIUS_RATIO * 100}%`,
                              boxShadow: "0 0 0 9999px #000",
                            }}
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
                        {/* Durée PRÉDITE avec la même source de vérité que le
                            calage : le débit mesuré de la voix de cette langue. */}
                        ≈{" "}
                        {predictSeconds(
                          (scene.narration ?? "").trim().length,
                          cpsFor(viewLang),
                          speedFor(viewLang),
                        ).toFixed(1)}{" "}
                        s de voix
                        {predictSeconds(
                          (scene.narration ?? "").trim().length,
                          cpsFor(viewLang),
                          speedFor(viewLang),
                        ) > 8 &&
                          " — plus long que le clip, le plan sera légèrement ralenti"}
                      </p>

                      {/* Action principale visible, le reste dans un menu. */}
                      <div className="flex flex-wrap items-center gap-2">
                        {/* La longueur du clip se cale sur la voix off la plus
                            longue de toutes les langues produites : sans ces
                            voix, on paierait un clip trop court. */}
                        <button
                          onClick={() => onVideo(scene, undefined, script, clipSecondsFor(st))}
                          disabled={
                            st.videoLoading ||
                            !imagesValidated ||
                            !hasAllVoices(st) ||
                            durationOverflow.length > 0
                          }
                          title={
                            durationOverflow.length
                              ? durationBlockMessage
                              : hasAllVoices(st)
                                ? undefined
                                : "Génère d'abord les voix off de toutes les langues : la longueur du plan s'y cale."
                          }
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

      {/* DIALOGUE DE CONFIRMATION — remplace window.confirm. */}
      <AlertDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          setConfirmOpen(open);
          if (!open) {
            confirmOpenRef.current = false;
            const resolve = confirmResolverRef.current;
            confirmResolverRef.current = null;
            resolve?.(false);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Lancer la génération ?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-1.5 text-left text-sm text-muted-foreground">
                <p>
                  {confirmPayload?.clips} clip{confirmPayload && confirmPayload.clips > 1 ? "s" : ""} ×{" "}
                  {confirmPayload?.perClip} s payés une seule fois, quel que soit le nombre de langues.
                </p>
                <p>{confirmPayload?.seconds} s de vidéo IA au total.</p>
                <p>
                  {confirmPayload?.voices} voix off réparties sur {confirmPayload?.languages} langue
                  {confirmPayload && confirmPayload.languages > 1 ? "s" : ""}.
                </p>
                {!!confirmPayload?.ctaSaving && (
                  <p className="text-foreground">
                    En décochant le plan CTA Sophia dans Paramètres, tu économiserais{" "}
                    {confirmPayload.ctaSaving} s de vidéo IA.
                  </p>
                )}
                <p>Plafond actuel : {settings.spendCapSeconds ?? 72} s de vidéo IA par vidéo.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={onCancelLaunch}>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirmLaunch}>Lancer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
