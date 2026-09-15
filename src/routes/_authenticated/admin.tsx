import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, LogOut, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { getActiveContractTemplate, getMyProfile } from "@/lib/platform.functions";
import { ContractMarkdown } from "@/components/contract-markdown";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Administration — plateforme de diffusion" },
      {
        name: "description",
        content: "Pilotage des posteurs, des contrats et des vidéos quotidiennes par langue.",
      },
      { property: "og:title", content: "Administration de la plateforme de diffusion" },
      {
        property: "og:description",
        content: "Suivi des posteurs, contrats signés et vidéos publiées chaque jour.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [template, setTemplate] = useState<{ version: number; title: string; body: string } | null>(
    null,
  );

  useEffect(() => {
    void (async () => {
      const profile = await getMyProfile();
      if (profile.role !== "admin") {
        await navigate({ to: "/espace", replace: true });
        return;
      }
      const t = await getActiveContractTemplate();
      setTemplate(t.template);
      setReady(true);
    })();
  }, [navigate]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-16">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <p className="text-sm font-semibold text-foreground">Administration</p>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/">Studio</Link>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await supabase.auth.signOut();
                await navigate({ to: "/connexion", replace: true });
              }}
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-4 px-4 py-5">
        <section className="rounded-xl border border-border bg-card p-4">
          <h1 className="text-base font-semibold text-foreground">Espace administrateur</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            La gestion des posteurs, des vidéos quotidiennes et des réglages par langue arrive à
            l'étape suivante. Le studio de production reste accessible.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" asChild>
              <Link to="/">Studio</Link>
            </Button>
            <Button variant="secondary" size="sm" asChild>
              <Link to="/sujets">Sujets</Link>
            </Button>
            <Button variant="secondary" size="sm" asChild>
              <Link to="/parametres">Paramètres</Link>
            </Button>
          </div>
        </section>

        {template ? (
          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="text-sm font-semibold text-foreground">
              Modèle de contrat actif — version {template.version}
            </h2>
            <div className="mt-3 flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3">
              <ShieldAlert className="mt-0.5 size-5 shrink-0 text-destructive" />
              <p className="text-sm text-foreground">
                Modèle de travail, non relu par un juriste. À faire valider par un avocat avant toute
                utilisation réelle. Les conditions d'utilisation d'Instagram interdisent la cession de
                comptes entre personnes, et un compte Google personnel n'est pas transférable à une
                société : une clause de restitution peut être inapplicable et exposer le compte à une
                suspension.
              </p>
            </div>
            <div className="mt-3 max-h-96 overflow-y-auto rounded-lg border border-border bg-background p-4">
              <ContractMarkdown body={template.body} />
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
