import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { getMyProfile } from "@/lib/platform.functions";
import { bootstrapAdmin, platformNeedsAdmin } from "@/lib/admin.functions";

export const Route = createFileRoute("/connexion")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Connexion — plateforme de diffusion" },
      {
        name: "description",
        content:
          "Connectez-vous pour récupérer la vidéo du jour dans votre langue et la publier sur vos comptes.",
      },
      { property: "og:title", content: "Connexion à la plateforme de diffusion" },
      {
        property: "og:description",
        content: "Espace des posteurs : vidéo du jour, légende, hashtags et suivi des publications.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LoginPage,
});

// L'inscription libre n'existe pas : c'est l'administrateur qui crée les accès
// des posteurs depuis son tableau de bord.
type Mode = "signin" | "forgot";

function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [needsAdmin, setNeedsAdmin] = useState(false);
  const [adminName, setAdminName] = useState("");

  useEffect(() => {
    void platformNeedsAdmin()
      .then((r) => setNeedsAdmin(r.needsAdmin))
      .catch(() => setNeedsAdmin(false));
  }, []);



  const routeAfterLogin = async () => {
    try {
      const profile = await getMyProfile();
      await navigate({ to: profile.role === "admin" ? "/admin" : "/espace", replace: true });
    } catch {
      await navigate({ to: "/espace", replace: true });
    }
  };

  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (active && data.user) void routeAfterLogin();
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await routeAfterLogin();
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reinitialisation`,
        });
        if (error) throw error;
        setSent(
          "Si cette adresse existe, un lien de réinitialisation vient de partir. Les posteurs passent par l'administrateur, qui remet le mot de passe à 12345678.",
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Connexion impossible");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <Toaster />
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Plateforme de diffusion
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "signin" && "Connecte-toi pour récupérer la vidéo du jour."}
          {mode === "forgot" && "Réinitialise ton mot de passe."}
        </p>

        {sent ? (
          <div className="mt-6 rounded-lg border border-border bg-card p-4 text-sm text-card-foreground">
            {sent}
          </div>
        ) : null}

        {needsAdmin ? (
          <div className="mt-6 space-y-3 rounded-xl border border-primary/50 bg-primary/10 p-5">
            <p className="text-sm font-medium text-foreground">Créer le compte administrateur</p>
            <p className="text-xs text-muted-foreground">
              Aucun compte n'existe encore. Ce formulaire disparaît dès que l'administrateur est créé ;
              tous les autres accès seront ensuite créés depuis le tableau de bord.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="admin-nom">Nom complet</Label>
              <Input id="admin-nom" value={adminName} onChange={(e) => setAdminName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="admin-mail">Adresse e-mail</Label>
              <Input
                id="admin-mail"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="admin-mdp">Mot de passe</Label>
              <Input
                id="admin-mdp"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
              />
            </div>
            <Button
              className="h-11 w-full"
              disabled={busy || password.length < 8 || adminName.trim().length < 2}
              onClick={async () => {
                setBusy(true);
                try {
                  await bootstrapAdmin({ data: { email, password, fullName: adminName } });
                  setNeedsAdmin(false);
                  const { error } = await supabase.auth.signInWithPassword({ email, password });
                  if (error) throw error;
                  await routeAfterLogin();
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Création impossible");
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Créer l'administrateur
            </Button>
          </div>
        ) : null}



        <form onSubmit={onSubmit} className="mt-6 space-y-4 rounded-xl border border-border bg-card p-5">

          <div className="space-y-1.5">
            <Label htmlFor="email">Adresse e-mail</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>

          {mode !== "forgot" ? (
            <div className="space-y-1.5">
              <Label htmlFor="mdp">Mot de passe</Label>
              <Input
                id="mdp"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                minLength={8}
                required
              />
              <p className="text-xs text-muted-foreground">
                C'est le mot de passe de cette plateforme, jamais celui d'un compte Gmail,
                Instagram ou TikTok.
              </p>
            </div>
          ) : null}

          <Button type="submit" className="h-11 w-full" disabled={busy}>
            {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            {mode === "signin" ? "Se connecter" : "Envoyer le lien"}
          </Button>
        </form>

        <div className="mt-4 flex flex-wrap justify-between gap-2 text-sm">
          {mode !== "signin" ? (
            <button className="text-primary hover:underline" onClick={() => { setMode("signin"); setSent(null); }}>
              Revenir à la connexion
            </button>
          ) : (
            <span className="text-xs text-muted-foreground">
              Les accès sont créés par l'administrateur.
            </span>
          )}
          {mode !== "forgot" ? (
            <button
              className="text-muted-foreground hover:underline"
              onClick={() => { setMode("forgot"); setSent(null); }}
            >
              Mot de passe oublié
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
