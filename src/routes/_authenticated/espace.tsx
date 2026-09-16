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
import { supabase } from "@/integrations/supabase/client";
import { languageLabel } from "@/lib/languages";
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
  component: PosterSpace,
});

function frDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function CopyField({ label, value }: { label: string; value: string }) {
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
            toast.success(`${label} copié`);
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
      const [s, c, t, v] = await Promise.all([
        getMySpace(),
        getMyContract(),
        getActiveContractTemplate(),
        listMyVideos(),
      ]);
      setSpace(s);
      setContract(c.contract);
      setTemplate(t.template);
      setVideoData(v);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Chargement impossible");
    } finally {
      setLoading(false);
    }
  }, [navigate]);

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
  const ready = allWarm && hasContract;

  return (
    <div className="min-h-screen bg-background pb-16">
      <Toaster />
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">Mon espace</p>
            <p className="truncate text-xs text-muted-foreground">{profile?.email}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onSignOut}>
            <LogOut className="size-4" />
            <span className="sr-only sm:not-sr-only sm:ml-2">Déconnexion</span>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 px-4 py-5">
        {accounts.length === 0 ? (
          <section className="rounded-xl border border-border bg-card p-6 text-center">
            <h1 className="text-base font-semibold text-foreground">Ton compte est en préparation</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              L'administrateur doit d'abord t'attribuer un compte à créer. Reviens dans quelques
              minutes, tout s'affichera ici.
            </p>
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
          <Badge variant="secondary">Compte prêt</Badge>
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
            Compte {languageLabel(account.language)}
          </h1>
          <span className="text-xs text-muted-foreground">Étape {done + 1} sur 5</span>
        </div>
        <Progress value={(done / 5) * 100} className="mt-3 h-2" />
        <p className="mt-3 text-sm text-muted-foreground">
          Suis les étapes dans l'ordre. Chaque valeur à recopier est affichée avec un bouton pour la
          copier.
        </p>
      </section>

      <StepGmail account={account} password={socialPassword} onChange={onChange} />
      <StepHandle account={account} password={socialPassword} onChange={onChange} />
      <StepPhoto account={account} bio={bio} onChange={onChange} />
      <StepWarmup account={account} onChange={onChange} />
    </div>
  );
}

