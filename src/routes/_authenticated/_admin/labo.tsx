/**
 * BANC D'ESSAI — chaque étape testée séparément, prompt modifiable à la main.
 * Rien ne s'exécute au chargement (hors lecture gratuite des briefs), rien
 * n'est écrit en production. Seule écriture : « Ajouter à la file ».
 */
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Toaster } from "@/components/ui/sonner";
import { getLabDefaults } from "@/lib/labo.functions";
import { LANGUAGES, MASTER_LANGUAGES } from "@/lib/languages";
import { findMechanicalWords } from "@/lib/mechanical-metaphors";
import { composeSlide, DEFAULT_SLIDE_STYLE } from "@/lib/slide-compose";
import {
  findOverlongSlides,
  SLIDESHOW_FORMATS,
  slideshowFormatById,
  slideshowWritingBrief,
} from "@/lib/slideshow-formats";
import { previewSlideshowWriting } from "@/lib/slideshows.functions";
import {
  findWeakOpening,
  pickStoryStyle,
  STORY_STYLES,
  storyStyleBrief,
  storyStyleById,
} from "@/lib/story-styles";
import {
  generateSceneImage,
  generateSceneVoice,
  generateScript,
  listVoices,
  searchVoices,
} from "@/lib/studio.functions";
import {
  DEFAULT_QUALITY,
  DEFAULT_VISUAL_BRIEF,
  loadSettings,
  NARRATION_LABELS,
  V2_WRITING_BRIEF_COMMON,
  VISUAL_LABELS,
  type NarrationStyleId,
  type VisualStyleId,
} from "@/lib/style-presets";
import { addTopic, nextValidatedTopic, previewTopics } from "@/lib/topics.functions";

