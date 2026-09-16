import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  BarChart3,
  FileText,
  Layers,
  Lightbulb,
  Loader2,
  LogOut,
  ScrollText,
  Send,
  Users,
} from "lucide-react";

import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { getMyProfile } from "@/lib/platform.functions";
import { AdminOverview } from "@/components/admin/overview";
import { AdminTopics } from "@/components/admin/topics";
import { AdminAccounts } from "@/components/admin/accounts";
import { AdminPosters } from "@/components/admin/posters";
import { AdminDiffusion } from "@/components/admin/diffusion";
import { AdminVideos } from "@/components/admin/videos";
import { AdminContent } from "@/components/admin/content";
import { AdminJournal } from "@/components/admin/journal";

export const Route = createFileRoute("/_authenticated/_admin/admin")({
  head: () => ({
    meta: [
      { title: "Administration — plateforme de diffusion" },
      {
        name: "description",
        content: "Pilotage des posteurs, des comptes, des sujets et des vidéos quotidiennes par langue.",
      },
      { property: "og:title", content: "Administration de la plateforme de diffusion" },
      {
        property: "og:description",
        content: "Suivi des posteurs, contrats signés, file de sujets et vidéos publiées chaque jour.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminPage,
});

const SECTIONS = [
  { id: "overview", label: "Vue d'ensemble", icon: BarChart3 },
  { id: "topics", label: "Sujets", icon: Lightbulb },
  { id: "accounts", label: "Comptes", icon: Layers },
  { id: "posters", label: "Posteurs", icon: Users },
  { id: "diffusion", label: "Diffusion", icon: Send },
  { id: "content", label: "Réglages de contenu", icon: FileText },
  { id: "journal", label: "Journal", icon: ScrollText },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

function AdminPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [section, setSection] = useState<SectionId>("overview");

  useEffect(() => {
    void (async () => {
      const profile = await getMyProfile();
      if (profile.role !== "admin") {
        await navigate({ to: "/espace", replace: true });
        return;
      }
      setReady(true);
    })();
  }, [navigate]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Toaster position="top-center" />
      <div className="flex min-h-screen">
        <aside className="sticky top-0 hidden h-screen w-56 shrink-0 border-r border-border p-3 lg:block">
          <p className="px-2 text-sm font-semibold tracking-tight">Administration</p>
          <nav className="mt-3 space-y-0.5">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              return (
                <button
                  key={s.id}
                  onClick={() => setSection(s.id)}
                  className={`flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-left text-xs ${
                    section === s.id
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {s.label}
                </button>
              );
            })}
          </nav>
          <div className="mt-4 space-y-0.5 border-t border-border pt-3">
            <Link to="/studio" className="flex items-center gap-2 rounded-[8px] px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted">
              Studio de production
            </Link>
            <button
              onClick={async () => {
                await supabase.auth.signOut();
                await navigate({ to: "/connexion", replace: true });
              }}
              className="flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted"
            >
              <LogOut className="h-3.5 w-3.5" /> Déconnexion
            </button>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 border-b border-border bg-background/95 px-4 py-2 backdrop-blur lg:hidden">
            <select
              value={section}
              onChange={(e) => setSection(e.target.value as SectionId)}
              className="field w-full text-xs"
              aria-label="Section"
            >
              {SECTIONS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </header>

          <main className="px-4 py-4">
            <h1 className="mb-3 text-[15px] font-semibold tracking-tight">
              {SECTIONS.find((s) => s.id === section)?.label}
            </h1>
            {section === "overview" ? <AdminOverview /> : null}
            {section === "topics" ? <AdminTopics /> : null}
            {section === "accounts" ? <AdminAccounts /> : null}
            {section === "posters" ? <AdminPosters /> : null}
            {section === "diffusion" ? <AdminDiffusion /> : null}
            {section === "content" ? <AdminContent /> : null}
            {section === "journal" ? <AdminJournal /> : null}
          </main>
        </div>
      </div>
    </div>
  );
}
