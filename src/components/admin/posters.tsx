import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy, KeyRound, Loader2, Pause, Play, RotateCcw, Trash2, UserPlus, X } from "lucide-react";
import { toast } from "sonner";

import { ContractMarkdown } from "@/components/contract-markdown";
import {
  buildLogin,
  createAccountForPoster,
  createPoster,
  deletePoster,
  getConventions,
  getPosterDetail,
  listPosters,
  resetAccountStep,
  resetPosterPassword,
  setPosterStatus,
  type AdminPoster,
} from "@/lib/admin.functions";
import {
  DEFAULT_CONVENTIONS,
  conventionGmail,
  conventionHandle,
  defaultCountryFor,
  normalizeCountry,
  type ConventionRow,
} from "@/lib/conventions";
import { MASTER_LANGUAGES } from "@/lib/languages";

type Detail = Awaited<ReturnType<typeof getPosterDetail>>;
type DetailAccount = Detail["accounts"][number];

type CreatedAccess = {
  email: string;
  password: string;
  handle: string;
  gmail: string;
  messageFr: string;
  messageEn: string;
};

function CopyButton({ value, label }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="btn-base btn-ghost px-2 py-1 text-xs"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {label ?? "Copier"}
    </button>
  );
}

const STEP_LABELS: { key: "gmail" | "handle" | "photo" | "warmup"; label: string }[] = [
  { key: "gmail", label: "Gmail" },
  { key: "handle", label: "Instagram" },
  { key: "photo", label: "Photo" },
  { key: "warmup", label: "Chauffe" },
];

function stepState(a: DetailAccount) {
  return {
    gmail: Boolean(a.gmail_done_at),
    handle: Boolean(a.handle_done_at),
    photo: Boolean(a.photo_done_at),
    warmup: Boolean(a.warmup_done_at),
  };
}

