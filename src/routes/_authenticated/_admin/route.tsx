import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { getMyProfile } from "@/lib/platform.functions";

/**
 * Le studio (accueil, sujets, paramètres) est réservé aux administrateurs.
 * Le rôle est lu côté serveur, jamais depuis le navigateur.
 */
export const Route = createFileRoute("/_authenticated/_admin")({
  beforeLoad: async () => {
    const profile = await getMyProfile();
    if (profile.role !== "admin") throw redirect({ to: "/espace" });
    return { profile };
  },
  component: () => <Outlet />,
});
