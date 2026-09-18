import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  FileText,
  ImageDown,
  Loader2,
  LogOut,
  Timer,
} from "lucide-react";
import { toast } from "sonner";

import sophiaLogo from "@/assets/sophia-logo.png.asset.json";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { ContractMarkdown } from "@/components/contract-markdown";
import { UiLangProvider, UiLangSwitch, useUi } from "@/components/ui-lang-switch";
import { supabase } from "@/integrations/supabase/client";
import { languageLabel } from "@/lib/languages";
import { isPast } from "@/lib/publish-day";
import { localeOf } from "@/lib/ui-lang";
import {
  WARMUP_TASKS,
  confirmAccountStep,
  getActiveContractTemplate,
  getMyContract,
  getMyProfile,
  getMySpace,
  getVideoLink,
  listMyVideos,
  markPosted,
  setWarmupCheck,
  signContract,
  updateMyAccountIdentity,
  type DailyVideo,
  type PlatformProfile,
  type PosterAccount,
  type SignedContract,
} from "@/lib/platform.functions";

export const Route = createFileRoute("/_authenticated/espace")({
  head: () => ({
    meta: [
      { title: "Mon espace posteur — vidéo du jour" },
      {
        name: "description",
        content:
          "Crée tes comptes pas à pas, récupère la vidéo du jour dans la bonne langue et déclare tes publications.",
      },
      { property: "og:title", content: "Espace posteur — vidéo du jour" },
      {
        property: "og:description",
        content: "Installation guidée des comptes, vidéo quotidienne et suivi des publications.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <UiLangProvider>
      <PosterSpace />
    </UiLangProvider>
  ),
});

/**
 * Enregistre la vidéo sur l'appareil.
 *
 * Sur iPhone, l'attribut `download` d'un lien est ignoré pour une URL d'un
 * autre domaine : on passe donc par la feuille de partage iOS, qui propose
 * « Enregistrer la vidéo » (pellicule). Partout ailleurs, on retombe sur un
 * vrai téléchargement.
 *
 * Renvoie "shared" | "downloaded" | "cancelled".
 */
async function saveVideo(url: string, filename: string) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const file = new File([blob], filename, { type: blob.type || "video/mp4" });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file] });
      return "shared" as const;
    }
  } catch (e) {
    // L'utilisateur a fermé la feuille de partage : ce n'est pas une erreur.
    if ((e as Error)?.name === "AbortError") return "cancelled" as const;
    // Tout autre échec (partage refusé par le navigateur, fetch bloqué) :
    // on continue vers le lien de téléchargement ci-dessous.
  }
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  return "downloaded" as const;
}

function CopyField({ label, value }: { label: string; value: string }) {
  const { t } = useUi();
  const [done, setDone] = useState(false);
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-center justify-between gap-2">
        <p className="min-w-0 break-all font-mono text-sm text-foreground">{value}</p>
        <Button
          variant="secondary"
          size="sm"
          className="shrink-0"
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setDone(true);
            toast.success(t("common.copied", { label }));
            setTimeout(() => setDone(false), 1500);
          }}
        >
          {done ? <Check className="size-4" /> : <Copy className="size-4" />}
        </Button>
      </div>
    </div>
  );
}

type SpaceData = Awaited<ReturnType<typeof getMySpace>>;
type VideosData = Awaited<ReturnType<typeof listMyVideos>>;

