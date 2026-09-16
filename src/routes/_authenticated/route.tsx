import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { isAccessSuspended } from "@/lib/access";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/connexion" });

    // Un posteur suspendu n'entre plus dans l'espace : il voit une page qui le
    // lui explique. L'administrateur n'est jamais concerné.
    const profile = await supabase
      .from("profiles")
      .select("role, status")
      .eq("id", data.user.id)
      .maybeSingle();
    if (isAccessSuspended(profile.data)) throw redirect({ to: "/acces-suspendu" });

    return { user: data.user };
  },
  component: () => <Outlet />,
});
