/** Slideshow du jour dans l'espace CM : aperçu, export des images, légende, déclaration. */
import { useEffect, useState } from "react";
import { Copy, ImageDown, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUi } from "@/components/ui-lang-switch";
import { languageLabel } from "@/lib/languages";
import { composeSlide } from "@/lib/slide-compose";
import {
  getSlideshowAssets,
  markSlideshowPosted,
  type DailySlideshow,
} from "@/lib/platform.functions";

type Asset = { index: number; kind: string; text: string; url: string };

export function SlideshowSection({
  accounts,
  slideshows,
  today,
  onChange,
}: {
  accounts: { id: string; language: string; handle: string }[];
  slideshows: DailySlideshow[];
  today: string;
  onChange: () => Promise<void>;
}) {
  const { t } = useUi();
  return (
    <section className="space-y-3">
      <h2 className="px-1 text-sm font-semibold text-foreground">{t("slide.section")}</h2>
      {accounts.map((a) => {
        const show = slideshows.find((s) => s.account_id === a.id && s.publish_date === today);
        return (
          <div key={a.id} className="space-y-2">
            <p className="px-1 text-xs text-muted-foreground">
              @{a.handle} · {languageLabel(a.language)}
            </p>
            {show ? (
              <TodaySlideshow show={show} onChange={onChange} />
            ) : (
              <div className="rounded-xl border border-border bg-card p-6 text-center">
                <p className="text-sm text-muted-foreground">{t("slide.none")}</p>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

function TodaySlideshow({ show, onChange }: { show: DailySlideshow; onChange: () => Promise<void> }) {
  const { t, day } = useUi();
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [postUrl, setPostUrl] = useState("");

  useEffect(() => {
    let active = true;
    setAssets(null);
    void getSlideshowAssets({ data: { slideshowId: show.id, accountId: show.account_id, track: false } })
      .then((r) => active && setAssets(r.slides))
      .catch(() => active && setAssets([]));
    return () => {
      active = false;
    };
  }, [show.id, show.account_id]);

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast.success(t("common.copied", { label: "" }).trim());
  };

  const save = async () => {
    setBusy(true);
    const toastId = toast.loading(t("slide.preparing"));
    try {
      const r = await getSlideshowAssets({
        data: { slideshowId: show.id, accountId: show.account_id, track: true },
      });
      const blobs = await Promise.all(r.slides.map((s) => composeSlide(s.url, s.text)));
      const name = (i: number) => `${String(i + 1).padStart(2, "0")}.png`;
      const files = blobs.map((b, i) => new File([b], name(i), { type: "image/png" }));
      toast.dismiss(toastId);

      let shared = false;
      try {
        if (navigator.canShare?.({ files })) {
          await navigator.share({ files });
          shared = true;
        }
      } catch (e) {
        if ((e as Error)?.name === "AbortError") {
          await onChange();
          return;
        }
      }
      if (shared) {
        toast.success(t("slide.saved"));
      } else {
        const { default: JSZip } = await import("jszip");
        const zip = new JSZip();
        files.forEach((f) => zip.file(f.name, f));
        const blob = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `sophia-${show.publish_date}-${show.language}-${show.format}.zip`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
        toast.success(t("slide.downloaded"));
      }
      await onChange();
    } catch (e) {
      toast.dismiss(toastId);
      toast.error(e instanceof Error ? e.message : t("slide.saveFailed"));
    } finally {
      setBusy(false);
    }
  };

  const declare = async () => {
    try {
      await markSlideshowPosted({
        data: { slideshowId: show.id, accountId: show.account_id, url: postUrl.trim() },
      });
      setPostUrl("");
      await onChange();
      toast.success(t("video.declareOk"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.saveFailed"));
    }
  };

  const hashtags = show.hashtags.map((h) => `#${h.replace(/^#+/, "")}`).join(" ");

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-foreground">
          {t("slide.title", { date: day(show.publish_date) })}
        </h3>
        {show.posted_at ? <Badge variant="secondary">{t("video.posted")}</Badge> : null}
      </div>
      {show.title ? <p className="mt-1 text-sm text-muted-foreground">{show.title}</p> : null}

      <div className="mt-3 flex snap-x gap-2 overflow-x-auto pb-2">
        {assets === null ? (
          <div className="flex h-40 w-full items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          assets.map((s) => (
            <div
              key={s.index}
              className="relative aspect-square w-40 shrink-0 snap-start overflow-hidden rounded-lg border border-border"
            >
              <img src={s.url} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />
              <p
                className="absolute inset-x-2 top-[8%] text-center text-[10px] font-black uppercase leading-tight text-primary-foreground"
                style={{
                  fontFamily: '"Archivo Black", "Arial Black", Impact, sans-serif',
                  textShadow: "0 0 3px rgba(0,0,0,.9), 0 0 1px rgba(0,0,0,1)",
                }}
              >
                {s.text}
              </p>
            </div>
          ))
        )}
      </div>

      <Button className="mt-3 h-12 w-full text-base" onClick={save} disabled={busy || !assets?.length}>
        {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <ImageDown className="mr-2 size-5" />}
        {t("slide.save")}
      </Button>
      <p className="mt-1.5 text-center text-xs text-muted-foreground">{t("slide.saveHint")}</p>

      {show.caption ? (
        <div className="mt-4 rounded-lg border border-border bg-background p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("video.caption")}</p>
            <Button variant="ghost" size="sm" onClick={() => copy(show.caption)}>
              <Copy className="mr-1.5 size-3.5" /> {t("common.copy")}
            </Button>
          </div>
          <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{show.caption}</p>
        </div>
      ) : null}

      {hashtags ? (
        <div className="mt-2 rounded-lg border border-border bg-background p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("video.hashtags")}</p>
            <Button variant="ghost" size="sm" onClick={() => copy(hashtags)}>
              <Copy className="mr-1.5 size-3.5" /> {t("common.copy")}
            </Button>
          </div>
          <p className="mt-1 break-words text-sm text-foreground">{hashtags}</p>
        </div>
      ) : null}

      <div className="mt-4 space-y-2 rounded-lg border border-border bg-background p-3">
        <Label htmlFor={`slide-lien-${show.account_id}`}>{t("video.declareLabel")}</Label>
        <Input
          id={`slide-lien-${show.account_id}`}
          value={postUrl}
          onChange={(e) => setPostUrl(e.target.value)}
          placeholder="https://instagram.com/p/..."
          inputMode="url"
        />
        <Button variant="secondary" className="h-11 w-full" onClick={declare} disabled={!/^https?:\/\//.test(postUrl.trim())}>
          {t("video.declareCta")}
        </Button>
        {show.posted_url ? (
          <a href={show.posted_url} target="_blank" rel="noreferrer" className="block truncate text-xs text-primary hover:underline">
            {show.posted_url}
          </a>
        ) : null}
      </div>
    </div>
  );
}