export function AdminPosters() {
  const runList = useServerFn(listPosters);
  const runCreate = useServerFn(createPoster);
  const runReset = useServerFn(resetPosterPassword);
  const runStatus = useServerFn(setPosterStatus);
  const runDelete = useServerFn(deletePoster);
  const runDetail = useServerFn(getPosterDetail);
  const runConventions = useServerFn(getConventions);
  const runAddAccount = useServerFn(createAccountForPoster);
  const runResetStep = useServerFn(resetAccountStep);

  const [posters, setPosters] = useState<AdminPoster[]>([]);
  const [conv, setConv] = useState<ConventionRow>(DEFAULT_CONVENTIONS);
  const [loading, setLoading] = useState(true);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [language, setLanguage] = useState("fr");
  const [country, setCountry] = useState("fr");
  const [countryTouched, setCountryTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<CreatedAccess | null>(null);
  const [messageLang, setMessageLang] = useState<"fr" | "en">("fr");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AdminPoster | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [list, c] = await Promise.all([runList(), runConventions()]);
      setPosters((list as { posters: AdminPoster[] }).posters);
      setConv((c as { conventions: ConventionRow }).conventions);
    } finally {
      setLoading(false);
    }
  }, [runList, runConventions]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useMemo(
    () => (firstName.trim() ? buildLogin(firstName, lastName) : "—"),
    [firstName, lastName],
  );
  const code = normalizeCountry(country || defaultCountryFor(language));
  const handlePreview = conventionHandle(conv, code);
  const gmailPreview = conventionGmail(conv, code);

  const onLanguage = (value: string) => {
    setLanguage(value);
    if (!countryTouched) setCountry(defaultCountryFor(value));
  };

  const onCreate = async () => {
    setBusy(true);
    try {
      const res = (await runCreate({
        data: { firstName, lastName, language: language as "fr", countryCode: code },
      })) as CreatedAccess;
      setCreated(res);
      setFirstName("");
      setLastName("");
      setCountryTouched(false);
      await refresh();
      toast.success("Posteur créé");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Création impossible");
    } finally {
      setBusy(false);
    }
  };

  const openDetail = async (id: string) => {
    setDetail((await runDetail({ data: { id } })) as Detail);
  };

  return (
    <div className="space-y-4">
      {/* CRÉATION */}
      <section className="surface-card p-3">
        <p className="label-x flex items-center gap-1.5">
          <UserPlus className="h-3.5 w-3.5" /> Ajouter un posteur
        </p>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <div>
            <p className="label-x">Prénom</p>
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className="field mt-1 w-40 text-xs" />
          </div>
          <div>
            <p className="label-x">Nom</p>
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} className="field mt-1 w-40 text-xs" />
          </div>
          <div>
            <p className="label-x">Langue de publication</p>
            <select value={language} onChange={(e) => onLanguage(e.target.value)} className="field mt-1 w-36 text-xs">
              {MASTER_LANGUAGES.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <p className="label-x">Code pays</p>
            <input
              value={country}
              onChange={(e) => {
                setCountryTouched(true);
                setCountry(e.target.value.toLowerCase().slice(0, 2));
              }}
              className="field mt-1 w-20 text-xs"
            />
          </div>
          <button
            onClick={onCreate}
            disabled={busy || firstName.trim().length < 2 || lastName.trim().length < 1}
            className="btn-base btn-primary text-xs"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Créer l'accès
          </button>
        </div>

        <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
          <div className="rounded-[10px] border border-border p-2">
            <p className="label-x">Identifiant de connexion</p>
            <p className="mt-1 font-mono text-sm">{login}</p>
          </div>
          <div className="rounded-[10px] border border-border p-2">
            <p className="label-x">Pseudo Instagram</p>
            <p className="mt-1 font-mono text-sm">{handlePreview}</p>
          </div>
          <div className="rounded-[10px] border border-border p-2">
            <p className="label-x">Adresse Gmail</p>
            <p className="mt-1 font-mono text-sm">{gmailPreview}</p>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          L'identifiant n'est pas une vraie boîte mail : il sert uniquement à se connecter ici. Le mot
          de passe de la plateforme est généré, différent pour chaque posteur, et affiché une seule
          fois ci-dessous.
        </p>

        {created ? (
          <div className="mt-3 space-y-3 rounded-[10px] border border-primary/50 bg-primary/10 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-3">
              <span>
                Accès créé : <span className="font-mono">{created.email}</span> · mot de passe{" "}
                <span className="font-mono">{created.password}</span>
              </span>
              <CopyButton value={created.password} label="Copier le mot de passe" />
              <button className="btn-base btn-ghost px-2 py-1 text-xs" onClick={() => setCreated(null)}>
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Ce mot de passe ne sera plus affiché. Compte à créer : {created.handle} ·{" "}
              {created.gmail}
            </p>
            <div>
              <div className="flex items-center gap-2">
                <p className="label-x">Message à envoyer sur Upwork</p>
                <div className="flex gap-1">
                  {(["fr", "en"] as const).map((l) => (
                    <button
                      key={l}
                      onClick={() => setMessageLang(l)}
                      className={`rounded-[6px] px-2 py-0.5 text-[11px] ${messageLang === l ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                    >
                      {l.toUpperCase()}
                    </button>
                  ))}
                </div>
                <CopyButton
                  value={messageLang === "fr" ? created.messageFr : created.messageEn}
                  label="Copier le message"
                />
              </div>
              <pre className="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap rounded-[10px] border border-border bg-background p-3 text-xs">
                {messageLang === "fr" ? created.messageFr : created.messageEn}
              </pre>
            </div>
          </div>
        ) : null}
      </section>

      {/* LISTE */}
      <section className="surface-card overflow-x-auto p-0">
        <table className="w-full min-w-[1000px] text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr className="border-b border-border">
              <th className="px-3 py-2">Identifiant</th>
              <th className="px-3 py-2">Nom</th>
              <th className="px-3 py-2">Comptes</th>
              <th className="px-3 py-2">Contrat</th>
              <th className="px-3 py-2">Dernière connexion</th>
              <th className="px-3 py-2">Dernier téléchargement</th>
              <th className="px-3 py-2">Dernière publication</th>
              <th className="px-3 py-2">Statut</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {posters.map((p) => (
              <tr key={p.id} className="border-b border-border/60">
                <td className="px-3 py-1.5 font-mono text-xs">{p.email}</td>
                <td className="px-3 py-1.5">
                  <button className="hover:underline" onClick={() => void openDetail(p.id)}>
                    {p.full_name || "—"}
                  </button>
                  {p.role === "admin" ? (
                    <span className="ml-2 rounded-[6px] bg-muted px-1.5 py-0.5 text-[10px]">admin</span>
                  ) : null}
                </td>
                <td className="px-3 py-1.5 text-xs">{p.accounts}</td>
                <td className="px-3 py-1.5 text-[11px]">
                  <span className={p.has_contract ? "text-foreground" : "text-muted-foreground"}>
                    {p.has_contract ? "signé" : "non signé"}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-xs text-muted-foreground">
                  {p.last_sign_in_at ? new Date(p.last_sign_in_at).toLocaleString("fr-FR") : "jamais"}
                </td>
                <td className="px-3 py-1.5 text-xs text-muted-foreground">
                  {p.last_download_at ? new Date(p.last_download_at).toLocaleDateString("fr-FR") : "—"}
                </td>
                <td className="px-3 py-1.5 text-xs text-muted-foreground">
                  {p.last_post_at ? new Date(p.last_post_at).toLocaleDateString("fr-FR") : "—"}
                </td>
                <td className="px-3 py-1.5 text-xs">{p.status}</td>
                <td className="px-3 py-1.5">
                  <div className="flex justify-end gap-1">
                    <button
                      className="btn-base btn-ghost px-2 py-1 text-xs"
                      title="Régénérer le mot de passe de la plateforme"
                      onClick={async () => {
                        const res = (await runReset({ data: { id: p.id } })) as {
                          password: string;
                          messageFr: string;
                          messageEn: string;
                        };
                        setCreated({
                          email: p.email,
                          password: res.password,
                          handle: "",
                          gmail: "",
                          messageFr: res.messageFr,
                          messageEn: res.messageEn,
                        });
                        toast.success("Nouveau mot de passe généré");
                      }}
                    >
                      <KeyRound className="h-3.5 w-3.5" />
                    </button>
                    <button
                      className="btn-base btn-ghost px-2 py-1 text-xs"
                      title={p.status === "suspended" ? "Réactiver" : "Suspendre"}
                      onClick={async () => {
                        await runStatus({
                          data: { id: p.id, status: p.status === "suspended" ? "active" : "suspended" },
                        });
                        await refresh();
                      }}
                    >
                      {p.status === "suspended" ? (
                        <Play className="h-3.5 w-3.5" />
                      ) : (
                        <Pause className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <button
                      className="btn-base btn-ghost px-2 py-1 text-xs"
                      title="Supprimer"
                      onClick={() => setConfirmDelete(p)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {loading ? (
              <tr>
                <td colSpan={9} className="px-3 py-4 text-xs text-muted-foreground">
                  Chargement…
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      {/* FICHE */}
      {detail?.profile ? (
        <section className="surface-card p-3">
          <div className="flex items-center justify-between">
            <p className="label-x">Fiche de {detail.profile.full_name || detail.profile.email}</p>
            <button className="btn-base btn-ghost px-2 py-1 text-xs" onClick={() => setDetail(null)}>
              <X className="h-3.5 w-3.5" /> Fermer
            </button>
          </div>
          <div className="mt-2 grid gap-3 lg:grid-cols-2">
            <div>
              <p className="text-xs text-muted-foreground">
                Identifiant : <span className="font-mono">{detail.profile.email}</span>
              </p>

              <div className="mt-3 flex items-center gap-2">
                <p className="label-x">Comptes ({detail.accounts.length})</p>
                <select
                  className="field w-28 text-[11px]"
                  value=""
                  onChange={async (e) => {
                    if (!e.target.value) return;
                    await runAddAccount({
                      data: { posterId: detail.profile!.id, language: e.target.value as "fr" },
                    });
                    await openDetail(detail.profile!.id);
                    toast.success("Compte ajouté");
                  }}
                >
                  <option value="">+ Ajouter</option>
                  {MASTER_LANGUAGES.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>

              <ul className="mt-2 space-y-2 text-sm">
                {detail.accounts.map((a) => {
                  const state = stepState(a);
                  const expectedHandle = conventionHandle(conv, a.country_code);
                  const expectedGmail = conventionGmail(conv, a.country_code);
                  return (
                    <li key={a.id} className="rounded-[10px] border border-border p-2">
                      <p className="text-sm">
                        <span className="capitalize">{a.platform}</span> · @{a.handle} ·{" "}
                        {a.language.toUpperCase()} / {a.country_code.toUpperCase()}
                      </p>
                      <p className="text-[11px] text-muted-foreground">{a.gmail_address ?? "—"}</p>
                      {a.handle !== expectedHandle || a.gmail_address !== expectedGmail ? (
                        <p className="mt-0.5 text-[11px] text-amber-500">
                          Diverge de la convention ({expectedHandle} · {expectedGmail})
                        </p>
                      ) : null}
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {STEP_LABELS.map((s) => (
                          <span
                            key={s.key}
                            className={`inline-flex items-center gap-1 rounded-[6px] px-1.5 py-0.5 text-[10px] ${state[s.key] ? "bg-primary/20 text-foreground" : "bg-muted text-muted-foreground"}`}
                          >
                            {s.label}
                            <button
                              title={`Réinitialiser l'étape ${s.label}`}
                              onClick={async () => {
                                await runResetStep({ data: { accountId: a.id, step: s.key } });
                                await openDetail(detail.profile!.id);
                                toast.success("Étape réinitialisée");
                              }}
                            >
                              <RotateCcw className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    </li>
                  );
                })}
                {detail.accounts.length === 0 ? (
                  <li className="text-xs text-muted-foreground">Aucun compte.</li>
                ) : null}
              </ul>

              <p className="label-x mt-3">Téléchargements & publications</p>
              <ul className="mt-1 max-h-48 space-y-1 overflow-y-auto text-xs text-muted-foreground">
                {detail.downloads.map((d) => (
                  <li key={d.id}>
                    {new Date(d.downloaded_at).toLocaleDateString("fr-FR")} ·{" "}
                    {d.posted_url ? (
                      <a href={d.posted_url} target="_blank" rel="noreferrer" className="underline">
                        publication
                      </a>
                    ) : (
                      "non publié"
                    )}
                  </li>
                ))}
                {detail.downloads.length === 0 ? <li>Aucun téléchargement.</li> : null}
              </ul>
            </div>
            <div>
              <p className="label-x">Contrat signé</p>
              {detail.contract ? (
                <>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Version {detail.contract.version} · signé par {detail.contract.signed_full_name} le{" "}
                    {new Date(detail.contract.signed_at).toLocaleString("fr-FR")}
                  </p>
                  <div className="mt-2 max-h-72 overflow-y-auto rounded-[10px] border border-border p-3">
                    <ContractMarkdown body={detail.contract.body} />
                  </div>
                  <button
                    className="btn-base btn-ghost mt-2 text-xs"
                    onClick={() => {
                      const blob = new Blob([detail.contract!.body], { type: "text/plain" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `contrat-${detail.profile!.email}.txt`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                  >
                    Télécharger le contrat
                  </button>
                </>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">Contrat non signé.</p>
              )}
            </div>
          </div>
        </section>
      ) : null}

      {/* CONFIRMATION DE SUPPRESSION */}
      {confirmDelete ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="surface-card w-full max-w-md p-4">
            <p className="text-sm font-semibold">Supprimer ce posteur ?</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {confirmDelete.email} — ses comptes, son contrat et son historique seront effacés. Cette
              action est définitive.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn-base btn-ghost text-xs" onClick={() => setConfirmDelete(null)}>
                Annuler
              </button>
              <button
                className="btn-base btn-primary text-xs"
                onClick={async () => {
                  try {
                    await runDelete({ data: { id: confirmDelete.id } });
                    toast.success("Posteur supprimé");
                    setConfirmDelete(null);
                    await refresh();
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Suppression impossible");
                  }
                }}
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
