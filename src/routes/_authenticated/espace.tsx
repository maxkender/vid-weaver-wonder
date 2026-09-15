import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  LogOut,
  Mail,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

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
  addMyAccount,
  deleteMyAccount,
  getActiveContractTemplate,
  getMyContract,
  getMyProfile,
  getVideoLink,
  listMyAccounts,
  listMyVideos,
  markPosted,
  saveGmailAddress,
  signContract,
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
          "Récupère la vidéo du jour dans ta langue, sa légende et ses hashtags, puis déclare ta publication.",
      },
      { property: "og:title", content: "Espace posteur — vidéo du jour" },
      {
        property: "og:description",
        content: "Téléchargement de la vidéo quotidienne, légende prête à copier et suivi des publications.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PosterSpace,
});

const PLATFORMS = [
  { id: "instagram", label: "Instagram" },
  { id: "tiktok", label: "TikTok" },
  { id: "youtube", label: "YouTube" },
] as const;

const ACCOUNT_STATUS: Record<string, string> = {
  pending: "En attente de validation",
  active: "Actif",
  suspended: "Suspendu",
  recovered: "Repris par l'entreprise",
};

function frDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function PosterSpace() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<PlatformProfile | null>(null);
  const [accounts, setAccounts] = useState<PosterAccount[]>([]);
  const [contract, setContract] = useState<SignedContract | null>(null);
  const [template, setTemplate] = useState<{ version: number; title: string; body: string } | null>(
    null,
  );
  const [videos, setVideos] = useState<DailyVideo[]>([]);
  const [today, setToday] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const p = await getMyProfile();
      setProfile(p);
      if (p.role === "admin") {
        await navigate({ to: "/admin", replace: true });
        return;
      }
      const [a, c, t, v] = await Promise.all([
        listMyAccounts(),
        getMyContract(),
        getActiveContractTemplate(),
        listMyVideos(),
      ]);
      setAccounts(a.accounts);
      setContract(c.contract);
      setTemplate(t.template);
      setVideos(v.videos);
      setToday(v.today);
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

  const hasGmail = Boolean(profile?.gmail_address);
  const hasAccount = accounts.length > 0;
  const hasContract = Boolean(contract);
  const steps = [hasGmail, hasAccount, hasContract];
  const done = steps.filter(Boolean).length;

  return (
    <div className="min-h-screen bg-background pb-16">
      <Toaster />
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">Mon espace</p>
            <p className="truncate text-xs text-muted-foreground">
              {profile?.email} · {languageLabel(profile?.language ?? "fr")}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onSignOut}>
            <LogOut className="size-4" />
            <span className="sr-only sm:not-sr-only sm:ml-2">Déconnexion</span>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 px-4 py-5">
        {done < 3 ? (
          <Onboarding
            done={done}
            hasGmail={hasGmail}
            hasAccount={hasAccount}
            gmail={profile?.gmail_address ?? ""}
            accounts={accounts}
            template={template}
            onDone={refresh}
          />
        ) : (
          <>
            <TodayVideo videos={videos} today={today} onChange={refresh} />
            <History videos={videos} today={today} />
            <AccountsCard accounts={accounts} onChange={refresh} showAdd />
            <ContractCard contract={contract} profile={profile} />
          </>
        )}
      </main>
    </div>
  );
}

/* ---------------------------------------------------------------- parcours */

