import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { getConventions, updateConventions } from "@/lib/admin.functions";
import {
  DEFAULT_CONVENTIONS,
  conventionGmail,
  conventionHandle,
  type ConventionRow,
} from "@/lib/conventions";

/**
 * Conventions de nommage des comptes : gabarits d'identifiants, mot de passe des
 * comptes sociaux, biographie et messages Upwork. Modifiables par l'administrateur.
 */
export function AdminConventions() {
  const runGet = useServerFn(getConventions);
  const runUpdate = useServerFn(updateConventions);
  const [conv, setConv] = useState<ConventionRow>(DEFAULT_CONVENTIONS);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const res = (await runGet()) as { conventions: ConventionRow };
    setConv(res.conventions);
  }, [runGet]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = async () => {
    setBusy(true);
    try {
      await runUpdate({
        data: {
          instagramTemplate: conv.instagram_template,
          gmailTemplate: conv.gmail_template,
          socialPassword: conv.social_password,
          platformPassword: conv.platform_password,
          bioText: conv.bio_text,
          upworkMessageFr: conv.upwork_message_fr,
          upworkMessageEn: conv.upwork_message_en,
        },
      });
      toast.success("Conventions enregistrées");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enregistrement impossible");
    } finally {
      setBusy(false);
    }
  };

  const set = (patch: Partial<ConventionRow>) => setConv((c) => ({ ...c, ...patch }));

  return (
    <section className="surface-card p-3">
      <p className="label-x">Conventions des comptes</p>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {"{pays}"} est remplacé par le code pays du compte. Exemples pour « es » :{" "}
        <span className="font-mono">{conventionHandle(conv, "es")}</span> ·{" "}
        <span className="font-mono">{conventionGmail(conv, "es")}</span>
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div>
          <p className="label-x">Pseudo Instagram</p>
          <input
            value={conv.instagram_template}
            onChange={(e) => set({ instagram_template: e.target.value })}
            className="field mt-1 font-mono text-xs"
          />
        </div>
        <div>
          <p className="label-x">Adresse Gmail</p>
          <input
            value={conv.gmail_template}
            onChange={(e) => set({ gmail_template: e.target.value })}
            className="field mt-1 font-mono text-xs"
          />
        </div>
        <div>
          <p className="label-x">Mot de passe des comptes</p>
          <input
            value={conv.social_password}
            onChange={(e) => set({ social_password: e.target.value })}
            className="field mt-1 font-mono text-xs"
          />
        </div>
      </div>

      <div className="mt-3">
        <p className="label-x">Biographie du compte</p>
        <textarea
          value={conv.bio_text}
          onChange={(e) => set({ bio_text: e.target.value })}
          rows={3}
          className="field mt-1 text-xs"
        />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div>
          <p className="label-x">Message Upwork — français</p>
          <textarea
            value={conv.upwork_message_fr}
            onChange={(e) => set({ upwork_message_fr: e.target.value })}
            rows={10}
            className="field mt-1 text-xs"
          />
        </div>
        <div>
          <p className="label-x">Message Upwork — anglais</p>
          <textarea
            value={conv.upwork_message_en}
            onChange={(e) => set({ upwork_message_en: e.target.value })}
            rows={10}
            className="field mt-1 text-xs"
          />
        </div>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Variables disponibles : {"{prenom}"}, {"{lien}"}, {"{identifiant}"}, {"{motdepasse}"}.
      </p>

      <button className="btn-base btn-primary mt-3 text-xs" disabled={busy} onClick={save}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Enregistrer les conventions
      </button>
    </section>
  );
}