function PosterSpace() {
  const { t } = useUi();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<PlatformProfile | null>(null);
  const [space, setSpace] = useState<SpaceData | null>(null);
  const [contract, setContract] = useState<SignedContract | null>(null);
  const [template, setTemplate] = useState<{ version: number; title: string; body: string } | null>(
    null,
  );
  const [videoData, setVideoData] = useState<VideosData | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const p = await getMyProfile();
      setProfile(p);
      if (p.role === "admin") {
        await navigate({ to: "/admin", replace: true });
        return;
      }
      const [s, c, tpl, v] = await Promise.all([
        getMySpace(),
        getMyContract(),
        getActiveContractTemplate(),
        listMyVideos(),
      ]);
      setSpace(s);
      setContract(c.contract);
      setTemplate(tpl.template);
      setVideoData(v);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [navigate, t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onSignOut = async () => {
    await supabase.auth.signOut();
    await navigate({ to: "/connexion", replace: true });
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const accounts = space?.accounts ?? [];
  const hasContract = Boolean(contract);
  const allWarm = accounts.length > 0 && accounts.every((a) => a.warmup_done_at);

  return (
    <div className="min-h-screen bg-background pb-16">
      <Toaster />
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{t("space.title")}</p>
            <p className="truncate text-xs text-muted-foreground">{profile?.email}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <UiLangSwitch />
            <Button variant="ghost" size="sm" onClick={onSignOut}>
              <LogOut className="size-4" />
              <span className="sr-only sm:not-sr-only sm:ml-2">{t("space.signout")}</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 px-4 py-5">
        {accounts.length === 0 ? (
          <section className="rounded-xl border border-border bg-card p-6 text-center">
            <h1 className="text-base font-semibold text-foreground">{t("space.pending.title")}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{t("space.pending.body")}</p>
          </section>
        ) : (
          <>
            {accounts.map((account) => (
              <AccountOnboarding
                key={account.id}
                account={account}
                socialPassword={space?.socialPassword ?? ""}
                bio={space?.bio ?? ""}
                onChange={refresh}
              />
            ))}

            <StepContract
              active={allWarm && !hasContract}
              done={hasContract}
              template={template}
              onDone={refresh}
            />

            {videoData ? (
              <>
                {videoData.accounts.map((a) => (
                  <AccountVideos
                    key={a.id}
                    account={a}
                    videos={videoData.videos.filter((v) => v.account_id === a.id)}
                    today={videoData.today}
                    warmDone={a.ready}
                    onChange={refresh}
                  />
                ))}
              </>
            ) : null}

            <ContractCard contract={contract} profile={profile} />
          </>
        )}
      </main>
    </div>
  );
}

/* ---------------------------------------------------------------- parcours */

function StepShell({
  n,
  title,
  active,
  done,
  children,
}: {
  n: number;
  title: string;
  active: boolean;
  done: boolean;
  children?: React.ReactNode;
}) {
  return (
    <section
      className={`rounded-xl border bg-card p-4 ${active ? "border-primary/60" : "border-border"} ${!active && !done ? "opacity-60" : ""}`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
        >
          {done ? <Check className="size-3.5" /> : n}
        </span>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      {active ? <div className="mt-4">{children}</div> : null}
    </section>
  );
}

function stepsDone(a: PosterAccount) {
  return [a.gmail_done_at, a.handle_done_at, a.photo_done_at, a.warmup_done_at].filter(Boolean)
    .length;
}

function AccountOnboarding({
  account,
  socialPassword,
  bio,
  onChange,
}: {
  account: PosterAccount;
  socialPassword: string;
  bio: string;
  onChange: () => Promise<void>;
}) {
  const { t } = useUi();
  const done = stepsDone(account);
  if (done === 4) {
    return (
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">@{account.handle}</p>
            <p className="truncate text-xs text-muted-foreground">
              {languageLabel(account.language)} · {account.country_code.toUpperCase()} ·{" "}
              {account.gmail_address}
            </p>
          </div>
          <Badge variant="secondary">{t("onb.accountReady")}</Badge>
        </div>
        <FixValues account={account} onChange={onChange} />
      </section>
    );
  }

  return (
    <div className="space-y-3">
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-base font-semibold text-foreground">
            {t("onb.accountTitle", { language: languageLabel(account.language) })}
          </h1>
          <span className="text-xs text-muted-foreground">{t("onb.stepOf", { n: done + 1 })}</span>
        </div>
        <Progress value={(done / 5) * 100} className="mt-3 h-2" />
        <p className="mt-3 text-sm text-muted-foreground">{t("onb.intro")}</p>
      </section>

      <StepGmail account={account} password={socialPassword} onChange={onChange} />
      <StepHandle account={account} password={socialPassword} onChange={onChange} />
      <StepPhoto account={account} bio={bio} onChange={onChange} />
      <StepWarmup account={account} onChange={onChange} />
    </div>
  );
}

function useStep(onChange: () => Promise<void>) {
  const { t } = useUi();
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      await onChange();
      toast.success(ok);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.actionFailed"));
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}

function StepGmail({
  account,
  password,
  onChange,
}: {
  account: PosterAccount;
  password: string;
  onChange: () => Promise<void>;
}) {
  const { t } = useUi();
  const { busy, run } = useStep(onChange);
  const [gmail, setGmail] = useState(account.gmail_address || account.expected_gmail);
  const active = !account.gmail_done_at;

  return (
    <StepShell n={1} title={t("step1.title")} active={active} done={Boolean(account.gmail_done_at)}>
      <p className="mb-3 text-sm text-muted-foreground">{t("step1.body")}</p>
      <div className="space-y-2">
        <CopyField label={t("step1.expected")} value={account.expected_gmail} />
        <CopyField label={t("step1.password")} value={password} />
      </div>
      <div className="mt-3 space-y-1.5">
        <Label htmlFor={`gmail-${account.id}`}>{t("step1.actual")}</Label>
        <Input
          id={`gmail-${account.id}`}
          type="email"
          inputMode="email"
          value={gmail}
          onChange={(e) => setGmail(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">{t("step1.hint")}</p>
      </div>
      <Button
        className="mt-4 h-12 w-full"
        disabled={busy || !gmail.includes("@")}
        onClick={() =>
          run(async () => {
            await updateMyAccountIdentity({ data: { accountId: account.id, gmail: gmail.trim() } });
            await confirmAccountStep({ data: { accountId: account.id, step: "gmail" } });
          }, t("step1.ok"))
        }
      >
        {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
        {t("step1.cta")}
      </Button>
    </StepShell>
  );
}

function StepHandle({
  account,
  password,
  onChange,
}: {
  account: PosterAccount;
  password: string;
  onChange: () => Promise<void>;
}) {
  const { t } = useUi();
  const { busy, run } = useStep(onChange);
  const [handle, setHandle] = useState(account.handle || account.expected_handle);
  const active = Boolean(account.gmail_done_at) && !account.handle_done_at;

  return (
    <StepShell
      n={2}
      title={t("step2.title")}
      active={active}
      done={Boolean(account.handle_done_at)}
    >
      <p className="mb-3 text-sm text-muted-foreground">
        {t("step2.body", { gmail: account.gmail_address ?? "" })}
      </p>
      <div className="space-y-2">
        <CopyField label={t("step2.expected")} value={account.expected_handle} />
        <CopyField label={t("step1.password")} value={password} />
      </div>
      <div className="mt-3 space-y-1.5">
        <Label htmlFor={`handle-${account.id}`}>{t("step2.actual")}</Label>
        <Input
          id={`handle-${account.id}`}
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">{t("step2.hint")}</p>
      </div>
      <Button
        className="mt-4 h-12 w-full"
        disabled={busy || handle.trim().length < 2}
        onClick={() =>
          run(async () => {
            await updateMyAccountIdentity({ data: { accountId: account.id, handle: handle.trim() } });
            await confirmAccountStep({ data: { accountId: account.id, step: "handle" } });
          }, t("step2.ok"))
        }
      >
        {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
        {t("step2.cta")}
      </Button>
    </StepShell>
  );
}

function StepPhoto({
  account,
  bio,
  onChange,
}: {
  account: PosterAccount;
  bio: string;
  onChange: () => Promise<void>;
}) {
  const { t } = useUi();
  const { busy, run } = useStep(onChange);
  const active = Boolean(account.handle_done_at) && !account.photo_done_at;

  return (
    <StepShell n={3} title={t("step3.title")} active={active} done={Boolean(account.photo_done_at)}>
      <p className="mb-3 text-sm text-muted-foreground">{t("step3.body")}</p>
      <a
        href={sophiaLogo.url}
        download="sophia-photo-de-profil.png"
        className="mb-3 flex items-center gap-3 rounded-lg border border-border bg-background p-3"
      >
        <img
          src={sophiaLogo.url}
          alt={t("step3.photoAlt")}
          className="size-14 rounded-lg object-cover"
        />
        <span className="flex items-center gap-2 text-sm font-medium text-foreground">
          <ImageDown className="size-4" /> {t("step3.photo")}
        </span>
      </a>
      <CopyField label={t("step3.bio")} value={bio} />
      <Button
        className="mt-4 h-12 w-full"
        disabled={busy}
        onClick={() =>
          run(
            () => confirmAccountStep({ data: { accountId: account.id, step: "photo" } }),
            t("step3.ok"),
          )
        }
      >
        {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
        {t("step3.cta")}
      </Button>
    </StepShell>
  );
}

function StepWarmup({ account, onChange }: { account: PosterAccount; onChange: () => Promise<void> }) {
  const { t } = useUi();
  const { busy, run } = useStep(onChange);
  const active = Boolean(account.photo_done_at) && !account.warmup_done_at;
  const started = account.warmup_started_at ? new Date(account.warmup_started_at).getTime() : 0;
  const endsAt = started + 24 * 3600_000;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);

  const left = Math.max(0, endsAt - now);
  const h = Math.floor(left / 3600_000);
  const m = Math.floor((left % 3600_000) / 60_000);
  const s = Math.floor((left % 60_000) / 1000);
  const over = left === 0 && started > 0;

  return (
    <StepShell n={4} title={t("step4.title")} active={active} done={Boolean(account.warmup_done_at)}>
      <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
        <p className="text-sm text-foreground">{t("step4.warning")}</p>
      </div>

      <div className="mt-3 flex items-center justify-center gap-2 rounded-lg border border-border bg-background p-4">
        <Timer className="size-5 text-muted-foreground" />
        <p className="font-mono text-2xl text-foreground">
          {over ? "00:00:00" : `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`}
        </p>
      </div>

      <ul className="mt-3 space-y-2">
        {WARMUP_TASKS.map((task) => (
          <li key={task.id} className="flex items-start gap-2 text-sm text-foreground">
            <Checkbox
              checked={Boolean(account.warmup_checks[task.id])}
              onCheckedChange={async (v) => {
                await setWarmupCheck({
                  data: { accountId: account.id, key: task.id, value: v === true },
                });
                await onChange();
              }}
            />
            <span>{t(`warmup.${task.id}`)}</span>
          </li>
        ))}
      </ul>

      <Button
        className="mt-4 h-12 w-full"
        disabled={busy || !over}
        onClick={() =>
          run(
            () => confirmAccountStep({ data: { accountId: account.id, step: "warmup" } }),
            t("step4.ok"),
          )
        }
      >
        {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
        {over ? t("step4.cta") : t("step4.wait")}
      </Button>
    </StepShell>
  );
}

function FixValues({ account, onChange }: { account: PosterAccount; onChange: () => Promise<void> }) {
  const { t } = useUi();
  const [open, setOpen] = useState(false);
  const [handle, setHandle] = useState(account.handle);
  const [gmail, setGmail] = useState(account.gmail_address ?? "");
  const [busy, setBusy] = useState(false);

  const diverges =
    account.handle !== account.expected_handle || account.gmail_address !== account.expected_gmail;

  return (
    <div className="mt-3">
      {diverges ? (
        <p className="mb-2 text-xs text-muted-foreground">
          {t("onb.fixNote", {
            handle: account.expected_handle,
            gmail: account.expected_gmail,
          })}
        </p>
      ) : null}
      <Button variant="ghost" size="sm" className="px-0" onClick={() => setOpen((v) => !v)}>
        {open ? t("common.close") : t("onb.fixOpen")}
      </Button>
      {open ? (
        <div className="mt-2 space-y-2 rounded-lg border border-border bg-background p-3">
          <div className="space-y-1.5">
            <Label htmlFor={`fix-handle-${account.id}`}>{t("onb.handle")}</Label>
            <Input id={`fix-handle-${account.id}`} value={handle} onChange={(e) => setHandle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`fix-gmail-${account.id}`}>{t("onb.gmail")}</Label>
            <Input id={`fix-gmail-${account.id}`} value={gmail} onChange={(e) => setGmail(e.target.value)} />
          </div>
          <Button
            className="h-11 w-full"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await updateMyAccountIdentity({
                  data: { accountId: account.id, handle: handle.trim(), gmail: gmail.trim() },
                });
                await onChange();
                toast.success(t("common.saved"));
                setOpen(false);
              } catch (e) {
                toast.error(e instanceof Error ? e.message : t("common.saveFailed"));
              } finally {
                setBusy(false);
              }
            }}
          >
            {t("common.save")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function StepContract({
  active,
  done,
  template,
  onDone,
}: {
  active: boolean;
  done: boolean;
  template: { version: number; title: string; body: string } | null;
  onDone: () => Promise<void>;
}) {
  const { t } = useUi();
  const [name, setName] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);

  if (done) return null;

  const sign = async () => {
    setBusy(true);
    try {
      await signContract({ data: { fullName: name.trim(), accepted: true } });
      await onDone();
      toast.success(t("step5.ok"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("step5.failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <StepShell n={5} title={t("step5.title")} active={active} done={false}>
      {template ? (
        <>
          <p className="mb-2 text-sm font-medium text-foreground">{template.title}</p>
          <div className="max-h-80 overflow-y-auto rounded-lg border border-border bg-background p-4">
            <ContractMarkdown body={template.body} />
          </div>
          <div className="mt-4 space-y-1.5">
            <Label htmlFor="signature">{t("step5.name")}</Label>
            <Input
              id="signature"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("step5.namePlaceholder")}
              autoComplete="name"
            />
          </div>
          <label className="mt-3 flex items-start gap-2 text-sm text-muted-foreground">
            <Checkbox checked={accepted} onCheckedChange={(v) => setAccepted(v === true)} />
            <span>{t("step5.accept")}</span>
          </label>
          <Button
            className="mt-4 h-12 w-full"
            onClick={sign}
            disabled={busy || !accepted || name.trim().length < 3}
          >
            {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            {t("step5.cta")}
          </Button>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">{t("step5.none")}</p>
      )}
    </StepShell>
  );
}

/* ------------------------------------------------------------ vidéo du jour */

function AccountVideos({
  account,
  videos,
  today,
  warmDone = true,
  onChange,
}: {
  account: { id: string; language: string; handle: string };
  videos: DailyVideo[];
  today: string;
  warmDone?: boolean;
  onChange: () => Promise<void>;
}) {
  const { t } = useUi();
  const video = videos.find((v) => v.publish_date === today);
  // Historique : uniquement des dates PASSÉES, jamais aujourd'hui ni le futur.
  const past = videos.filter((v) => isPast(v.publish_date, today));

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2 px-1">
        <h2 className="text-sm font-semibold text-foreground">
          @{account.handle} · {languageLabel(account.language)}
        </h2>
        {video?.posted_at ? <Badge variant="secondary">{t("video.posted")}</Badge> : null}
      </div>
      {!warmDone ? (
        <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
          {t("video.warmNote")}
        </p>
      ) : null}
      {video ? (
        <TodayVideo video={video} onChange={onChange} />
      ) : (
        <div className="rounded-xl border border-border bg-card p-6 text-center">
          <p className="text-sm text-muted-foreground">{t("video.none")}</p>
        </div>
      )}
      {past.length > 0 ? <History videos={past} /> : null}
    </section>
  );
}

function TodayVideo({ video, onChange }: { video: DailyVideo; onChange: () => Promise<void> }) {
  const { t, day } = useUi();
  const [src, setSrc] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [postUrl, setPostUrl] = useState("");

  useEffect(() => {
    setSrc(null);
    let active = true;
    void getVideoLink({ data: { videoId: video.id, accountId: video.account_id, track: false } })
      .then((r) => {
        if (active) setSrc(r.url);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [video.id, video.account_id]);

  const copy = async (text: string, okMessage: string) => {
    await navigator.clipboard.writeText(text);
    toast.success(okMessage);
  };

  const download = async () => {
    setBusy(true);
    try {
      const res = await getVideoLink({
        data: { videoId: video.id, accountId: video.account_id, track: true, download: true },
      });
      const outcome = await saveVideo(res.url, `video-${video.publish_date}-${video.language}.mp4`);
      if (outcome === "shared") toast.success(t("video.saved"));
      if (outcome === "downloaded") toast.success(t("video.downloaded"));
      await onChange();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("video.saveFailed"));
    } finally {
      setBusy(false);
    }
  };

  const declare = async () => {
    try {
      await markPosted({
        data: { videoId: video.id, accountId: video.account_id, url: postUrl.trim() },
      });
      setPostUrl("");
      await onChange();
      toast.success(t("video.declareOk"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.saveFailed"));
    }
  };

  // Le « # » est ajouté à l'affichage : il n'est jamais stocké.
  const hashtags = video.hashtags
    .map((h) => `#${h.replace(/^#+/, "")}`)
    .join(" ");

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="text-base font-semibold text-foreground">
        {t("video.titleOf", { date: day(video.publish_date) })}
      </h3>
      {video.title ? <p className="mt-1 text-sm text-muted-foreground">{video.title}</p> : null}

      <div className="mt-3 overflow-hidden rounded-lg border border-border bg-background">
        {src ? (
          <video src={src} controls playsInline className="mx-auto max-h-[60vh] w-full bg-black" />
        ) : (
          <div className="flex h-56 items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

      <Button className="mt-3 h-12 w-full text-base" onClick={download} disabled={busy}>
        {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Download className="mr-2 size-5" />}
        {t("video.save")}
      </Button>
      <p className="mt-1.5 text-center text-xs text-muted-foreground">{t("video.saveHint")}</p>

      {video.caption ? (
        <div className="mt-4 rounded-lg border border-border bg-background p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("video.caption")}
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => copy(video.caption, t("video.captionCopied"))}
            >
              <Copy className="mr-1.5 size-3.5" /> {t("common.copy")}
            </Button>
          </div>
          <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{video.caption}</p>
        </div>
      ) : null}

      {hashtags ? (
        <div className="mt-2 rounded-lg border border-border bg-background p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("video.hashtags")}
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => copy(hashtags, t("video.hashtagsCopied"))}
            >
              <Copy className="mr-1.5 size-3.5" /> {t("common.copy")}
            </Button>
          </div>
          <p className="mt-1 break-words text-sm text-foreground">{hashtags}</p>
        </div>
      ) : null}

      <div className="mt-4 space-y-2 rounded-lg border border-border bg-background p-3">
        <Label htmlFor={`lien-${video.account_id}`}>{t("video.declareLabel")}</Label>
        <Input
          id={`lien-${video.account_id}`}
          value={postUrl}
          onChange={(e) => setPostUrl(e.target.value)}
          placeholder="https://instagram.com/p/..."
          inputMode="url"
        />
        <Button
          variant="secondary"
          className="h-11 w-full"
          onClick={declare}
          disabled={!/^https?:\/\//.test(postUrl.trim())}
        >
          {t("video.declareCta")}
        </Button>
        {video.posted_url ? (
          <a
            href={video.posted_url}
            target="_blank"
            rel="noreferrer"
            className="block truncate text-xs text-primary hover:underline"
          >
            {video.posted_url}
          </a>
        ) : null}
      </div>
    </div>
  );
}

function History({ videos }: { videos: DailyVideo[] }) {
  const { t, day } = useUi();

  const download = async (v: DailyVideo) => {
    try {
      const res = await getVideoLink({
        data: { videoId: v.id, accountId: v.account_id, track: true, download: true },
      });
      const outcome = await saveVideo(res.url, `video-${v.publish_date}-${v.language}.mp4`);
      if (outcome === "shared") toast.success(t("video.saved"));
      if (outcome === "downloaded") toast.success(t("video.downloaded"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("video.saveFailed"));
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold text-foreground">{t("history.title")}</h3>
      <ul className="space-y-2">
        {videos.map((v) => (
          <li
            key={`${v.id}-${v.account_id}`}
            className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm text-foreground">{day(v.publish_date)}</p>
              <p className="truncate text-xs text-muted-foreground">
                {v.posted_at
                  ? t("history.posted")
                  : v.downloaded_at
                    ? t("history.downloaded")
                    : t("history.notDownloaded")}
                {v.title ? ` · ${v.title}` : ""}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => download(v)}>
              <Download className="size-4" />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------------------------------------------------------- contrat */

function ContractCard({
  contract,
  profile,
}: {
  contract: SignedContract | null;
  profile: PlatformProfile | null;
}) {
  const { t, lang } = useUi();
  const [open, setOpen] = useState(false);
  if (!contract) return null;

  const locale = localeOf(lang);

  const downloadPdf = async () => {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const margin = 48;
    const width = doc.internal.pageSize.getWidth() - margin * 2;
    let y = margin;

    const write = (text: string, size: number, bold: boolean) => {
      doc.setFont("helvetica", bold ? "bold" : "normal");
      doc.setFontSize(size);
      for (const line of doc.splitTextToSize(text, width) as string[]) {
        if (y > doc.internal.pageSize.getHeight() - margin) {
          doc.addPage();
          y = margin;
        }
        doc.text(line, margin, y);
        y += size + 4;
      }
    };

    for (const raw of contract.body.split("\n")) {
      const line = raw.trim();
      if (!line) {
        y += 6;
        continue;
      }
      if (line.startsWith("## ")) write(line.slice(3), 12, true);
      else if (line.startsWith("# ")) write(line.slice(2), 15, true);
      else write(line.replace(/\*\*/g, ""), 10, false);
    }

    y += 12;
    write(
      t("contract.signedLine", {
        name: contract.signed_full_name,
        email: profile?.email ?? "",
        date: new Date(contract.signed_at).toLocaleString(locale),
        version: contract.version,
      }),
      10,
      true,
    );
    doc.save(`contrat-v${contract.version}.pdf`);
  };

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{t("contract.title")}</h2>
          <p className="text-xs text-muted-foreground">
            {t("contract.meta", {
              version: contract.version,
              date: new Date(contract.signed_at).toLocaleDateString(locale),
              name: contract.signed_full_name,
            })}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={downloadPdf}>
          <FileText className="mr-1.5 size-4" /> PDF
        </Button>
      </div>
      <Button variant="ghost" size="sm" className="mt-2 px-0" onClick={() => setOpen((v) => !v)}>
        {open ? t("contract.hide") : t("contract.show")}
      </Button>
      {open ? (
        <div className="mt-2 max-h-80 overflow-y-auto rounded-lg border border-border bg-background p-4">
          <ContractMarkdown body={contract.body} />
        </div>
      ) : null}
    </section>
  );
}
