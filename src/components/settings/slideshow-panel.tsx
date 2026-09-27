import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { MASTER_LANGUAGES } from "@/lib/languages";
import { composeSlide } from "@/lib/slide-compose";
import { SLIDESHOW_FORMATS } from "@/lib/slideshow-formats";
import { DEFAULT_SLIDESHOW_SETTINGS, FONT_OPTIONS, getSlideshowPreviewSource, getSlideshowSettings, saveSlideshowSettings, type SlideshowSettings } from "@/lib/slideshow-settings.functions";

const positions = ["haut", "milieu", "bas"] as const;
const backgrounds = ["aucun", "contour", "ombre", "bandeau", "boite"] as const;
const LABEL = "mb-1 block text-[13px] text-muted-foreground";

export function SlideshowPanel() {
  const [settings, setSettings] = useState<SlideshowSettings>(DEFAULT_SLIDESHOW_SETTINGS);
  const [source, setSource] = useState<{ imageUrl: string | null; short: string; long: string } | null>(null);
  const [sample, setSample] = useState<"short" | "medium" | "long">("short");
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const update = <K extends keyof SlideshowSettings>(key: K, value: SlideshowSettings[K]) => setSettings((s) => ({ ...s, [key]: value }));

  useEffect(() => {
    void getSlideshowSettings().then(setSettings).catch((e) => toast.error(e instanceof Error ? e.message : "Chargement impossible"));
    void getSlideshowPreviewSource().then(setSource).catch(() => setSource({ imageUrl: null, short: "Sophia", long: "" }));
  }, []);

  const text = useMemo(() => sample === "short" ? (source?.short || "Sophia") : sample === "medium" ? "Une découverte qui change notre façon de voir le monde" : (source?.long || "Une longue phrase pour vérifier que le texte reste entièrement lisible même quand plusieurs mots occupent la même image."), [sample, source]);
  useEffect(() => {
    if (!source) return;
    let cancelled = false;
    let created: string | null = null;
    setPreview(null);
    const background = source.imageUrl ?? makeGrayBackground();
    void composeSlide(background, text, settings).then((blob) => {
      if (cancelled) return;
      created = URL.createObjectURL(blob);
      setPreview(created);
    }).catch(() => { if (!cancelled) setPreview(null); });
    return () => { cancelled = true; if (created) URL.revokeObjectURL(created); };
  }, [settings, source, text]);

  const save = async () => {
    setBusy(true);
    try { await saveSlideshowSettings({ data: settings }); toast.success("Réglages enregistrés"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Enregistrement impossible"); }
    finally { setBusy(false); }
  };

  return <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(280px,420px)]">
    <div className="space-y-8 min-w-0">
      <section><h2 className="mb-3 text-lg font-bold">Formats</h2><div className="grid gap-2 sm:grid-cols-2">
        {SLIDESHOW_FORMATS.map((format) => <label key={format.id} className="flex min-h-10 items-center gap-2">
          <input type="checkbox" checked={settings.formats_actifs.includes(format.id)} onChange={(e) => {
            const next = e.target.checked ? [...settings.formats_actifs, format.id] : settings.formats_actifs.filter((f) => f !== format.id);
            if (next.length) update("formats_actifs", next);
          }} /> {format.label} <span className="text-muted-foreground">({format.slides.min}–{format.slides.max} slides)</span>
        </label>)}
      </div></section>
      <section><h2 className="mb-3 text-lg font-bold">Production</h2>
        <label className={LABEL} htmlFor="slide-default-count">Nombre de slides par défaut</label>
        <Input id="slide-default-count" className="max-w-32" type="number" min={3} max={20} value={settings.slide_count_defaut} onChange={(e) => update("slide_count_defaut", Number(e.target.value))} />
        <p className="mt-1 text-[13px] text-muted-foreground">Adapté aux bornes du format choisi au lancement.</p>
        <p className={`${LABEL} mt-4`}>Langues</p><div className="flex flex-wrap gap-4">{MASTER_LANGUAGES.map((l) => <label key={l.id} className="flex items-center gap-2"><input type="checkbox" checked={settings.langues.includes(l.id)} onChange={(e) => {
          const next = e.target.checked ? [...settings.langues, l.id] : settings.langues.filter((v) => v !== l.id);
          if (next.length) update("langues", next);
        }} />{l.id.toUpperCase()}</label>)}</div>
      </section>
      <section><h2 className="mb-3 text-lg font-bold">Image</h2><label className={LABEL} htmlFor="slide-image-style">Style d’image</label>
        <Textarea id="slide-image-style" className="font-mono text-sm" rows={6} value={settings.image_style} onChange={(e) => update("image_style", e.target.value)} />
        <p className="mt-1 text-[13px] text-muted-foreground">Envoyé en anglais au générateur, ajouté à chaque prompt de slide.</p>
      </section>
      <section className="space-y-4"><h2 className="text-lg font-bold">Typographie</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className={LABEL} htmlFor="slide-font">Police</label><select id="slide-font" className="h-10 w-full rounded-md border border-input bg-background px-2" value={settings.police} onChange={(e) => update("police", e.target.value)}>{FONT_OPTIONS.map((f) => <option key={f}>{f}</option>)}</select></div>
          <div><label className={LABEL} htmlFor="slide-weight">Graisse</label><select id="slide-weight" className="h-10 w-full rounded-md border border-input bg-background px-2" value={settings.graisse} onChange={(e) => update("graisse", Number(e.target.value))}>{[400,500,600,700,800,900].map((v) => <option key={v} value={v}>{v}</option>)}</select></div>
          <div><label className={LABEL} htmlFor="slide-size">Taille ({(settings.taille_ratio * 100).toFixed(1)} %)</label><input id="slide-size" className="w-full accent-foreground" type="range" min="0.04" max="0.10" step="0.001" value={settings.taille_ratio} onChange={(e) => update("taille_ratio", Number(e.target.value))} /></div>
          <div><label className={LABEL} htmlFor="slide-width">Largeur max ({Math.round(settings.largeur_max_ratio * 100)} %)</label><input id="slide-width" className="w-full accent-foreground" type="range" min="0.3" max="1" step="0.01" value={settings.largeur_max_ratio} onChange={(e) => update("largeur_max_ratio", Number(e.target.value))} /></div>
          <div><label className={LABEL} htmlFor="slide-leading">Interligne ({settings.interligne.toFixed(2)})</label><input id="slide-leading" className="w-full accent-foreground" type="range" min="0.8" max="2" step="0.01" value={settings.interligne} onChange={(e) => update("interligne", Number(e.target.value))} /></div>
          <div><label className={LABEL} htmlFor="slide-lines">Lignes max</label><Input id="slide-lines" type="number" min={1} max={12} value={settings.lignes_max} onChange={(e) => update("lignes_max", Number(e.target.value))} /></div>
        </div>
        <label className="flex items-center gap-3">Majuscules <Switch checked={settings.majuscules} onCheckedChange={(v) => update("majuscules", v)} /></label>
        <div><p className={LABEL}>Position du texte</p><div className="flex gap-2">{positions.map((p) => <Button key={p} variant={settings.position_texte === p ? "default" : "outline"} onClick={() => update("position_texte", p)}>{p}</Button>)}</div></div>
        <div><p className={LABEL}>Fond du texte</p><div className="flex flex-wrap gap-2">{backgrounds.map((b) => <Button key={b} variant={settings.fond_texte === b ? "default" : "outline"} onClick={() => update("fond_texte", b)}>{b}</Button>)}</div></div>
        <div className="grid gap-4 sm:grid-cols-2"><div><label className={LABEL} htmlFor="slide-color">Couleur du texte</label><Input id="slide-color" type="color" value={settings.couleur_texte} onChange={(e) => update("couleur_texte", e.target.value)} /></div>
          <div><label className={LABEL} htmlFor="slide-bg-color">Couleur du fond</label><Input id="slide-bg-color" type="color" value={settings.fond_couleur} onChange={(e) => update("fond_couleur", e.target.value)} /></div></div>
        <div><label className={LABEL} htmlFor="slide-opacity">Opacité du fond ({Math.round(settings.fond_opacite * 100)} %)</label><input id="slide-opacity" className="w-full accent-foreground" type="range" min="0" max="1" step="0.01" value={settings.fond_opacite} onChange={(e) => update("fond_opacite", Number(e.target.value))} /></div>
      </section>
      <div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={save}>Enregistrer</Button><Button variant="outline" onClick={() => setSettings({ ...DEFAULT_SLIDESHOW_SETTINGS, formats_actifs: [...DEFAULT_SLIDESHOW_SETTINGS.formats_actifs], langues: [...DEFAULT_SLIDESHOW_SETTINGS.langues] })}>Revenir aux valeurs par défaut</Button></div>
    </div>
    <aside className="self-start lg:sticky lg:top-6"><h2 className="mb-3 text-lg font-bold">Aperçu en direct</h2>
      <div className="aspect-square w-full overflow-hidden rounded-lg border border-border bg-muted">{preview ? <img src={preview} alt="Aperçu de la slide" className="h-full w-full object-contain" /> : <div className="flex h-full items-center justify-center text-muted-foreground">Chargement…</div>}</div>
      <div className="mt-3 flex flex-wrap gap-2">{([ ["short","Court"], ["medium","Moyen"], ["long","Long"] ] as const).map(([id,label]) => <Button key={id} size="sm" variant={sample === id ? "default" : "outline"} onClick={() => setSample(id)}>{label}</Button>)}</div>
    </aside>
  </div>;
}

function makeGrayBackground(): string {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 800;
  const ctx = canvas.getContext("2d");
  if (ctx) { ctx.fillStyle = "#808080"; ctx.fillRect(0, 0, 800, 800); }
  return canvas.toDataURL("image/png");
}