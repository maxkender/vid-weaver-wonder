import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reinitialisation")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Nouveau mot de passe — plateforme de diffusion" },
      {
        name: "description",
        content: "Choisis un nouveau mot de passe pour accéder à ton espace de diffusion.",
      },
      { property: "og:title", content: "Nouveau mot de passe" },
      {
        property: "og:description",
        content: "Réinitialisation du mot de passe de la plateforme de diffusion.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPage,
});

function ResetPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Mot de passe mis à jour");
      await navigate({ to: "/espace", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Mise à jour impossible");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Toaster />
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-xl border border-border bg-card p-5">
        <h1 className="text-lg font-semibold text-foreground">Nouveau mot de passe</h1>
        <div className="space-y-1.5">
          <Label htmlFor="mdp">Mot de passe</Label>
          <Input
            id="mdp"
            type="password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </div>
        <Button type="submit" className="h-11 w-full" disabled={busy}>
          {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          Enregistrer
        </Button>
      </form>
    </div>
  );
}
