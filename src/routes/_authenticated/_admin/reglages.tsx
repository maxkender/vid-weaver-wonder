import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { PageHeader } from "@/components/admin-nav";
import { Toaster } from "@/components/ui/sonner";
import { AdminPanel } from "@/components/settings/admin-panel";
import { ParamsPanel } from "@/components/settings/params-panel";
import { SlideshowPanel } from "@/components/settings/slideshow-panel";

type Tab = "admin" | "studio" | "slideshows";

export const Route = createFileRoute("/_authenticated/_admin/reglages")({
  validateSearch: (s: Record<string, unknown>): { tab: Tab } => ({
    tab: s["tab"] === "studio" || s["tab"] === "slideshows" ? s["tab"] : "admin",
  }),
  head: () => ({
    meta: [
      { title: "Réglages — Sophia" },
      { name: "description", content: "Administration de la diffusion et paramètres du studio vidéo." },
      { property: "og:title", content: "Réglages — Sophia" },
      { property: "og:description", content: "Posteurs, comptes, diffusion, vidéos et briefs du studio." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReglagesPage,
});

const TABS: { id: Tab; label: string }[] = [
  { id: "admin", label: "Administration" },
  { id: "studio", label: "Paramètres" },
  { id: "slideshows", label: "Slideshows" },
];

function ReglagesPage() {
  const { tab } = Route.useSearch();
  const navigate = useNavigate({ from: "/reglages" });
  return (
    <div className="page">
      <Toaster position="top-center" />
      <PageHeader title="Réglages" lede="Diffusion, posteurs, comptes et briefs du studio." />
      <div className="mb-6 flex gap-6 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => navigate({ search: { tab: t.id } })}
            className={`-mb-px h-11 border-b-2 text-[15px] ${
              tab === t.id
                ? "border-foreground font-semibold text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "admin" ? <AdminPanel /> : tab === "studio" ? <ParamsPanel /> : <SlideshowPanel />}
    </div>
  );
}
