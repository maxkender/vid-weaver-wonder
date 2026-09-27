import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { getMyProfile } from "@/lib/platform.functions";
import { AdminOverview } from "@/components/admin/overview";
import { AdminTopics } from "@/components/admin/topics";
import { AdminAccounts } from "@/components/admin/accounts";
import { AdminPosters } from "@/components/admin/posters";
import { AdminDiffusion } from "@/components/admin/diffusion";
import { AdminVideos } from "@/components/admin/videos";
import { AdminContent } from "@/components/admin/content";
import { AdminJournal } from "@/components/admin/journal";


const SECTIONS = [
  { id: "overview", label: "Vue d'ensemble" },
  { id: "topics", label: "Sujets" },
  { id: "accounts", label: "Comptes" },
  { id: "posters", label: "Posteurs" },
  { id: "diffusion", label: "Diffusion" },
  { id: "videos", label: "Vidéos" },
  { id: "content", label: "Réglages de contenu" },
  { id: "journal", label: "Journal" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

export function AdminPanel() {
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
    return <p className="text-sm text-muted-foreground">Chargement…</p>;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
      <nav className="hidden lg:block">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={`flex h-10 w-full items-center border-l-2 pl-3 text-left text-[15px] ${
              section === s.id
                ? "border-foreground font-semibold text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {s.label}
          </button>
        ))}
      </nav>
      <div className="lg:hidden">
        <label className="label-x" htmlFor="admin-section">Section</label>
        <select
          id="admin-section"
          value={section}
          onChange={(e) => setSection(e.target.value as SectionId)}
          className="field"
        >
          {SECTIONS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      <main className="min-w-0">
        <h2 className="section-title mb-4">{SECTIONS.find((s) => s.id === section)?.label}</h2>
        {section === "overview" ? <AdminOverview /> : null}
        {section === "topics" ? <AdminTopics /> : null}
        {section === "accounts" ? <AdminAccounts /> : null}
        {section === "posters" ? <AdminPosters /> : null}
        {section === "diffusion" ? <AdminDiffusion /> : null}
        {section === "videos" ? <AdminVideos /> : null}
        {section === "content" ? <AdminContent /> : null}
        {section === "journal" ? <AdminJournal /> : null}
      </main>
    </div>
  );
}
