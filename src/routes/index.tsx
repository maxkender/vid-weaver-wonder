/**
 * ENTRÉE DU SITE.
 *
 * La racine n'affiche aucun outil : elle oriente. Personne de connecté → écran
 * de connexion. Administrateur → administration. Posteur → son espace. Le rôle
 * est lu côté serveur (`getMyProfile`), jamais depuis le navigateur.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { getMyProfile } from "@/lib/platform.functions";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sophia — plateforme de diffusion et studio vidéo" },
      {
        name: "description",
        content:
          "Accès à l'espace des posteurs et à l'administration : vidéo du jour, légende, hashtags et pilotage de la production.",
      },
      { property: "og:title", content: "Sophia — plateforme de diffusion" },
      {
        property: "og:description",
        content: "Vidéo du jour par langue, légende prête à coller et suivi des publications.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/connexion" });
    const profile = await getMyProfile();
    throw redirect({ to: profile.role === "admin" ? "/admin" : "/espace" });
  },
  component: () => (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
    </div>
  ),
});
