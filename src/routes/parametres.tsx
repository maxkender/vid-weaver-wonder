import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";

import { Toaster } from "@/components/ui/sonner";
import sophiaLogo from "@/assets/sophia-logo.png.asset.json";
import {
  defaultSettings,
  loadSettings,
  NARRATION_LABELS,
  saveSettings,
  VISUAL_LABELS,
  type NarrationStyleId,
  type StudioSettings,
  type VisualStyleId,
} from "@/lib/style-presets";

export const Route = createFileRoute("/parametres")({
  head: () => ({
    meta: [
      { title: "Paramètres du studio — styles de narration et direction artistique" },
      {
        name: "description",
        content:
          "Réglez les briefs de chaque style de narration, la direction artistique, la cohérence des personnages et le logo Sophia de vos vidéos.",
      },
      { property: "og:title", content: "Paramètres du studio vidéo" },
      {
        property: "og:description",
        content:
          "Personnalisez les prompts de narration, les directions artistiques et la cohérence visuelle du studio.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsPage,
});

const field =
  "mt-2 w-full resize-y rounded-lg border border-input bg-background/60 p-3 text-sm outline-none focus:ring-2 focus:ring-ring";

function SettingsPage() {
  const [settings, setSettings] = useState<StudioSettings>(defaultSettings());
  const [tab, setTab] = useState<"narration" | "visual" | "general">("narration");

  useEffect(() => setSettings(loadSettings()), []);

  const persist = (next: StudioSettings) => {
    setSettings(next);
    saveSettings(next);
  };

  return (
    <main className="mx-auto w-full max-w-4xl px-5 py-12">
      <Toaster position="top-center" />
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Retour au studio
      </Link>

      <h1 className="mt-6 text-4xl sm:text-5xl">Paramètres</h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        Chaque style de narration et chaque direction artistique a ses propres consignes,
        modifiables ici. Elles sont utilisées à la génération du script, des images et des
        clips animés.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        {(
          [
            ["narration", "Styles de narration"],
            ["visual", "Directions artistiques"],
            ["general", "Général"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`rounded-full border px-4 py-2 text-sm ${
              tab === id
                ? "border-primary bg-primary/15"
                : "border-border bg-secondary/40 text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "narration" && (
        <div className="mt-6 space-y-4">
          {(Object.keys(NARRATION_LABELS) as NarrationStyleId[]).map((id) => (
            <section key={id} className="surface-card p-5">
              <h2 className="text-xl">{NARRATION_LABELS[id]}</h2>
              <label className="mt-3 block text-xs uppercase tracking-widest text-muted-foreground">
                Consignes d'écriture
              </label>
              <textarea
                rows={4}
                value={settings.narration[id].brief}
                onChange={(e) =>
                  persist({
                    ...settings,
                    narration: {
                      ...settings.narration,
                      [id]: { ...settings.narration[id], brief: e.target.value },
                    },
                  })
                }
                className={field}
              />
              <label className="mt-4 block text-xs uppercase tracking-widest text-muted-foreground">
                Densité du texte : {settings.narration[id].wordsBias > 0 ? "+" : ""}
                {settings.narration[id].wordsBias} mots par plan
              </label>
              <input
                type="range"
                min={-6}
                max={6}
                step={1}
                value={settings.narration[id].wordsBias}
                onChange={(e) =>
                  persist({
                    ...settings,
                    narration: {
                      ...settings.narration,
                      [id]: {
                        ...settings.narration[id],
                        wordsBias: Number(e.target.value),
                      },
                    },
                  })
                }
                className="mt-3 w-full accent-[oklch(0.79_0.16_72)]"
              />
            </section>
          ))}
        </div>
      )}

      {tab === "visual" && (
        <div className="mt-6 space-y-4">
          {(Object.keys(VISUAL_LABELS) as VisualStyleId[]).map((id) => (
            <section key={id} className="surface-card p-5">
              <h2 className="text-xl">{VISUAL_LABELS[id]}</h2>
              {(
                [
                  ["brief", "Description du style (anglais)"],
                  ["quality", "Consignes de rendu / qualité"],
                  ["motion", "Consignes d'animation"],
                ] as const
              ).map(([key, label]) => (
                <div key={key}>
                  <label className="mt-3 block text-xs uppercase tracking-widest text-muted-foreground">
                    {label}
                  </label>
                  <textarea
                    rows={key === "brief" ? 5 : 2}
                    value={settings.visual[id][key]}
                    onChange={(e) =>
                      persist({
                        ...settings,
                        visual: {
                          ...settings.visual,
                          [id]: { ...settings.visual[id], [key]: e.target.value },
                        },
                      })
                    }
                    className={field}
                  />
                </div>
              ))}
              <label className="mt-4 flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={settings.visual[id].square}
                  onChange={(e) =>
                    persist({
                      ...settings,
                      visual: {
                        ...settings.visual,
                        [id]: { ...settings.visual[id], square: e.target.checked },
                      },
                    })
                  }
                  className="h-4 w-4 accent-[oklch(0.79_0.16_72)]"
                />
                Masque carré à coins arrondis dans le cadre vertical
              </label>
            </section>
          ))}
        </div>
      )}

      {tab === "general" && (
        <section className="surface-card mt-6 space-y-5 p-5">
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={settings.useReferenceImage}
              onChange={(e) => persist({ ...settings, useReferenceImage: e.target.checked })}
              className="mt-1 h-4 w-4 accent-[oklch(0.79_0.16_72)]"
            />
            <span>
              Cohérence des personnages
              <span className="block text-xs text-muted-foreground">
                La première image sert de référence aux suivantes : mêmes visages, mêmes
                couleurs de vêtements, même palette d'un plan à l'autre.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={settings.sophiaLogo}
              onChange={(e) => persist({ ...settings, sophiaLogo: e.target.checked })}
              className="mt-1 h-4 w-4 accent-[oklch(0.79_0.16_72)]"
            />
            <span className="flex-1">
              Logo Sophia animé
              <span className="block text-xs text-muted-foreground">
                Le logo apparaît en haut de l'écran dès que la voix prononce « Sophia »,
                dans l'aperçu comme dans l'export MP4.
              </span>
            </span>
            <img
              src={sophiaLogo.url}
              alt="Logo de l'application Sophia"
              className="h-12 w-12 rounded-[22%]"
            />
          </label>

          <div>
            <label className="text-xs uppercase tracking-widest text-muted-foreground">
              Volume de la musique de fond : {Math.round(settings.musicVolume * 100)} %
            </label>
            <input
              type="range"
              min={0}
              max={40}
              step={1}
              value={Math.round(settings.musicVolume * 100)}
              onChange={(e) =>
                persist({ ...settings, musicVolume: Number(e.target.value) / 100 })
              }
              className="mt-3 w-full accent-[oklch(0.79_0.16_72)]"
            />
          </div>
        </section>
      )}

      <div className="mt-8 flex flex-wrap gap-3">
        <button
          onClick={() => {
            saveSettings(settings);
            toast.success("Paramètres enregistrés");
          }}
          className="btn-gold inline-flex items-center gap-2 rounded-lg px-5 py-3 text-sm font-bold uppercase tracking-wider"
        >
          <Save className="h-4 w-4" /> Enregistrer
        </button>
        <button
          onClick={() => {
            persist(defaultSettings());
            toast.success("Réglages par défaut restaurés");
          }}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-5 py-3 text-xs uppercase tracking-widest hover:border-primary"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Réinitialiser
        </button>
      </div>
    </main>
  );
}