function Onboarding({
  done,
  hasGmail,
  hasAccount,
  gmail,
  accounts,
  template,
  onDone,
}: {
  done: number;
  hasGmail: boolean;
  hasAccount: boolean;
  gmail: string;
  accounts: PosterAccount[];
  template: { version: number; title: string; body: string } | null;
  onDone: () => Promise<void>;
}) {
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-base font-semibold text-foreground">Ton installation</h1>
          <span className="text-xs text-muted-foreground">Étape {Math.min(done + 1, 3)} sur 3</span>
        </div>
        <Progress value={(done / 3) * 100} className="mt-3 h-2" />
        <p className="mt-3 text-sm text-muted-foreground">
          Trois étapes à terminer avant de recevoir la vidéo du jour.
        </p>
      </section>

      <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4">
        <ShieldAlert className="mt-0.5 size-5 shrink-0 text-destructive" />
        <p className="text-sm text-foreground">
          Ne communique jamais ton mot de passe ici, ni à qui que ce soit par message. Aucun
          mot de passe de Gmail, Instagram ou TikTok ne t'est demandé sur cette plateforme.
        </p>
      </div>

      <StepGmail active={!hasGmail} gmail={gmail} onDone={onDone} />
      <StepAccounts active={hasGmail && !hasAccount} unlocked={hasGmail} accounts={accounts} onDone={onDone} />
      <StepContract active={hasGmail && hasAccount} template={template} onDone={onDone} />
    </div>
  );
}

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
          className={`flex size-6 items-center justify-center rounded-full text-xs font-semibold ${done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
        >
          {done ? <Check className="size-3.5" /> : n}
        </span>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      {active || done ? <div className="mt-4">{children}</div> : null}
    </section>
  );
}

function StepGmail({ active, gmail, onDone }: { active: boolean; gmail: string; onDone: () => Promise<void> }) {
  const [value, setValue] = useState(gmail);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await saveGmailAddress({ data: { gmail: value.trim() } });
      await onDone();
      toast.success("Adresse enregistrée");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enregistrement impossible");
    } finally {
      setBusy(false);
    }
  };

  return (
    <StepShell n={1} title="Créer ton adresse Gmail dédiée" active={active} done={!active}>
      {active ? (
        <>
          <ol className="mb-4 space-y-1.5 text-sm text-muted-foreground">
            <li>1. Va sur gmail.com et crée une adresse neuve, uniquement pour cette activité.</li>
            <li>2. N'utilise jamais ton adresse personnelle ni une adresse déjà liée à tes réseaux.</li>
            <li>3. Choisis un mot de passe solide et garde-le pour toi.</li>
          </ol>
          <div className="space-y-1.5">
            <Label htmlFor="gmail">Adresse Gmail créée</Label>
            <Input
              id="gmail"
              type="email"
              inputMode="email"
              placeholder="prenom.diffusion@gmail.com"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Mail className="size-3.5" /> Seule l'adresse est demandée. Jamais le mot de passe.
          </p>
          <Button className="mt-4 h-11 w-full" onClick={save} disabled={busy || !value.includes("@")}>
            {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Enregistrer et continuer
          </Button>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">{gmail}</p>
      )}
    </StepShell>
  );
}

function StepAccounts({
  active,
  unlocked,
  accounts,
  onDone,
}: {
  active: boolean;
  unlocked: boolean;
  accounts: PosterAccount[];
  onDone: () => Promise<void>;
}) {
  return (
    <StepShell n={2} title="Créer ton compte Instagram" active={active || (unlocked && accounts.length > 0)} done={accounts.length > 0}>
      {accounts.length === 0 ? (
        <ol className="mb-4 space-y-1.5 text-sm text-muted-foreground">
          <li>1. Installe Instagram et crée un compte AVEC l'adresse Gmail de l'étape 1.</li>
          <li>2. Termine la vérification par e-mail.</li>
          <li>3. Reviens ici et saisis ton nom d'utilisateur et le lien de ton profil.</li>
        </ol>
      ) : null}
      <AccountsCard accounts={accounts} onChange={onDone} showAdd bare />
    </StepShell>
  );
}

function StepContract({
  active,
  template,
  onDone,
}: {
  active: boolean;
  template: { version: number; title: string; body: string } | null;
  onDone: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);

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
    <StepShell n={3} title="Lire et signer le contrat" active={active} done={false}>
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
            className="mt-4 h-11 w-full"
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

/* ----------------------------------------------------------------- comptes */

function AccountsCard({
  accounts,
  onChange,
  showAdd,
  bare,
}: {
  accounts: PosterAccount[];
  onChange: () => Promise<void>;
  showAdd?: boolean;
  bare?: boolean;
}) {
  const [platform, setPlatform] = useState<"instagram" | "tiktok" | "youtube">("instagram");
  const [handle, setHandle] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const add = async () => {
    setBusy(true);
    try {
      await addMyAccount({ data: { platform, handle: handle.trim(), profileUrl: url.trim() } });
      setHandle("");
      setUrl("");
      await onChange();
      toast.success("Compte ajouté");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ajout impossible");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteMyAccount({ data: { id } });
      await onChange();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Suppression impossible");
    }
  };

  const body = (
    <>
      {accounts.length > 0 ? (
        <ul className="space-y-2">
          {accounts.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {PLATFORMS.find((p) => p.id === a.platform)?.label} · @{a.handle}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {ACCOUNT_STATUS[a.status] ?? a.status}
                  {a.followers > 0 ? ` · ${a.followers} abonnés` : ""}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {a.profile_url ? (
                  <a
                    href={a.profile_url}
                    target="_blank"
                    rel="noreferrer"
                    className="p-2 text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="size-4" />
                  </a>
                ) : null}
                <button
                  className="p-2 text-muted-foreground hover:text-destructive"
                  onClick={() => remove(a.id)}
                  aria-label="Retirer ce compte"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {showAdd ? (
        <div className="mt-3 space-y-3 rounded-lg border border-border bg-background p-3">
          <div className="flex gap-2">
            {PLATFORMS.map((p) => (
              <button
                key={p.id}
                onClick={() => setPlatform(p.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium ${platform === p.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="handle">Nom d'utilisateur</Label>
            <Input id="handle" value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="moncompte" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="url">Lien du profil</Label>
            <Input
              id="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://instagram.com/moncompte"
            />
          </div>
          <Button className="h-11 w-full" onClick={add} disabled={busy || handle.trim().length < 2}>
            {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Ajouter ce compte
          </Button>
        </div>
      ) : null}
    </>
  );

  if (bare) return body;
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold text-foreground">Mes comptes</h2>
      {body}
    </section>
  );
}

/* ------------------------------------------------------------ vidéo du jour */

function useVideoLink() {
  return useCallback(async (videoId: string, track: boolean) => {
    const res = await getVideoLink({ data: { videoId, track } });
    return res.url;
  }, []);
}

function TodayVideo({
  videos,
  today,
  onChange,
}: {
  videos: DailyVideo[];
  today: string;
  onChange: () => Promise<void>;
}) {
  const video = videos.find((v) => v.publish_date === today);
  const getLink = useVideoLink();
  const [src, setSrc] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [postUrl, setPostUrl] = useState("");

  useEffect(() => {
    setSrc(null);
    if (!video) return;
    let active = true;
    void getLink(video.id, false)
      .then((u) => {
        if (active) setSrc(u);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [video, getLink]);

  if (!video) {
    return (
      <section className="rounded-xl border border-border bg-card p-6 text-center">
        <h1 className="text-base font-semibold text-foreground">La vidéo du jour arrive</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Elle n'est pas encore publiée dans ta langue. Reviens un peu plus tard dans la journée.
        </p>
      </section>
    );
  }

  const copy = async (text: string, what: string) => {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copiée`);
  };

  const download = async () => {
    setBusy(true);
    try {
      const url = await getLink(video.id, true);
      const a = document.createElement("a");
      a.href = url;
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
      await markPosted({ data: { videoId: video.id, url: postUrl.trim() } });
      setPostUrl("");
      await onChange();
      toast.success("Publication enregistrée");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enregistrement impossible");
    }
  };

  const hashtags = video.hashtags.join(" ");

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-base font-semibold text-foreground">Vidéo du {frDate(video.publish_date)}</h1>
        {video.posted_at ? <Badge variant="secondary">Publiée</Badge> : null}
      </div>
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
        <Label htmlFor="lien">J'ai publié — colle le lien de ta publication</Label>
        <Input
          id="lien"
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
    </section>
  );
}

function History({ videos, today }: { videos: DailyVideo[]; today: string }) {
  const past = videos.filter((v) => v.publish_date !== today);
  const getLink = useVideoLink();

  if (past.length === 0) return null;

  const download = async (v: DailyVideo) => {
    try {
      const url = await getLink(v.id, true);
      const a = document.createElement("a");
      a.href = url;
      a.download = `video-${v.publish_date}-${v.language}.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Téléchargement impossible");
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold text-foreground">30 derniers jours</h2>
      <ul className="space-y-2">
        {past.map((v) => (
          <li
            key={v.id}
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
    </section>
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
