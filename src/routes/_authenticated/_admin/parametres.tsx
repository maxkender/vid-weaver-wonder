import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";

import { Toaster } from "@/components/ui/sonner";
import sophiaLogo from "@/assets/sophia-logo.png.asset.json";
import {
  defaultSettings,
  isCustomField,
  loadSettings,
  narrationPath,
  guidePath,
  openingPath,
  NARRATION_LABELS,
  resetField,
  saveSettings,
  setField,
  visualPath,
  VISUAL_LABELS,
  type FieldPath,
  type NarrationStyleId,
  type StudioSettings,
  type VisualStyleId,
} from "@/lib/style-presets";

export const Route = createFileRoute("/_authenticated/_admin/parametres")({
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

const field = "field mt-2 resize-y";

/**
 * Intitulé d'un champ texte + indicateur « Personnalisé » et retour au défaut.
 * Un champ non personnalisé suit automatiquement les consignes livrées, même
 * après leur mise à jour : c'est ce qui évite qu'une vieille copie enregistrée
 * dans le navigateur prive l'utilisateur des améliorations.
 */
function FieldHeader({
  label,
  path,
  settings,
  persist,
}: {
  label: string;
  path: FieldPath;
  settings: StudioSettings;
  persist: (next: StudioSettings) => void;
}) {
  const custom = isCustomField(settings, path);
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <label className="label-x">{label}</label>
      {custom && (
        <>
          <span className="rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            Personnalisé
          </span>
          <button
            type="button"
            onClick={() => {
              persist(resetField(settings, path));
              toast.success("Champ revenu au réglage livré");
            }}
            className="btn-base btn-ghost px-2 py-1 text-[11px]"
          >
            <RotateCcw className="h-3 w-3" /> Revenir au défaut
          </button>
        </>
      )}
    </div>
  );
}

function SettingsPage() {
  const [settings, setSettings] = useState<StudioSettings>(defaultSettings());
  const [tab, setTab] = useState<"narration" | "visual" | "general">("narration");
  /** Avertissement affiché quand on change la définition en cours de projet. */
  const [draftNotice, setDraftNotice] = useState(false);

  useEffect(() => setSettings(loadSettings()), []);

  const persist = (next: StudioSettings) => {
    setSettings(next);
    saveSettings(next);
  };

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-6">
      <Toaster position="top-center" />
      <div className="mb-5 flex flex-wrap items-center gap-3 border-b border-border pb-3">
        <Link to="/" className="btn-base btn-ghost px-2.5 py-1.5 text-xs">
          <ArrowLeft className="h-3.5 w-3.5" /> Retour au studio
        </Link>
        <h1 className="text-[15px] font-semibold tracking-tight">Paramètres</h1>
      </div>

      <p className="max-w-2xl text-sm text-muted-foreground">
        Chaque style de narration et chaque direction artistique a ses propres consignes,
        modifiables ici. Elles sont utilisées à la génération du script, des images et des
        clips animés.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
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
            className={`chip ${tab === id ? "chip-active" : ""}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "narration" && (
        <div className="mt-4 space-y-3">
          {(Object.keys(NARRATION_LABELS) as NarrationStyleId[]).map((id) => (
            <section key={id} className="surface-card p-4">
              <h2 className="text-base font-semibold">{NARRATION_LABELS[id]}</h2>
              <FieldHeader
                label="Consignes d'écriture"
                path={narrationPath(id)}
                settings={settings}
                persist={persist}
              />
              <textarea
                rows={4}
                value={settings.narration[id].brief}
                onChange={(e) => persist(setField(settings, narrationPath(id), e.target.value))}
                className={field}
              />
              <label className="label-x mt-4">
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
                className="mt-3 w-full"
              />
            </section>
          ))}
        </div>
      )}

      {tab === "visual" && (
        <div className="mt-4 space-y-3">
          {(Object.keys(VISUAL_LABELS) as VisualStyleId[]).map((id) => (
            <section key={id} className="surface-card p-4">
              <h2 className="text-base font-semibold">{VISUAL_LABELS[id]}</h2>
              {(
                [
                  ["brief", "Description du style (anglais)"],
                  ["quality", "Consignes de rendu / qualité"],
                  ["motion", "Consignes d'animation"],
                ] as const
              ).map(([key, label]) => (
                <div key={key}>
                  <FieldHeader
                    label={label}
                    path={visualPath(id, key)}
                    settings={settings}
                    persist={persist}
                  />
                  <textarea
                    rows={key === "brief" ? 5 : 2}
                    value={settings.visual[id][key]}
                    onChange={(e) =>
                      persist(setField(settings, visualPath(id, key), e.target.value))
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
                  className="h-4 w-4"
                />
                Masque carré à coins arrondis dans le cadre vertical
              </label>
            </section>
          ))}
        </div>
      )}

      {tab === "visual" && (
        <section className="surface-card mt-4 space-y-4 p-4">
          <div>
            <h2 className="text-base font-semibold">Plan 1 — l'accroche</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Consignes appliquées au premier plan uniquement, quel que soit le style visuel.
              C'est la première seconde qui décide si le spectateur reste.
            </p>
          </div>
          {(
            [
              ["motion", "Mouvement du plan 1 (anglais)"],
              ["image", "Composition du plan 1 (anglais)"],
            ] as const
          ).map(([key, label]) => (
            <div key={key}>
              <FieldHeader
                label={label}
                path={openingPath(key)}
                settings={settings}
                persist={persist}
              />
              <textarea
                rows={4}
                value={settings.opening[key]}
                onChange={(e) => persist(setField(settings, openingPath(key), e.target.value))}
                className={field}
              />
            </div>
          ))}

          <div className="border-t border-border/60 pt-4">
            <h2 className="text-base font-semibold">Écriture et cadrages</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Les consignes appliquées à toutes les vidéos : le niveau de langue (écriture ET
              traductions), les six conditions de l'accroche, la fonction de chacun des huit
              plans, la relecture finale « à quelle seconde je scrolle ? », et la rotation des
              types de plan qui évite que les huit images se ressemblent.
            </p>
          </div>
          {(
            [
              ["language", "Niveau de langue (écriture et traductions)"],
              ["hook", "Règles de l'accroche (six conditions)"],
              ["structure", "Structure des plans, information nouvelle et densité"],
              ["audit", "Relecture finale et réécriture du plan le plus faible"],
              ["shots", "Rotation des types de plan (anglais)"],
            ] as const
          ).map(([key, label]) => (
            <div key={key}>
              <FieldHeader
                label={label}
                path={guidePath(key)}
                settings={settings}
                persist={persist}
              />
              <textarea
                rows={8}
                value={settings.guides[key]}
                onChange={(e) => persist(setField(settings, guidePath(key), e.target.value))}
                className={field}
              />
            </div>
          ))}
        </section>
      )}

      {tab === "general" && (
        <section className="surface-card mt-4 space-y-5 p-4">
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={settings.useReferenceImage}
              onChange={(e) => persist({ ...settings, useReferenceImage: e.target.checked })}
              className="mt-1 h-4 w-4"
            />
            <span>
              Cohérence des personnages
              <span className="block text-xs text-muted-foreground">
                La première image sert de référence aux suivantes : mêmes visages, mêmes
                couleurs de vêtements, même palette d'un plan à l'autre.
              </span>
            </span>
          </label>

          <div>
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={settings.draft720 === true}
                onChange={(e) => {
                  setDraftNotice(true);
                  persist({ ...settings, draft720: e.target.checked });
                }}
                className="mt-1 h-4 w-4"
              />
              <span>
                Mode brouillon (720p)
                <span className="block text-xs text-muted-foreground">
                  Les plans sont commandés en 720 × 1280 et leur durée n'est plus forcée à 8
                  secondes : des paliers de 4 et 6 secondes deviennent possibles et la facture
                  baisse nettement. L'export reste en 1080 × 1920, l'image est simplement
                  agrandie — donc visiblement plus douce. À réserver aux essais, pas aux vidéos
                  publiées.
                </span>
              </span>
            </label>
            {draftNotice && (
              <p className="mt-2 text-xs text-foreground">
                Les plans déjà générés gardent leur définition d'origine : rien n'est effacé ni
                refait. Seuls les nouveaux plans suivront ce réglage.
              </p>
            )}
          </div>

          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={settings.precomposeSquare !== false}
              onChange={(e) => persist({ ...settings, precomposeSquare: e.target.checked })}
              className="mt-1 h-4 w-4"
            />
            <span>
              Pré-composer le carré avant animation
              <span className="block text-xs text-muted-foreground">
                L'image carrée est placée nous-mêmes au centre d'un cadre vertical noir avant
                d'être animée : le cadrage reste identique d'un plan à l'autre et le sujet
                n'est plus recadré. Décoche pour comparer avec l'ancien rendu.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={settings.sophiaCta !== false}
              onChange={(e) => persist({ ...settings, sophiaCta: e.target.checked })}
              className="mt-1 h-4 w-4"
            />
            <span>
              Ajouter le plan CTA Sophia à la fin
              <span className="block text-xs text-muted-foreground">
                Désactivé par défaut : l'activer ajoute un plan animé de plus, soit environ 11 %
                du budget de la vidéo. Sans CTA, la vidéo se termine sur sa phrase de chute et
                retient nettement mieux jusqu'au bout.
              </span>
            </span>
          </label>

          <div className="text-sm">
            <label className="label-x" htmlFor="spend-cap">
              Plafond de dépense par vidéo (secondes de vidéo IA)
            </label>
            <input
              id="spend-cap"
              type="number"
              min={8}
              max={240}
              step={4}
              value={settings.spendCapSeconds ?? 72}
              onChange={(e) =>
                persist({
                  ...settings,
                  spendCapSeconds: Math.max(8, Math.min(240, Number(e.target.value) || 72)),
                })
              }
              className="field mt-1 w-32"
            />
            <span className="mt-1 block text-xs text-muted-foreground">
              Si l'estimation dépasse ce plafond, la génération refuse de partir et explique
              pourquoi, au lieu de consommer des crédits. 72 s par défaut.
            </span>
          </div>

          <div>
            <label className="label-x" htmlFor="voice-speed">
              Rythme de la voix ({(settings.voiceSpeed ?? 1).toFixed(2)}×)
            </label>
            <input
              id="voice-speed"
              type="range"
              min={0.95}
              max={1.15}
              step={0.05}
              value={settings.voiceSpeed ?? 1}
              onChange={(e) =>
                persist({ ...settings, voiceSpeed: Number(e.target.value) || 1 })
              }
              className="field mt-1 w-full"
            />
            <span className="mt-1 block text-xs text-muted-foreground">
              La longueur du texte est déjà calée sur la durée visée : laisse 1,00 par défaut ;
              au-delà de 1,10 la diction commence à se dégrader. Le réglage s'applique à toutes
              les langues. Une langue qui dépasse encore la durée cible après condensation du
              texte est accélérée automatiquement, sans jamais dépasser 1,15.
            </span>
          </div>

          <div className="flex flex-wrap gap-4">
            <div>
              <label className="label-x" htmlFor="price-video">
                Tarif d'une seconde de vidéo IA (€)
              </label>
              <input
                id="price-video"
                type="number"
                min={0}
                step={0.001}
                placeholder="—"
                value={settings.priceVideoSecond ?? ""}
                onChange={(e) =>
                  persist({
                    ...settings,
                    priceVideoSecond: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
                className="field mt-1 w-40"
              />
            </div>
            <div>
              <label className="label-x" htmlFor="price-image">
                Tarif d'une image générée (€)
              </label>
              <input
                id="price-image"
                type="number"
                min={0}
                step={0.001}
                placeholder="—"
                value={settings.priceImage ?? ""}
                onChange={(e) =>
                  persist({
                    ...settings,
                    priceImage: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
                className="field mt-1 w-40"
              />
            </div>
          </div>
          <span className="-mt-2 block text-xs text-muted-foreground">
            Sert au récapitulatif de coût affiché après chaque vidéo. Tant que ces champs sont
            vides, seules les quantités sont affichées : aucun prix n'est inventé.
          </span>
          <span className="-mt-2 block text-xs text-muted-foreground">
            Tarifs publics du fournisseur (Veo 3.1 Lite) : environ 0,03 $ par seconde de vidéo
            quand l'audio natif est désactivé — ce que ce studio demande systématiquement,
            l'audio étant refait avec les voix off — et 0,05 $ par seconde sinon. La passerelle
            peut appliquer sa propre marge : renseigne ici ton tarif réel en euros.
          </span>

          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={settings.sophiaLogo}
              onChange={(e) => persist({ ...settings, sophiaLogo: e.target.checked })}
              className="mt-1 h-4 w-4"
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
            <label className="label-x">
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
              className="mt-3 w-full"
            />
          </div>
        </section>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        <button
          onClick={() => {
            saveSettings(settings);
            toast.success("Paramètres enregistrés");
          }}
          className="btn-base btn-primary"
        >
          <Save className="h-4 w-4" /> Enregistrer
        </button>
        <button
          onClick={() => {
            persist(defaultSettings());
            toast.success("Réglages par défaut restaurés");
          }}
          className="btn-base btn-ghost"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Réinitialiser
        </button>
      </div>
    </main>
  );
}
