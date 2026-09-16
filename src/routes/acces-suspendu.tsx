import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/acces-suspendu")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Accès suspendu — plateforme de diffusion" },
      {
        name: "description",
        content: "Cet accès à la plateforme de diffusion a été suspendu par l'administrateur.",
      },
      { property: "og:title", content: "Accès suspendu" },
      {
        property: "og:description",
        content: "Cet accès à la plateforme de diffusion a été suspendu par l'administrateur.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SuspendedPage,
});

function SuspendedPage() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="surface-card w-full max-w-md p-6 text-center">
        <h1 className="text-lg font-semibold">Ton accès a été suspendu</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Tu ne peux plus récupérer les vidéos ni modifier tes comptes. Si c'est une erreur,
          contacte l'administrateur pour faire rétablir ton accès.
        </p>
        <button
          className="btn-base btn-primary mt-5 text-sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await supabase.auth.signOut();
            await navigate({ to: "/connexion" });
          }}
        >
          Se déconnecter
        </button>
      </div>
    </main>
  );
}
