import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { AdminNav } from "@/components/admin-nav";
import { getMyProfile } from "@/lib/platform.functions";

/**
 * Administration, studio, sujets et paramètres : réservés aux administrateurs.
 * Le rôle est lu côté serveur, jamais depuis le navigateur — un posteur qui
 * tape l'adresse à la main est renvoyé vers son espace.
 */
export const Route = createFileRoute("/_authenticated/_admin")({
  beforeLoad: async () => {
    const profile = await getMyProfile();
    if (profile.role !== "admin") throw redirect({ to: "/espace" });
    return { profile };
  },
  component: () => (
    <>
      <AdminNav />
      <Outlet />
    </>
  ),
});