export const Route = createFileRoute("/_authenticated/_admin/labo")({
  head: () => ({
    meta: [
      { title: "Banc d'essai — tester chaque étape" },
      { name: "description", content: "Essais séparés des sujets, scripts, images, voix et slideshows, sans production." },
      { property: "og:title", content: "Banc d'essai — tester chaque étape" },
      { property: "og:description", content: "Modifier les prompts à la main et tester une étape à la fois." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LaboPage,
});

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const countWords = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;
const selectCls = "h-10 rounded-md border border-input bg-background px-2 text-sm";

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-4">
      <h2 className="section-title">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      {children}
    </label>
  );
}

function PromptArea({
  label,
  value,
  onChange,
  initial,
  rows = 6,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  initial: string;
  rows?: number;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {label}
          {value !== initial && <span className="ml-2 text-primary">(modifié pour cet essai)</span>}
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange(initial)}>
          <RotateCcw className="size-3" /> Réinitialiser
        </Button>
      </div>
      <Textarea rows={rows} value={value} onChange={(e) => onChange(e.target.value)} className="font-mono text-xs" />
    </div>
  );
}

function RunButton({
  label,
  cost,
  busy,
  disabled,
  onClick,
}: {
  label: string;
  cost: string;
  busy: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <Button onClick={onClick} disabled={busy || disabled}>
        {busy && <Loader2 className="size-4 animate-spin" />}
        {label}
      </Button>
      <span className="text-xs text-muted-foreground">Coût : {cost}</span>
    </div>
  );
}

function Alert({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {children}
    </div>
  );
}

function LaboPage() {
  return (
    <div className="page space-y-6">
      <Toaster />
      <header>
        <h1 className="page-title">Banc d'essai</h1>
        <p className="page-lede">
          Chaque panneau teste une seule étape. Les prompts modifiés ici ne changent jamais les Paramètres, et rien n'est
          écrit en production.
        </p>
      </header>
      <TopicsPanel />
      <ScriptPanel />
      <ImagePanel />
      <VoicePanel />
      <SlideshowPanel />
    </div>
  );
}

// ---------- 1. Sujets ----------

type Proposed = { topic: string; angle: string; lever: string; category: string };

function TopicsPanel() {
  const fetchDefaults = useServerFn(getLabDefaults);
  const propose = useServerFn(previewTopics);
  const add = useServerFn(addTopic);
  const [initial, setInitial] = useState("");
  const [brief, setBrief] = useState("");
  const [count, setCount] = useState(10);
  const [style, setStyle] = useState<NarrationStyleId>("revelation");
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<(Proposed & { format: "video" | "slideshow" | "both"; added?: boolean })[]>([]);

  useEffect(() => {
    fetchDefaults()
      .then((d) => {
        setInitial(d.topicBrief);
        setBrief(d.topicBrief);
      })
      .catch((e) => toast.error(errMsg(e)));
  }, [fetchDefaults]);

  const run = async () => {
    setBusy(true);
    try {
      const res = await propose({ data: { count, narrationStyle: style as never, brief } });
      setRows(res.topics.map((t) => ({ ...t, format: "video" as const })));
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="1 — Sujets">
      <div className="flex flex-wrap gap-3">
        <Field label="Nombre (5 à 30)">
          <Input type="number" min={5} max={30} value={count} className="w-24"
            onChange={(e) => setCount(Math.min(30, Math.max(5, Number(e.target.value) || 5)))} />
        </Field>
        <Field label="Style de narration">
          <select className={selectCls} value={style} onChange={(e) => setStyle(e.target.value as NarrationStyleId)}>
            {(Object.keys(NARRATION_LABELS) as NarrationStyleId[]).map((id) => (
              <option key={id} value={id}>{NARRATION_LABELS[id]}</option>
            ))}
          </select>
        </Field>
      </div>
      <PromptArea label="Brief de sujets (intrigue + viral)" value={brief} onChange={setBrief} initial={initial} rows={8} />
      <RunButton label="Proposer" cost="texte, négligeable" busy={busy} onClick={run} />
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr><th className="p-1">Sujet</th><th className="p-1">Angle</th><th className="p-1">Levier</th><th className="p-1" /></tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-border align-top">
                  <td className="p-1">{r.topic}</td>
                  <td className="p-1 text-muted-foreground">{r.angle}</td>
                  <td className="p-1 text-muted-foreground">{r.lever}</td>
                  <td className="space-y-1 p-1">
                    <select className={selectCls} value={r.format}
                      onChange={(e) => setRows((p) => p.map((x, j) => (j === i ? { ...x, format: e.target.value as never } : x)))}>
                      <option value="video">video</option>
                      <option value="slideshow">slideshow</option>
                      <option value="both">both</option>
                    </select>
                    <Button size="sm" variant="outline" disabled={r.added}
                      onClick={async () => {
                        try {
                          await add({ data: {
                            topic: r.topic,
                            angle: [r.angle, r.lever ? `Levier : ${r.lever}` : ""].filter(Boolean).join(" — "),
                            narrationStyle: style as never,
                            category: r.category as never,
                            status: "valide",
                            format: r.format,
                          } });
                          setRows((p) => p.map((x, j) => (j === i ? { ...x, added: true } : x)));
                          toast.success("Sujet ajouté à la file");
                        } catch (e) {
                          toast.error(errMsg(e));
                        }
                      }}>
                      {r.added ? "Ajouté" : "Ajouter à la file"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

// ---------- 2. Script vidéo ----------

type ScriptOut = { title: string; hook: string; scenes: { index: number; narration: string }[] };
const TU_RE = /\b(tu|ton|ta|tes|toi)\b/i;

function ScriptPanel() {
  const write = useServerFn(generateScript);
  const nextTopic = useServerFn(nextValidatedTopic);
  const [topic, setTopic] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [styleChoice, setStyleChoice] = useState<string>("auto");
  const [common, setCommon] = useState(V2_WRITING_BRIEF_COMMON);
  const [sceneCount, setSceneCount] = useState(6);
  const [language, setLanguage] = useState("fr");
  const [target, setTarget] = useState(60);
  const [busy, setBusy] = useState(false);
  const [script, setScript] = useState<ScriptOut | null>(null);

  const style = useMemo(
    () => (styleChoice === "auto" ? pickStoryStyle(topic, category) : storyStyleById(styleChoice) ?? STORY_STYLES[0]!),
    [styleChoice, topic, category],
  );
  const styleInitial = storyStyleBrief(style);
  const [styleBrief, setStyleBrief] = useState(styleInitial);
  useEffect(() => { setStyleBrief(styleInitial); }, [styleInitial]);

  const run = async () => {
    setBusy(true);
    try {
      const res = await write({ data: {
        topic, kind: "culture", sceneCount, language: language as never, targetSeconds: target,
        includeCta: false, extraBrief: `${styleBrief}\n${common}`,
      } });
      setScript(res as unknown as ScriptOut);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const scenes = script?.scenes ?? [];
  const weak = scenes[0] ? findWeakOpening(scenes[0].narration) : null;
  const mech = scenes.map((s, i) => ({ i: i + 1, words: findMechanicalWords(s.narration) })).filter((x) => x.words.length);
  const tuPlans = style.tutoiement ? [] : scenes.map((s, i) => (TU_RE.test(s.narration) ? i + 1 : 0)).filter(Boolean);

  return (
    <Panel title="2 — Script vidéo">
      <div className="flex gap-2">
        <Input placeholder="Sujet" value={topic} onChange={(e) => { setTopic(e.target.value); setCategory(null); }} />
        <Button variant="outline" onClick={async () => {
          try {
            const r = await nextTopic();
            if (!r.topic) { toast.info("Aucun sujet validé dans la file"); return; }
            setTopic(r.topic.topic);
            setCategory(r.topic.category);
          } catch (e) { toast.error(errMsg(e)); }
        }}>Prendre un sujet validé de la file</Button>
      </div>
      <div className="flex flex-wrap gap-3">
        <Field label="Forme d'histoire">
          <select className={selectCls} value={styleChoice} onChange={(e) => setStyleChoice(e.target.value)}>
            <option value="auto">Automatique</option>
            {STORY_STYLES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </Field>
        <Field label="Plans"><Input type="number" min={3} max={8} value={sceneCount} className="w-20"
          onChange={(e) => setSceneCount(Math.min(8, Math.max(3, Number(e.target.value) || 3)))} /></Field>
        <Field label="Langue">
          <select className={selectCls} value={language} onChange={(e) => setLanguage(e.target.value)}>
            {LANGUAGES.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
        </Field>
        <Field label="Durée cible (s)"><Input type="number" min={15} max={90} value={target} className="w-20"
          onChange={(e) => setTarget(Math.min(90, Math.max(15, Number(e.target.value) || 60)))} /></Field>
      </div>
      <p className="text-sm">
        Forme {styleChoice === "auto" ? "calculée" : "choisie"} : <strong>{style.label}</strong> —{" "}
        {style.tutoiement ? "tutoiement autorisé" : "tutoiement interdit"}
      </p>
      <PromptArea label="Bloc de la forme" value={styleBrief} onChange={setStyleBrief} initial={styleInitial} />
      <PromptArea label="Tronc commun" value={common} onChange={setCommon} initial={V2_WRITING_BRIEF_COMMON} />
      <RunButton label="Écrire le script" cost="texte, négligeable" busy={busy} disabled={topic.trim().length < 3} onClick={run} />
      {script && (
        <div className="space-y-2">
          {weak && <Alert>Ouverture faible : « {weak} »</Alert>}
          {mech.map((m) => <Alert key={m.i}>Plan {m.i} — métaphore mécanique : {m.words.join(", ")}</Alert>)}
          {tuPlans.length > 0 && <Alert>Tutoiement non autorisé par cette forme, plans : {tuPlans.join(", ")}</Alert>}
          <h3 className="font-semibold">{script.title}</h3>
          <p className="text-sm italic">{script.hook}</p>
          <ol className="space-y-2">
            {scenes.map((s, i) => (
              <li key={i} className="rounded-md border border-border p-2 text-sm">
                <div className="text-xs text-muted-foreground">
                  Plan {i + 1} · {countWords(s.narration)} mots · {s.narration.length} caractères
                </div>
                {s.narration}
              </li>
            ))}
          </ol>
          <Button variant="outline" onClick={() => {
            const txt = [script.title, "", ...scenes.map((s, i) => `${i + 1}. ${s.narration}`)].join("\n");
            navigator.clipboard.writeText(txt).then(() => toast.success("Script copié"));
          }}>Copier le script</Button>
        </div>
      )}
    </Panel>
  );
}

// ---------- 3. Images ----------

type ImgRun = { url: string; prompt: string; visualBrief: string; quality: string; bible: string; visual: VisualStyleId; square: boolean };

function ImagePanel() {
  const gen = useServerFn(generateSceneImage);
  const [visual, setVisual] = useState<VisualStyleId>("papercraft_v2");
  const [settings, setSettings] = useState<ReturnType<typeof loadSettings> | null>(null);
  useEffect(() => { setSettings(loadSettings()); }, []);
  const briefInitial = settings?.visual[visual]?.brief ?? DEFAULT_VISUAL_BRIEF[visual];
  const qualityInitial = settings?.visual[visual]?.quality ?? DEFAULT_QUALITY[visual];
  const [prompt, setPrompt] = useState("");
  const [visualBrief, setVisualBrief] = useState(briefInitial);
  const [quality, setQuality] = useState(qualityInitial);
  const [bible, setBible] = useState("");
  const [square, setSquare] = useState(true);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<ImgRun[]>([]);
  const [current, setCurrent] = useState<ImgRun | null>(null);
  const [skipReset, setSkipReset] = useState(false);
  useEffect(() => {
    if (skipReset) {
      setSkipReset(false);
      return;
    }
    setVisualBrief(briefInitial);
    setQuality(qualityInitial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [briefInitial, qualityInitial]);

  const run = async () => {
    setBusy(true);
    try {
      const res = await gen({ data: {
        imagePrompt: prompt, visual, square,
        visualBrief: visualBrief || undefined, quality: quality || undefined, bible: bible || undefined,
      } });
      const r: ImgRun = { url: res.dataUrl, prompt, visualBrief, quality, bible, visual, square };
      setCurrent(r);
      setHistory((h) => [r, ...h].slice(0, 6));
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const restore = (r: ImgRun) => {
    if (r.visual !== visual) setSkipReset(true);
    setVisual(r.visual); setPrompt(r.prompt); setVisualBrief(r.visualBrief);
    setQuality(r.quality); setBible(r.bible); setSquare(r.square); setCurrent(r);
  };

  return (
    <Panel title="3 — Images">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Style visuel">
          <select className={selectCls} value={visual} onChange={(e) => setVisual(e.target.value as VisualStyleId)}>
            {(Object.keys(VISUAL_LABELS) as VisualStyleId[]).map((id) => <option key={id} value={id}>{VISUAL_LABELS[id]}</option>)}
          </select>
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={square} onChange={(e) => setSquare(e.target.checked)} /> Carré
        </label>
      </div>
      <Field label="Prompt de l'image">
        <Textarea rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      </Field>
      <PromptArea label="Brief visuel" value={visualBrief} onChange={setVisualBrief} initial={briefInitial} />
      <PromptArea label="Qualité" value={quality} onChange={setQuality} initial={qualityInitial} rows={3} />
      <Field label="Bible visuelle (libre)">
        <Textarea rows={2} value={bible} onChange={(e) => setBible(e.target.value)} />
      </Field>
      <RunButton label="Générer l'image" cost="1 image" busy={busy} disabled={prompt.trim().length < 3} onClick={run} />
      {current && <img src={current.url} alt={current.prompt} className="mx-auto max-h-[640px] rounded-md" />}
      {history.length > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {history.map((h, i) => (
            <div key={i} className="space-y-1 rounded-md border border-border p-2 text-xs">
              <img src={h.url} alt={h.prompt} className="w-full rounded" />
              <div className="font-medium">{VISUAL_LABELS[h.visual]}</div>
              <div className="line-clamp-3">{h.prompt}</div>
              <div className="line-clamp-3 text-muted-foreground">{h.visualBrief}</div>
              <Button size="sm" variant="outline" onClick={() => restore(h)}>Reprendre ces réglages</Button>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

// ---------- 4. Narration ----------

type VoiceRun = { url: string; voice: string; chars: number; duration: number | null };

function VoicePanel() {
  const speak = useServerFn(generateSceneVoice);
  const list = useServerFn(listVoices);
  const search = useServerFn(searchVoices);
  const [text, setText] = useState("");
  const [language, setLanguage] = useState("fr");
  const [voices, setVoices] = useState<{ id: string; label: string }[]>([]);
  const [voice, setVoice] = useState("");
  const [query, setQuery] = useState("");
  const [speed, setSpeed] = useState(1);
  const [busy, setBusy] = useState(false);
  const [runs, setRuns] = useState<VoiceRun[]>([]);
  useEffect(() => { setSpeed(Math.min(1.15, Math.max(0.95, loadSettings().voiceSpeed))); }, []);

  const chars = text.trim().length;
  const loadVoices = async () => {
    try {
      const r = query.trim()
        ? await search({ data: { query: query.trim(), language } })
        : await list({ data: { language } });
      setVoices(r.voices);
      if (r.voices[0] && !r.voices.some((v) => v.id === voice)) setVoice(r.voices[0].id);
    } catch (e) { toast.error(errMsg(e)); }
  };

  const run = async () => {
    setBusy(true);
    try {
      const res = await speak({ data: { text: text.trim(), voice, engine: "elevenlabs", language: language as never, speed } });
      const label = voices.find((v) => v.id === voice)?.label ?? voice;
      const r: VoiceRun = { url: res.audioDataUrl, voice: label, chars, duration: null };
      setRuns((p) => [r, ...p].slice(0, 3));
      const a = new Audio(res.audioDataUrl);
      a.addEventListener("loadedmetadata", () => {
        setRuns((p) => p.map((x) => (x.url === r.url ? { ...x, duration: a.duration } : x)));
      });
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="4 — Narration">
      <Field label="Texte à lire"><Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} /></Field>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Langue">
          <select className={selectCls} value={language} onChange={(e) => setLanguage(e.target.value)}>
            {LANGUAGES.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
        </Field>
        <Field label="Recherche de voix">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="nom (vide = liste)" className="w-44" />
        </Field>
        <Button variant="outline" onClick={loadVoices}>Charger les voix</Button>
        <Field label="Voix">
          <select className={selectCls} value={voice} onChange={(e) => setVoice(e.target.value)}>
            {voices.length === 0 && <option value="">— charger les voix —</option>}
            {voices.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select>
        </Field>
        <Field label={`Vitesse (${speed.toFixed(2)})`}>
          <input type="range" min={0.95} max={1.15} step={0.01} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} />
        </Field>
      </div>
      <RunButton label="Générer la voix" cost={`${chars} caractères ElevenLabs`} busy={busy}
        disabled={chars < 2 || !voice} onClick={run} />
      {runs.map((r, i) => (
        <div key={r.url} className="space-y-1 rounded-md border border-border p-2 text-sm">
          <div className="text-xs text-muted-foreground">Essai {i + 1} · {r.voice}</div>
          <audio controls src={r.url} className="w-full" />
          <div>
            Durée : <strong>{r.duration ? `${r.duration.toFixed(2)} s` : "…"}</strong> · Débit :{" "}
            <strong>{r.duration ? `${(r.chars / r.duration).toFixed(2)} car./s` : "…"}</strong>
          </div>
        </div>
      ))}
    </Panel>
  );
}

// ---------- 5. Slideshow ----------

type Slide = { index: number; kind: string; text: string; imagePrompt: string; image?: string; composed?: string; busy?: boolean };

function SlideshowPanel() {
  const write = useServerFn(previewSlideshowWriting);
  const gen = useServerFn(generateSceneImage);
  const [topic, setTopic] = useState("");
  const [formatId, setFormatId] = useState("quiz");
  const format = slideshowFormatById(formatId) ?? SLIDESHOW_FORMATS[0]!;
  const [n, setN] = useState(format.slides.min);
  const [language, setLanguage] = useState("fr");
  const briefInitial = slideshowWritingBrief(format, n);
  const [brief, setBrief] = useState(briefInitial);
  useEffect(() => { setBrief(briefInitial); }, [briefInitial]);
  const [imgStyle, setImgStyle] = useState("");
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<{ title: string; caption: string; hashtags: string[] } | null>(null);
  const [slides, setSlides] = useState<Slide[]>([]);

  const overlong = new Set(findOverlongSlides(slides).map((s) => s.index));
  const patchSlide = (i: number, v: Partial<Slide>) => setSlides((p) => p.map((s) => (s.index === i ? { ...s, ...v } : s)));

  const run = async () => {
    setBusy(true);
    try {
      const r = await write({ data: { topic, format: formatId, slideCount: n, language: language as never, brief } });
      setOut({ title: r.title, caption: r.caption, hashtags: r.hashtags });
      setSlides(r.slides);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const genImage = async (s: Slide) => {
    patchSlide(s.index, { busy: true });
    try {
      const prompt = [s.imagePrompt, imgStyle.trim()].filter(Boolean).join("\n\n").slice(0, 2000);
      const r = await gen({ data: { imagePrompt: prompt, visual: "documentaire", square: true } });
      const blob = await composeSlide(r.dataUrl, s.text, DEFAULT_SLIDE_STYLE);
      patchSlide(s.index, { image: r.dataUrl, composed: URL.createObjectURL(blob), busy: false });
    } catch (e) {
      toast.error(errMsg(e));
      patchSlide(s.index, { busy: false });
    }
  };

  return (
    <Panel title="5 — Slideshow">
      <Input placeholder="Sujet" value={topic} onChange={(e) => setTopic(e.target.value)} />
      <div className="flex flex-wrap gap-3">
        <Field label="Format">
          <select className={selectCls} value={formatId} onChange={(e) => {
            const f = slideshowFormatById(e.target.value);
            setFormatId(e.target.value);
            if (f) setN(f.slides.min);
          }}>
            {SLIDESHOW_FORMATS.map((f) => <option key={f.id} value={f.id}>{f.label}{f.actif ? "" : " (inactif)"}</option>)}
          </select>
        </Field>
        <Field label={`Slides (${format.slides.min}–${format.slides.max})`}>
          <Input type="number" min={format.slides.min} max={format.slides.max} value={n} className="w-20"
            onChange={(e) => setN(Math.min(format.slides.max, Math.max(format.slides.min, Number(e.target.value) || format.slides.min)))} />
        </Field>
        <Field label="Langue">
          <select className={selectCls} value={language} onChange={(e) => setLanguage(e.target.value)}>
            {MASTER_LANGUAGES.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
        </Field>
      </div>
      <PromptArea label="Brief d'écriture" value={brief} onChange={setBrief} initial={briefInitial} rows={10} />
      <RunButton label="Écrire le slideshow" cost="texte, négligeable" busy={busy} disabled={topic.trim().length < 3} onClick={run} />
      {out && (
        <div className="space-y-3">
          <div className="text-sm">
            <strong>{out.title}</strong>
            <p className="text-muted-foreground">{out.caption}</p>
            <p className="text-xs text-muted-foreground">{out.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}</p>
          </div>
          <Field label="Style d'image commun aux slides (libre, en anglais de préférence)">
            <Textarea rows={2} value={imgStyle} onChange={(e) => setImgStyle(e.target.value)} />
          </Field>
          <div className="grid gap-3 md:grid-cols-2">
            {slides.map((s) => (
              <div key={s.index} className="space-y-2 rounded-md border border-border p-2 text-sm">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>#{s.index + 1} · {s.kind} · {countWords(s.text)} mots</span>
                  {overlong.has(s.index) && <span className="rounded-full bg-destructive px-2 py-0.5 text-destructive-foreground">trop long</span>}
                </div>
                <p>{s.text}</p>
                <p className="text-xs text-muted-foreground">{s.imagePrompt}</p>
                {s.composed && <img src={s.composed} alt={s.text} className="w-full rounded" />}
                <RunButton label={s.image ? "Régénérer cette image" : "Générer cette image"} cost="1 image"
                  busy={Boolean(s.busy)} onClick={() => genImage(s)} />
              </div>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}
