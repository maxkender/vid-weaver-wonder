import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, ImagePlus, Loader2, Play, Plus, RefreshCw, Save, Shuffle, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { MASTER_LANGUAGES, languageLabel } from "@/lib/languages";
import { findOverlongSlides, SLIDESHOW_FORMATS, slideshowFormatById } from "@/lib/slideshow-formats";
import { normalizeSlideCount, normalizeSlideKind, slideBreakdown, slideCountStep } from "@/lib/slide-kind";
import { composeSlide } from "@/lib/slide-compose";
import {
  createSlideshowJob,
  deleteSlideshowJob,
  getSlideshowJob,
  listActiveSlideshowLanguages,
  listSlideshowJobs,
  pickSlideshowTopic,
  regenerateSlideshowImage,
  runSlideshowTickNow,
  updateSlideshowJob,
  type SlideshowJobDetail,
  type SlideshowJobRow,
} from "@/lib/slideshows.functions";

export const Route = createFileRoute("/_authenticated/_admin/slideshows")({
  head: () => ({
    meta: [
      { title: "Slideshows — production des quiz" },
      { name: "description", content: "Lancement, relecture et correction des slideshows multilingues." },
      { property: "og:title", content: "Slideshows — production des quiz" },
      { property: "og:description", content: "Suivi des slideshows : écriture, images partagées, publication par langue." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SlideshowsPage,
});

const RUNNING = (s: string) => !["done", "error", "cancelled"].includes(s);

const STEP_LABEL: Record<string, string> = {
  queued: "En attente d'écriture",
  ecriture: "Écriture du script",
  traduction: "Traduction des langues",
  images: "Génération des images",
  publication: "Publication",
  done: "Terminé",
  error: "Erreur",
};
const stepLabel = (s: string | null, status: string) =>
  STEP_LABEL[status === "images" ? "images" : s ?? status] ?? s ?? status;

const KIND_LABEL: Record<string, string> = {
  hook: "accroche",
  question: "question",
  reponse: "réponse",
  beat: "beat",
  final: "chute",
};

function SlideshowsPage() {
  const [jobs, setJobs] = useState<SlideshowJobRow[]>([]);
  const [paused, setPaused] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [auto, setAuto] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detailKey, setDetailKey] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const r = await listSlideshowJobs();
      setJobs(r.jobs);
      setPaused(r.paused ? r.pausedReason ?? "En pause" : null);
      return r.jobs;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Chargement impossible");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Enchaînement automatique : un tick toutes les 3 s tant qu'un job tourne.
  const autoRef = useRef(auto);
  autoRef.current = auto;
  useEffect(() => {
    if (!auto) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const loop = async () => {
      if (stop || !autoRef.current) return;
      try {
        const r = await runSlideshowTickNow();
        if (r.paused) {
          toast.error("Chaîne slideshow en pause : enchaînement arrêté.");
          setAuto(false);
          return;
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Tick impossible");
        setAuto(false);
        return;
      }
      const list = await refresh();
      setDetailKey((k) => k + 1);
      if (!list || !list.some((j) => RUNNING(j.status))) {
        toast.success("Plus aucun job en cours : enchaînement arrêté.");
        setAuto(false);
        return;
      }
      if (!stop) timer = setTimeout(loop, 3000);
    };
    void loop();
    return () => {
      stop = true;
      if (timer) clearTimeout(timer);
    };
  }, [auto, refresh]);

  const tick = async () => {
    setBusy(true);
    try {
      const r = await runSlideshowTickNow();
      toast.message(r.paused ? "Chaîne en pause" : r.idle ? "Rien à faire" : `Tick : ${r.status ?? ""}`);
      await refresh();
      setDetailKey((k) => k + 1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Tick impossible");
    } finally {
      setBusy(false);
    }
  };

  const hasRunning = jobs.some((j) => RUNNING(j.status));

  return (
    <div className="min-h-screen bg-background px-4 py-4">
      <Toaster position="top-center" />
      <h1 className="mb-3 text-[15px] font-semibold tracking-tight">Slideshows</h1>
      {paused ? (
        <p className="mb-3 rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-xs">
          Chaîne slideshow en pause : {paused}
        </p>
      ) : null}

      <LaunchForm onCreated={refresh} />

      <div className="mb-4 flex flex-wrap items-center gap-4 rounded-lg border border-border bg-card p-3 text-xs">
        <Button variant="secondary" size="sm" onClick={tick} disabled={busy || auto}>
          {busy ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Play className="mr-1.5 size-4" />}
          Faire tourner un tick
        </Button>
        <label className="flex items-center gap-2">
          <Switch checked={auto} onCheckedChange={(v) => setAuto(v)} disabled={!hasRunning && !auto} />
          <span>
            Enchaîner automatiquement <span className="text-muted-foreground">(chaque tick peut générer des images)</span>
          </span>
        </label>
        {auto ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
      </div>

      {loading ? (
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      ) : jobs.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun slideshow pour l'instant.</p>
      ) : (
        <div className="space-y-2">
          {jobs.map((j) => {
            const open = openId === j.id;
            return (
              <div key={j.id} className="rounded-lg border border-border bg-card text-xs">
                <div
                  className="flex cursor-pointer items-start justify-between gap-2 p-3"
                  onClick={() => setOpenId(open ? null : j.id)}
                >
                  <div className="flex min-w-0 gap-2">
                    {open ? <ChevronDown className="mt-0.5 size-4 shrink-0" /> : <ChevronRight className="mt-0.5 size-4 shrink-0" />}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{j.topic ?? "—"}</p>
                      <p className="text-muted-foreground">
                        {slideshowFormatById(j.format)?.label ?? j.format} · {j.languages.join(", ")} · {j.slide_count} slides ·
                        diffusion {j.publish_date ?? "jour du rendu"} · tentatives {j.attempts}
                      </p>
                      <p className="mt-1">
                        <b>{stepLabel(j.step, j.status)}</b> · images {j.images_done}/{j.slide_count}
                      </p>
                      {j.error ? <p className="mt-1 text-destructive">{j.error}</p> : null}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (!confirm("Supprimer ce slideshow ?")) return;
                      await deleteSlideshowJob({ data: { id: j.id } });
                      await refresh();
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                <div className="px-3 pb-3">
                  <Progress value={j.slide_count ? (j.images_done / j.slide_count) * 100 : 0} className="h-1.5" />
                </div>
                {open ? <JobDetail id={j.id} reloadKey={detailKey} onChanged={refresh} /> : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------- A. Formulaire de lancement ----------

function LaunchForm({ onCreated }: { onCreated: () => Promise<unknown> }) {
  const [topic, setTopic] = useState("");
  const [category, setCategory] = useState<string | undefined>();
  const [formatId, setFormatId] = useState("quiz");
  const format = slideshowFormatById(formatId)!;
  const [count, setCount] = useState(format.slides.min);
  const [langs, setLangs] = useState<string[]>([]);
  const [publishDate, setPublishDate] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listActiveSlideshowLanguages()
      .then((r) => setLangs(r.languages))
      .catch(() => setLangs(MASTER_LANGUAGES.map((l) => l.id)));
  }, []);

  useEffect(() => {
    setCount((c) => normalizeSlideCount(format, c));
  }, [format]);

  const valid = normalizeSlideCount(format, count) === count;

  const pick = async () => {
    try {
      const r = await pickSlideshowTopic();
      setTopic(r.topic);
      setCategory(r.category ?? undefined);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Aucun sujet");
    }
  };

  const launch = async () => {
    if (!valid) {
      toast.error("Nombre de slides invalide pour ce format.");
      return;
    }
    if (!confirm(`Lancer ce slideshow ? ${count} images seront générées au fil des ticks.`)) return;
    setBusy(true);
    try {
      await createSlideshowJob({
        data: {
          topic: topic.trim() || undefined,
          topicCategory: category,
          format: formatId,
          languages: langs,
          slideCount: count,
          publishDate: publishDate || undefined,
        } as never,
      });
      setTopic("");
      setCategory(undefined);
      toast.success("Slideshow en file");
      await onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Création impossible");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-4 rounded-lg border border-border bg-card p-3 text-xs">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-64 flex-1">
          <label className="text-muted-foreground">Sujet</label>
          <div className="flex gap-1.5">
            <Input value={topic} onChange={(e) => { setTopic(e.target.value); setCategory(undefined); }} placeholder="Ex. Les grandes batailles" />
            <Button variant="outline" size="sm" className="h-9" onClick={pick} type="button">
              <Shuffle className="mr-1 size-3.5" /> Prendre un sujet validé
            </Button>
          </div>
        </div>
        <div>
          <label className="text-muted-foreground">Format</label>
          <select
            className="block h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={formatId}
            onChange={(e) => setFormatId(e.target.value)}
          >
            {SLIDESHOW_FORMATS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}{f.actif ? "" : " (à tester)"}
              </option>
            ))}
          </select>
        </div>
        <div className="w-44">
          <label className="text-muted-foreground">Nombre de slides</label>
          <Input
            type="number"
            min={format.slides.min}
            max={format.slides.max}
            step={slideCountStep(format)}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
          />
          <p className={valid ? "mt-1 text-muted-foreground" : "mt-1 text-destructive"}>
            {valid
              ? slideBreakdown(format, count)
              : `Entre ${format.slides.min} et ${format.slides.max}${slideCountStep(format) === 2 ? ", nombre pair" : ""}`}
          </p>
        </div>
        <div>
          <label className="text-muted-foreground">Langues</label>
          <div className="flex h-9 items-center gap-2">
            {MASTER_LANGUAGES.map((l) => (
              <label key={l.id} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={l.id === "fr" || langs.includes(l.id)}
                  disabled={l.id === "fr"}
                  onChange={(e) =>
                    setLangs((cur) => (e.target.checked ? [...new Set([...cur, l.id])] : cur.filter((x) => x !== l.id)))
                  }
                />
                {l.id.toUpperCase()}
              </label>
            ))}
          </div>
        </div>
        <div>
          <label className="text-muted-foreground">Date de diffusion</label>
          <Input type="date" value={publishDate} onChange={(e) => setPublishDate(e.target.value)} />
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Button onClick={launch} disabled={busy || !valid}>
          <Plus className="mr-1.5 size-4" /> Lancer un slideshow
        </Button>
        <span className="text-muted-foreground">
          Coût : <b>{valid ? count : "?"} images</b> seront générées (partagées par toutes les langues).
        </span>
      </div>
    </div>
  );
}

// ---------- B. Détail d'un job ----------

function JobDetail({ id, reloadKey, onChanged }: { id: string; reloadKey: number; onChanged: () => Promise<unknown> }) {
  const [job, setJob] = useState<SlideshowJobDetail | null>(null);
  const [lang, setLang] = useState("fr");
  const [imgBusy, setImgBusy] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    try {
      setJob(await getSlideshowJob({ data: { id } }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Chargement impossible");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  const langs = useMemo(() => (job ? Object.keys(job.textes) : []), [job]);
  useEffect(() => {
    if (langs.length && !langs.includes(lang)) setLang(langs[0]!);
  }, [langs, lang]);

  if (!job) return <div className="px-3 pb-3"><Loader2 className="size-4 animate-spin" /></div>;

  const texte = job.textes[lang];
  const overlong = new Set(findOverlongSlides(texte?.slides ?? []).map((s) => s.index));

  const save = async (patch: Record<string, unknown>) => {
    let propagate = false;
    if (job.published && (patch["textes"] || patch["imagePrompts"])) {
      propagate = confirm("Ce slideshow est déjà publié. Répercuter aussi sur la version publiée ?");
    }
    try {
      const r = await updateSlideshowJob({ data: { jobId: job.id, patch, propagate } as never });
      toast.success(propagate ? `Enregistré (${r.propagated} version(s) publiée(s) mise(s) à jour)` : "Enregistré");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enregistrement impossible");
    }
  };

  const regen = async (index: number) => {
    setImgBusy((s) => new Set(s).add(index));
    try {
      await regenerateSlideshowImage({ data: { jobId: job.id, index } });
      await load();
      await onChanged();
    } catch (e) {
      toast.error(`Slide ${index + 1} : ${e instanceof Error ? e.message : "échec"}`);
    } finally {
      setImgBusy((s) => { const n = new Set(s); n.delete(index); return n; });
    }
  };

  const regenAll = async () => {
    if (!confirm(`Tout régénérer ? ${job.slides.length} images seront générées (et payées), les anciennes écrasées.`)) return;
    for (const s of job.slides) await regen(s.index);
  };

  return (
    <div className="border-t border-border p-3">
      <div className="mb-3 grid gap-1 sm:grid-cols-2">
        <p><span className="text-muted-foreground">Sujet :</span> {job.topic ?? "—"}</p>
        <p><span className="text-muted-foreground">Format :</span> {slideshowFormatById(job.format)?.label ?? job.format}</p>
        <p><span className="text-muted-foreground">Statut :</span> {job.status} · {stepLabel(job.step, job.status)}</p>
        <p><span className="text-muted-foreground">Tentatives :</span> {job.attempts} · {job.published ? "publié" : "non publié"}</p>
        {job.error ? <p className="text-destructive sm:col-span-2">{job.error}</p> : null}
      </div>

      {job.slides.length === 0 ? (
        <p className="text-muted-foreground">Le script n'est pas encore écrit.</p>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {langs.map((l) => (
              <Button key={l} size="sm" variant={l === lang ? "default" : "outline"} onClick={() => setLang(l)}>
                {languageLabel(l)}
              </Button>
            ))}
            <div className="flex-1" />
            <Button size="sm" variant="outline" onClick={regenAll} disabled={imgBusy.size > 0}>
              <RefreshCw className="mr-1 size-3.5" /> Tout régénérer ({job.slides.length} images)
            </Button>
          </div>

          {texte ? <MetaEditor key={`${lang}-${job.id}`} texte={texte} onSave={(t) => save({ textes: { [lang]: t } })} /> : null}

          <div className="space-y-3">
            {job.slides.map((s, pos) => {
              const text = texte?.slides.find((x) => x.index === s.index)?.text ?? "";
              const kind = normalizeSlideKind(s.kind, pos, job.slides.length);
              return (
                <SlideRow
                  key={`${lang}-${s.index}-${s.imagePath ?? ""}-${reloadKey}`}
                  number={pos + 1}
                  kind={kind}
                  kindStored={Boolean(s.kind)}
                  text={text}
                  overlong={overlong.has(s.index)}
                  imagePrompt={s.imagePrompt}
                  imageUrl={s.imageUrl}
                  busy={imgBusy.has(s.index)}
                  onSaveText={(t) => save({ textes: { [lang]: { slides: [{ index: s.index, text: t }] } } })}
                  onSavePrompt={(p) => save({ imagePrompts: [{ index: s.index, imagePrompt: p }] })}
                  onGenerate={() => {
                    if (s.imageUrl && !confirm("Régénérer cette image ? Coût : 1 image, l'ancienne sera écrasée.")) return;
                    void regen(s.index);
                  }}
                />
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function MetaEditor({
  texte,
  onSave,
}: {
  texte: { title: string; caption: string; hashtags: string[] };
  onSave: (t: { title: string; caption: string; hashtags: string[] }) => void;
}) {
  const [title, setTitle] = useState(texte.title);
  const [caption, setCaption] = useState(texte.caption);
  const [tags, setTags] = useState(texte.hashtags.join(" "));
  return (
    <div className="mb-3 grid gap-2 rounded-md border border-border p-2">
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titre" />
      <Textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={2} placeholder="Légende" />
      <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="hashtags séparés par des espaces" />
      <div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onSave({ title, caption, hashtags: tags.split(/\s+/).map((t) => t.replace(/^#/, "")).filter(Boolean) })}
        >
          <Save className="mr-1 size-3.5" /> Enregistrer titre, légende et hashtags
        </Button>
      </div>
    </div>
  );
}

function SlideRow(props: {
  number: number;
  kind: string;
  kindStored: boolean;
  text: string;
  overlong: boolean;
  imagePrompt: string;
  imageUrl: string | null;
  busy: boolean;
  onSaveText: (t: string) => void;
  onSavePrompt: (p: string) => void;
  onGenerate: () => void;
}) {
  const [text, setText] = useState(props.text);
  const [prompt, setPrompt] = useState(props.imagePrompt);
  const [composed, setComposed] = useState<string | null>(null);
  const words = text.trim().split(/\s+/).filter(Boolean).length;

  useEffect(() => {
    if (!props.imageUrl) return;
    let url: string | null = null;
    let cancelled = false;
    composeSlide(props.imageUrl, props.text)
      .then((b) => {
        if (cancelled) return;
        url = URL.createObjectURL(b);
        setComposed(url);
      })
      .catch(() => setComposed(null));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [props.imageUrl, props.text]);

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border p-2 md:flex-row">
      <div className="w-full shrink-0 md:w-48">
        {props.imageUrl ? (
          <img src={composed ?? props.imageUrl} alt={`Slide ${props.number}`} className="aspect-square w-full rounded object-cover" />
        ) : (
          <div className="flex aspect-square w-full items-center justify-center rounded bg-muted text-muted-foreground">
            pas d'image
          </div>
        )}
        <Button size="sm" variant="outline" className="mt-1.5 w-full" onClick={props.onGenerate} disabled={props.busy}>
          {props.busy ? (
            <Loader2 className="mr-1 size-3.5 animate-spin" />
          ) : props.imageUrl ? (
            <RefreshCw className="mr-1 size-3.5" />
          ) : (
            <ImagePlus className="mr-1 size-3.5" />
          )}
          {props.imageUrl ? "Régénérer" : "Générer cette image"} (1 image)
        </Button>
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <b>#{props.number}</b>
          <span className="rounded bg-muted px-1.5 py-0.5">
            {KIND_LABEL[props.kind] ?? props.kind}
            {props.kindStored ? "" : " (déduit)"}
          </span>
          <span className="text-muted-foreground">{words} mots</span>
          {props.overlong ? (
            <span className="rounded-full bg-destructive px-2 py-0.5 text-destructive-foreground">trop long</span>
          ) : null}
        </div>
        <div className="flex gap-1.5">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} />
          <Button size="sm" variant="outline" onClick={() => props.onSaveText(text)} disabled={text === props.text}>
            <Save className="mr-1 size-3.5" /> Enregistrer
          </Button>
        </div>
        <div className="flex gap-1.5">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            className="font-mono text-xs"
            placeholder="Prompt d'image (anglais)"
          />
          <Button size="sm" variant="outline" onClick={() => props.onSavePrompt(prompt)} disabled={prompt === props.imagePrompt}>
            <Save className="mr-1 size-3.5" /> Enregistrer
          </Button>
        </div>
      </div>
    </div>
  );
}
