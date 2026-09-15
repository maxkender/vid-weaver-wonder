import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";

import { listAllAccounts, updateAccount } from "@/lib/admin.functions";

type Accounts = Awaited<ReturnType<typeof listAllAccounts>>["accounts"];
type Account = Accounts[number];

const STATUS: { id: "pending" | "active" | "suspended" | "recovered"; label: string }[] = [
  { id: "pending", label: "En attente" },
  { id: "active", label: "Actif" },
  { id: "suspended", label: "Suspendu" },
  { id: "recovered", label: "Repris" },
];

export function AdminAccounts() {
  const runList = useServerFn(listAllAccounts);
  const runUpdate = useServerFn(updateAccount);
  const [accounts, setAccounts] = useState<Accounts>([]);
  const [platform, setPlatform] = useState("");
  const [country, setCountry] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");

  const refresh = useCallback(async () => {
    const res = (await runList()) as { accounts: Accounts };
    setAccounts(res.accounts);
  }, [runList]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const countries = useMemo(
    () =>
      Array.from(
        new Set(accounts.map((a) => a.poster?.country ?? "").filter(Boolean)),
      ).sort(),
    [accounts],
  );

  const rows = accounts.filter((a) => {
    if (platform && a.platform !== platform) return false;
    if (status && a.status !== status) return false;
    if (country && (a.poster?.country ?? "") !== country) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = `${a.handle} ${a.poster?.full_name ?? ""} ${a.poster?.email ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const patch = async (id: string, data: Parameters<typeof updateAccount>[0] extends never ? never : Record<string, unknown>) => {
    try {
      await runUpdate({ data: { id, ...data } as never });
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Modification impossible");
    }
  };

  return (
    <div className="space-y-3">
      <div className="surface-card flex flex-wrap items-center gap-2 p-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un nom d'utilisateur ou un posteur"
          className="field w-72 text-xs"
        />
        <select value={platform} onChange={(e) => setPlatform(e.target.value)} className="field w-36 text-xs">
          <option value="">Toutes plateformes</option>
          <option value="instagram">Instagram</option>
          <option value="tiktok">TikTok</option>
          <option value="youtube">YouTube</option>
        </select>
        <select value={country} onChange={(e) => setCountry(e.target.value)} className="field w-32 text-xs">
          <option value="">Tous pays</option>
          {countries.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="field w-36 text-xs">
          <option value="">Tous statuts</option>
          {STATUS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <span className="ml-auto text-xs text-muted-foreground">{rows.length} compte(s)</span>
      </div>

      <div className="surface-card overflow-x-auto p-0">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr className="border-b border-border">
              <th className="px-3 py-2">Plateforme</th>
              <th className="px-3 py-2">Nom d'utilisateur</th>
              <th className="px-3 py-2">Posteur</th>
              <th className="px-3 py-2">Pays</th>
              <th className="px-3 py-2">Langue</th>
              <th className="px-3 py-2">Statut</th>
              <th className="px-3 py-2">Abonnés</th>
              <th className="px-3 py-2">Créé le</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a: Account) => (
              <tr key={a.id} className="border-b border-border/60">
                <td className="px-3 py-1.5 capitalize">{a.platform}</td>
                <td className="px-3 py-1.5">@{a.handle}</td>
                <td className="px-3 py-1.5 text-xs">
                  {a.poster?.full_name || a.poster?.email || "—"}
                </td>
                <td className="px-3 py-1.5 text-xs">{a.poster?.country ?? "—"}</td>
                <td className="px-3 py-1.5 text-xs uppercase">{a.poster?.language ?? "—"}</td>
                <td className="px-3 py-1.5">
                  <select
                    value={a.status}
                    onChange={(e) => void patch(a.id, { status: e.target.value })}
                    className="field w-32 text-xs"
                    aria-label="Statut du compte"
                  >
                    {STATUS.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-1.5">
                  <input
                    type="number"
                    min={0}
                    defaultValue={a.followers}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (Number.isFinite(v) && v !== a.followers) void patch(a.id, { followers: v });
                    }}
                    className="field w-24 text-xs"
                    aria-label="Nombre d'abonnés"
                  />
                </td>
                <td className="px-3 py-1.5 text-xs text-muted-foreground">
                  {new Date(a.created_at).toLocaleDateString("fr-FR")}
                </td>
                <td className="px-3 py-1.5 text-right">
                  {a.profile_url ? (
                    <a
                      href={a.profile_url}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-base btn-ghost px-2 py-1 text-xs"
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> Profil
                    </a>
                  ) : null}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-4 text-xs text-muted-foreground">
                  Aucun compte ne correspond à ces filtres.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
