/**
 * NAVIGATION PERMANENTE DE L'ADMINISTRATEUR.
 *
 * Présente au-dessus de TOUTES les pages réservées à l'administrateur
 * (administration, studio, sujets, paramètres) : on ne peut plus se retrouver
 * coincé dans le studio sans lien de retour.
 */
import { Link, useNavigate } from "@tanstack/react-router";
import { BarChart3, Clapperboard, Lightbulb, LogOut, SlidersHorizontal } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";

const LINKS = [
  { to: "/admin", label: "Administration", icon: BarChart3 },
  { to: "/studio", label: "Studio", icon: Clapperboard },
  { to: "/sujets", label: "Sujets", icon: Lightbulb },
  { to: "/parametres", label: "Paramètres", icon: SlidersHorizontal },
] as const;

export function AdminNav() {
  const navigate = useNavigate();

  return (
    <nav className="sticky top-0 z-40 flex flex-wrap items-center gap-1 border-b border-border bg-background/95 px-3 py-2 backdrop-blur">
      {LINKS.map(({ to, label, icon: Icon }) => (
        <Link
          key={to}
          to={to}
          activeProps={{ className: "bg-muted text-foreground" }}
          className="flex items-center gap-1.5 rounded-[8px] px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Icon className="size-3.5" />
          {label}
        </Link>
      ))}
      <button
        type="button"
        onClick={async () => {
          await supabase.auth.signOut();
          await navigate({ to: "/connexion" });
        }}
        className="ml-auto flex items-center gap-1.5 rounded-[8px] px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <LogOut className="size-3.5" />
        Déconnexion
      </button>
    </nav>
  );
}
