/**
 * NAVIGATION PERMANENTE DE L'ADMINISTRATEUR.
 *
 * Quatre entrées regroupées par ce qu'on vient faire, plus le Banc d'essai à
 * droite (un outil, pas une destination quotidienne).
 */
import { Link, useNavigate } from "@tanstack/react-router";
import { FlaskConical, LogOut } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";

const LINKS = [
  { to: "/studio", label: "Produire" },
  { to: "/slideshows", label: "Slideshows" },
  { to: "/sujets", label: "Sujets" },
  { to: "/reglages", label: "Réglages" },
] as const;

const ITEM =
  "flex h-14 items-center border-b-2 border-transparent px-1 text-[15px] font-medium text-muted-foreground hover:text-foreground";
const ACTIVE = { className: "border-foreground! text-foreground! font-semibold" };

export function AdminNav() {
  const navigate = useNavigate();

  return (
    <nav className="sticky top-0 z-40 border-b border-border bg-background">
      <div className="mx-auto flex max-w-[1280px] items-center gap-6 overflow-x-auto px-6">
        <span className="shrink-0 text-[17px] font-bold tracking-tight">Sophia</span>
        <div className="flex shrink-0 items-center gap-5">
          {LINKS.map(({ to, label }) => (
            <Link key={to} to={to} activeProps={ACTIVE} className={ITEM}>
              {label}
            </Link>
          ))}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2 border-l border-border pl-4">
          <Link
            to="/labo"
            activeProps={ACTIVE}
            className={`${ITEM} gap-1.5`}
          >
            <FlaskConical className="size-4" />
            Banc d'essai
          </Link>
          <button
            type="button"
            onClick={async () => {
              await supabase.auth.signOut();
              await navigate({ to: "/connexion" });
            }}
            className="ml-3 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            aria-label="Déconnexion"
          >
            <LogOut className="size-4" />
            <span className="hidden sm:inline">Déconnexion</span>
          </button>
        </div>
      </div>
    </nav>
  );
}

/** En-tête commun : titre de page + phrase courte. */
export function PageHeader({ title, lede, children }: { title: string; lede: string; children?: React.ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="page-title">{title}</h1>
        <p className="page-lede">{lede}</p>
      </div>
      {children ? <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div> : null}
    </header>
  );
}
