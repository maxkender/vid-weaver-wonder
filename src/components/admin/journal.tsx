import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";

import { listAuditLog } from "@/lib/admin.functions";

type Entries = Awaited<ReturnType<typeof listAuditLog>>["entries"];

export function AdminJournal() {
  const run = useServerFn(listAuditLog);
  const [entries, setEntries] = useState<Entries>([]);
  const [action, setAction] = useState("");
  const [table, setTable] = useState("");

  const refresh = useCallback(async () => {
    const res = (await run({
      data: { action: action || undefined, table: table || undefined, limit: 200 },
    })) as { entries: Entries };
    setEntries(res.entries);
  }, [run, action, table]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="space-y-3">
      <div className="surface-card flex flex-wrap items-end gap-2 p-3">
        <div>
          <p className="label-x">Action</p>
          <input
            value={action}
            onChange={(e) => setAction(e.target.value)}
            placeholder="poster.created"
            className="field mt-1 w-56 text-xs"
          />
        </div>
        <div>
          <p className="label-x">Table</p>
          <select
            value={table}
            onChange={(e) => setTable(e.target.value)}
            className="field mt-1 w-48 text-xs"
          >
            <option value="">Toutes</option>
            <option value="profiles">profiles</option>
            <option value="poster_accounts">poster_accounts</option>
            <option value="daily_videos">daily_videos</option>
            <option value="language_settings">language_settings</option>
            <option value="contract_templates">contract_templates</option>
            <option value="contracts">contracts</option>
            <option value="render_jobs">render_jobs</option>
            <option value="distribution_settings">distribution_settings</option>
          </select>
        </div>
        <span className="ml-auto text-xs text-muted-foreground">
          Journal en lecture seule — {entries.length} entrée(s)
        </span>
      </div>

      <div className="surface-card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr className="border-b border-border">
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Auteur</th>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2">Cible</th>
              <th className="px-3 py-2">Détail</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-b border-border/60 align-top">
                <td className="whitespace-nowrap px-3 py-1.5 text-xs text-muted-foreground">
                  {new Date(e.created_at).toLocaleString("fr-FR")}
                </td>
                <td className="px-3 py-1.5 text-xs">{e.actor}</td>
                <td className="px-3 py-1.5 text-xs font-medium">{e.action}</td>
                <td className="px-3 py-1.5 text-xs text-muted-foreground">
                  {e.target_table}
                  {e.target_id ? ` · ${e.target_id.slice(0, 8)}` : ""}
                </td>
                <td className="px-3 py-1.5 text-[11px] text-muted-foreground">
                  {e.payload === "{}" ? "" : e.payload}
                </td>
              </tr>
            ))}
            {entries.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-xs text-muted-foreground">
                  Aucune entrée.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
