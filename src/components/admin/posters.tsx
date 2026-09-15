import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy, KeyRound, Loader2, Pause, Play, Trash2, UserPlus, X } from "lucide-react";
import { toast } from "sonner";

import { ContractMarkdown } from "@/components/contract-markdown";
import {
  INITIAL_PASSWORD,
  buildLogin,
  createPoster,
  deletePoster,
  getPosterDetail,
  listPosters,
  resetPosterPassword,
  setPosterStatus,
  type AdminPoster,
} from "@/lib/admin.functions";
import { MASTER_LANGUAGES } from "@/lib/languages";

type Detail = Awaited<ReturnType<typeof getPosterDetail>>;

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

export function AdminPosters() {
  const runList = useServerFn(listPosters);
  const runCreate = useServerFn(createPoster);
  const runReset = useServerFn(resetPosterPassword);
  const runStatus = useServerFn(setPosterStatus);
  const runDelete = useServerFn(deletePoster);
  const runDetail = useServerFn(getPosterDetail);

  const [posters, setPosters] = useState<AdminPoster[]>([]);
  const [loading, setLoading] = useState(true);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [country, setCountry] = useState("FR");
  const [language, setLanguage] = useState("fr");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AdminPoster | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = (await runList()) as { posters: AdminPoster[] };
      setPosters(res.posters);
    } finally {
      setLoading(false);
    }
  }, [runList]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const preview = useMemo(
    () => (firstName.trim() ? buildLogin(firstName, lastName) : "—"),
    [firstName, lastName],
  );

  const onCreate = async () => {
    setBusy(true);
    try {
      const res = (await runCreate({
        data: { firstName, lastName, country, language: language as "fr" },
      })) as { email: string; password: string };
      setCreated({ email: res.email, password: res.password });
      setFirstName("");
      setLastName("");
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
            <p className="label-x">Pays</p>
            <input
              value={country}
              onChange={(e) => setCountry(e.target.value.toUpperCase().slice(0, 3))}
              className="field mt-1 w-20 text-xs"
            />
          </div>
          <div>
            <p className="label-x">Langue de publication</p>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="field mt-1 w-36 text-xs"
            >
              {MASTER_LANGUAGES.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[220px]">
            <p className="label-x">Identifiant calculé</p>
            <p className="mt-1 font-mono text-sm">{preview}</p>
          </div>
          <button
            onClick={onCreate}
            disabled={busy || firstName.trim().length < 2 || lastName.trim().length < 1}
            className="btn-base btn-primary text-xs"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Créer l'accès
          </button>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          L'identifiant n'est pas une vraie boîte mail : il sert uniquement à se connecter ici. Le mot
          de passe initial est <span className="font-mono">{INITIAL_PASSWORD}</span> pour tous.
        </p>

        {created ? (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-[10px] border border-primary/50 bg-primary/10 p-3 text-sm">
            <span>
              Accès créé : <span className="font-mono">{created.email}</span> · mot de passe{" "}
              <span className="font-mono">{created.password}</span>
            </span>
            <CopyButton value={`${created.email} / ${created.password}`} label="Copier l'accès" />
            <button className="btn-base btn-ghost px-2 py-1 text-xs" onClick={() => setCreated(null)}>
              <X className="h-3.5 w-3.5" />
            </button>
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
              <th className="px-3 py-2">Langue</th>
              <th className="px-3 py-2">Parcours</th>
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
                <td className="px-3 py-1.5 text-xs uppercase">{p.language}</td>
                <td className="px-3 py-1.5 text-[11px]">
                  <span className={p.gmail_address ? "text-foreground" : "text-muted-foreground"}>Gmail</span>
                  {" · "}
                  <span className={p.accounts > 0 ? "text-foreground" : "text-muted-foreground"}>Compte</span>
                  {" · "}
                  <span className={p.has_contract ? "text-foreground" : "text-muted-foreground"}>Contrat</span>
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
                      title="Réinitialiser le mot de passe"
                      onClick={async () => {
                        await runReset({ data: { id: p.id } });
                        toast.success(`Mot de passe remis à ${INITIAL_PASSWORD}`);
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
                Identifiant : <span className="font-mono">{detail.profile.email}</span> · langue{" "}
                {detail.profile.language.toUpperCase()} · pays {detail.profile.country ?? "—"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Gmail déclaré : {detail.profile.gmail_address ?? "non renseigné"}
              </p>
              <p className="label-x mt-3">Comptes ({detail.accounts.length})</p>
              <ul className="mt-1 space-y-1 text-sm">
                {detail.accounts.map((a) => (
                  <li key={a.id}>
                    <span className="capitalize">{a.platform}</span> · @{a.handle} · {a.status}
                  </li>
                ))}
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
