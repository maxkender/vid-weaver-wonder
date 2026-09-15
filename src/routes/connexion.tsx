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

type Mode = "signin" | "signup" | "forgot";

function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

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
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/connexion`,
            data: { full_name: fullName },
          },
        });
        if (error) throw error;
        if (data.session) {
          await routeAfterLogin();
        } else {
          setSent(
            "Compte créé. Ouvre l'e-mail de confirmation que nous venons d'envoyer, puis reviens te connecter.",
          );
        }
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reinitialisation`,
        });
        if (error) throw error;
        setSent("Un lien de réinitialisation vient de partir vers ton adresse e-mail.");
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
          {mode === "signup" && "Crée ton accès posteur."}
          {mode === "forgot" && "Réinitialise ton mot de passe."}
        </p>

        {sent ? (
          <div className="mt-6 rounded-lg border border-border bg-card p-4 text-sm text-card-foreground">
            {sent}
          </div>
        ) : null}

        <form onSubmit={onSubmit} className="mt-6 space-y-4 rounded-xl border border-border bg-card p-5">
          {mode === "signup" ? (
            <div className="space-y-1.5">
              <Label htmlFor="nom">Nom complet</Label>
              <Input
                id="nom"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoComplete="name"
                required
              />
            </div>
          ) : null}

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
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
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
            {mode === "signin" ? "Se connecter" : mode === "signup" ? "Créer mon compte" : "Envoyer le lien"}
          </Button>
        </form>

        <div className="mt-4 flex flex-wrap justify-between gap-2 text-sm">
          {mode !== "signin" ? (
            <button className="text-primary hover:underline" onClick={() => { setMode("signin"); setSent(null); }}>
              J'ai déjà un compte
            </button>
          ) : (
            <button className="text-primary hover:underline" onClick={() => { setMode("signup"); setSent(null); }}>
              Créer un compte
            </button>
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
