import { createFileRoute, redirect } from "@tanstack/react-router";

/** Ancienne adresse : regroupée dans Réglages. */
export const Route = createFileRoute("/_authenticated/_admin/admin")({
  beforeLoad: () => {
    throw redirect({ to: "/reglages", search: { tab: "admin" } });
  },
});