function useStep(onChange: () => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      await onChange();
      toast.success(ok);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action impossible");
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
  const { busy, run } = useStep(onChange);
  const [gmail, setGmail] = useState(account.gmail_address || account.expected_gmail);
  const active = !account.gmail_done_at;

  return (
    <StepShell n={1} title="Créer l'adresse Gmail" active={active} done={Boolean(account.gmail_done_at)}>
      <p className="mb-3 text-sm text-muted-foreground">
        C'est une adresse dédiée à cette activité : n'utilise jamais ton adresse personnelle.
      </p>
      <div className="space-y-2">
        <CopyField label="Adresse à créer" value={account.expected_gmail} />
        <CopyField label="Mot de passe à utiliser" value={password} />
      </div>
      <div className="mt-3 space-y-1.5">
        <Label htmlFor={`gmail-${account.id}`}>Adresse réellement créée</Label>
        <Input
          id={`gmail-${account.id}`}
          type="email"
          inputMode="email"
          value={gmail}
          onChange={(e) => setGmail(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Si cette adresse était déjà prise, corrige-la ici : l'administrateur le verra.
        </p>
      </div>
      <Button
        className="mt-4 h-12 w-full"
        disabled={busy || !gmail.includes("@")}
        onClick={() =>
          run(async () => {
            await updateMyAccountIdentity({ data: { accountId: account.id, gmail: gmail.trim() } });
            await confirmAccountStep({ data: { accountId: account.id, step: "gmail" } });
          }, "Adresse Gmail enregistrée")
        }
      >
        {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
        L'adresse est créée, continuer
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
  const { busy, run } = useStep(onChange);
  const [handle, setHandle] = useState(account.handle || account.expected_handle);
  const active = Boolean(account.gmail_done_at) && !account.handle_done_at;

  return (
    <StepShell
      n={2}
      title="Créer le compte Instagram"
      active={active}
      done={Boolean(account.handle_done_at)}
    >
      <p className="mb-3 text-sm text-muted-foreground">
        Crée le compte AVEC l'adresse Gmail de l'étape 1 ({account.gmail_address}).
      </p>
      <div className="space-y-2">
        <CopyField label="Pseudo à créer" value={account.expected_handle} />
        <CopyField label="Mot de passe à utiliser" value={password} />
      </div>
      <div className="mt-3 space-y-1.5">
        <Label htmlFor={`handle-${account.id}`}>Pseudo réellement créé</Label>
        <Input
          id={`handle-${account.id}`}
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Si le pseudo était déjà pris, saisis celui que tu as obtenu.
        </p>
      </div>
      <Button
        className="mt-4 h-12 w-full"
        disabled={busy || handle.trim().length < 2}
        onClick={() =>
          run(async () => {
            await updateMyAccountIdentity({ data: { accountId: account.id, handle: handle.trim() } });
            await confirmAccountStep({ data: { accountId: account.id, step: "handle" } });
          }, "Compte Instagram enregistré")
        }
      >
        {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
        Le compte est créé, continuer
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
  const { busy, run } = useStep(onChange);
  const active = Boolean(account.handle_done_at) && !account.photo_done_at;

  return (
    <StepShell n={3} title="Photo de profil et biographie" active={active} done={Boolean(account.photo_done_at)}>
      <p className="mb-3 text-sm text-muted-foreground">
        Télécharge le logo Sophia et mets-le en photo de profil, puis colle la biographie.
      </p>
      <a
        href={sophiaLogo.url}
        download="sophia-photo-de-profil.png"
        className="mb-3 flex items-center gap-3 rounded-lg border border-border bg-background p-3"
      >
        <img
          src={sophiaLogo.url}
          alt="Logo Sophia à utiliser en photo de profil"
          className="size-14 rounded-lg object-cover"
        />
        <span className="flex items-center gap-2 text-sm font-medium text-foreground">
          <ImageDown className="size-4" /> Télécharger la photo de profil
        </span>
      </a>
      <CopyField label="Biographie du compte" value={bio} />
      <Button
        className="mt-4 h-12 w-full"
        disabled={busy}
        onClick={() =>
          run(
            () => confirmAccountStep({ data: { accountId: account.id, step: "photo" } }),
            "Photo et biographie enregistrées",
          )
        }
      >
        {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
        C'est fait, démarrer la chauffe de 24 h
      </Button>
    </StepShell>
  );
}

function StepWarmup({ account, onChange }: { account: PosterAccount; onChange: () => Promise<void> }) {
  const { busy, run } = useStep(onChange);
  const active = Boolean(account.photo_done_at) && !account.warmup_done_at;
  const started = account.warmup_started_at ? new Date(account.warmup_started_at).getTime() : 0;
  const endsAt = started + 24 * 3600_000;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);

  const left = Math.max(0, endsAt - now);
  const h = Math.floor(left / 3600_000);
  const m = Math.floor((left % 3600_000) / 60_000);
  const s = Math.floor((left % 60_000) / 1000);
  const over = left === 0 && started > 0;

  return (
    <StepShell n={4} title="Chauffe du compte — 24 heures" active={active} done={Boolean(account.warmup_done_at)}>
      <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
        <p className="text-sm text-foreground">
          Aucune publication pendant 24 heures : un compte neuf qui publie tout de suite est traité
          comme un robot et sa portée est bridée durablement.
        </p>
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
            <span>{task.label}</span>
          </li>
        ))}
      </ul>

      <Button
        className="mt-4 h-12 w-full"
        disabled={busy || !over}
        onClick={() =>
          run(
            () => confirmAccountStep({ data: { accountId: account.id, step: "warmup" } }),
            "Compte prêt à publier",
          )
        }
      >
        {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
        {over ? "Les 24 h sont passées, continuer" : "Disponible à la fin du compte à rebours"}
      </Button>
    </StepShell>
  );
}

function FixValues({ account, onChange }: { account: PosterAccount; onChange: () => Promise<void> }) {
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
          Ces valeurs diffèrent de la convention ({account.expected_handle} ·{" "}
          {account.expected_gmail}).
        </p>
      ) : null}
      <Button variant="ghost" size="sm" className="px-0" onClick={() => setOpen((v) => !v)}>
        {open ? "Fermer" : "Corriger mon pseudo ou mon adresse"}
      </Button>
      {open ? (
        <div className="mt-2 space-y-2 rounded-lg border border-border bg-background p-3">
          <div className="space-y-1.5">
            <Label htmlFor={`fix-handle-${account.id}`}>Pseudo</Label>
            <Input id={`fix-handle-${account.id}`} value={handle} onChange={(e) => setHandle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`fix-gmail-${account.id}`}>Adresse Gmail</Label>
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
                toast.success("Valeurs mises à jour");
                setOpen(false);
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Enregistrement impossible");
              } finally {
                setBusy(false);
              }
            }}
          >
            Enregistrer
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
  const [name, setName] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);

  if (done) return null;

  const sign = async () => {
    setBusy(true);
    try {
      await signContract({ data: { fullName: name.trim(), accepted: true } });
      await onDone();
      toast.success("Contrat signé");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Signature impossible");
    } finally {
      setBusy(false);
    }
  };

  return (
    <StepShell n={5} title="Lire et signer le contrat" active={active} done={false}>
      {template ? (
        <>
          <p className="mb-2 text-sm font-medium text-foreground">{template.title}</p>
          <div className="max-h-80 overflow-y-auto rounded-lg border border-border bg-background p-4">
            <ContractMarkdown body={template.body} />
          </div>
          <div className="mt-4 space-y-1.5">
            <Label htmlFor="signature">Ton nom complet, en toutes lettres</Label>
            <Input
              id="signature"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Prénom Nom"
              autoComplete="name"
            />
          </div>
          <label className="mt-3 flex items-start gap-2 text-sm text-muted-foreground">
            <Checkbox checked={accepted} onCheckedChange={(v) => setAccepted(v === true)} />
            <span>J'ai lu et j'accepte l'intégralité du contrat ci-dessus.</span>
          </label>
          <Button
            className="mt-4 h-12 w-full"
            onClick={sign}
            disabled={busy || !accepted || name.trim().length < 3}
          >
            {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Signer et accéder à mon espace
          </Button>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Aucun contrat n'est disponible pour l'instant.</p>
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
  const video = videos.find((v) => v.publish_date === today);
  // Historique : uniquement des dates PASSÉES, jamais aujourd'hui ni le futur.
  const past = videos.filter((v) => isPast(v.publish_date, today));

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2 px-1">
        <h2 className="text-sm font-semibold text-foreground">
          @{account.handle} · {languageLabel(account.language)}
        </h2>
        {video?.posted_at ? <Badge variant="secondary">Publiée</Badge> : null}
      </div>
      {!warmDone ? (
        <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
          Ton compte n'a pas terminé ses 24 h de chauffe. Prépare ta publication, mais ne publie
          qu'une fois la chauffe validée.
        </p>
      ) : null}
      {video ? (
        <TodayVideo video={video} onChange={onChange} />
      ) : (
        <div className="rounded-xl border border-border bg-card p-6 text-center">
          <p className="text-sm text-muted-foreground">
            La vidéo du jour n'est pas encore publiée pour ce compte. Reviens un peu plus tard.
          </p>
        </div>
      )}
      {past.length > 0 ? <History videos={past} /> : null}
    </section>
  );
}

function TodayVideo({ video, onChange }: { video: DailyVideo; onChange: () => Promise<void> }) {
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

  const copy = async (text: string, what: string) => {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copiée`);
  };

  const download = async () => {
    setBusy(true);
    try {
      const res = await getVideoLink({
        data: { videoId: video.id, accountId: video.account_id, track: true },
      });
      const a = document.createElement("a");
      a.href = res.url;
      a.download = `video-${video.publish_date}-${video.language}.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      await onChange();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Téléchargement impossible");
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
      toast.success("Publication enregistrée");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enregistrement impossible");
    }
  };

  // Le « # » est ajouté à l'affichage : il n'est jamais stocké.
  const hashtags = video.hashtags
    .map((h) => `#${h.replace(/^#+/, "")}`)
    .join(" ");

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="text-base font-semibold text-foreground">Vidéo du {frDate(video.publish_date)}</h3>
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
        Télécharger le MP4
      </Button>

      {video.caption ? (
        <div className="mt-4 rounded-lg border border-border bg-background p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Légende</p>
            <Button variant="ghost" size="sm" onClick={() => copy(video.caption, "Légende")}>
              <Copy className="mr-1.5 size-3.5" /> Copier
            </Button>
          </div>
          <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{video.caption}</p>
        </div>
      ) : null}

      {hashtags ? (
        <div className="mt-2 rounded-lg border border-border bg-background p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Hashtags</p>
            <Button variant="ghost" size="sm" onClick={() => copy(hashtags, "Liste de hashtags")}>
              <Copy className="mr-1.5 size-3.5" /> Copier
            </Button>
          </div>
          <p className="mt-1 break-words text-sm text-foreground">{hashtags}</p>
        </div>
      ) : null}

      <div className="mt-4 space-y-2 rounded-lg border border-border bg-background p-3">
        <Label htmlFor={`lien-${video.account_id}`}>J'ai publié — colle le lien de ta publication</Label>
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
          Enregistrer ma publication
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
  const download = async (v: DailyVideo) => {
    try {
      const res = await getVideoLink({
        data: { videoId: v.id, accountId: v.account_id, track: true },
      });
      const a = document.createElement("a");
      a.href = res.url;
      a.download = `video-${v.publish_date}-${v.language}.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Téléchargement impossible");
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold text-foreground">30 derniers jours</h3>
      <ul className="space-y-2">
        {videos.map((v) => (
          <li
            key={`${v.id}-${v.account_id}`}
            className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm text-foreground">{frDate(v.publish_date)}</p>
              <p className="truncate text-xs text-muted-foreground">
                {v.posted_at ? "Publiée" : v.downloaded_at ? "Téléchargée" : "Non téléchargée"}
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
  const [open, setOpen] = useState(false);
  if (!contract) return null;

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
      `Signé électroniquement par ${contract.signed_full_name} (${profile?.email ?? ""}) le ${new Date(
        contract.signed_at,
      ).toLocaleString("fr-FR")} — version ${contract.version}.`,
      10,
      true,
    );
    doc.save(`contrat-v${contract.version}.pdf`);
  };

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Mon contrat signé</h2>
          <p className="text-xs text-muted-foreground">
            Version {contract.version} · signé le {new Date(contract.signed_at).toLocaleDateString("fr-FR")} par{" "}
            {contract.signed_full_name}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={downloadPdf}>
          <FileText className="mr-1.5 size-4" /> PDF
        </Button>
      </div>
      <Button variant="ghost" size="sm" className="mt-2 px-0" onClick={() => setOpen((v) => !v)}>
        {open ? "Masquer le texte" : "Relire le texte"}
      </Button>
      {open ? (
        <div className="mt-2 max-h-80 overflow-y-auto rounded-lg border border-border bg-background p-4">
          <ContractMarkdown body={contract.body} />
        </div>
      ) : null}
    </section>
  );
}
