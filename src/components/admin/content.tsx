import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, ShieldAlert, Volume2 } from "lucide-react";
import { toast } from "sonner";

import { MusicLibrary } from "@/components/music-library";
import { ContractMarkdown } from "@/components/contract-markdown";
import {
  createContractVersion,
  listContractTemplates,
  listLanguageSettings,
  updateLanguageSetting,
} from "@/lib/admin.functions";
import { generateSceneVoice } from "@/lib/studio.functions";
import { MASTER_LANGUAGES, languageLabel } from "@/lib/languages";
import { NARRATION_LABELS, VISUAL_LABELS } from "@/lib/style-presets";

type LanguageRow = {
  language: string;
  enabled: boolean;
  eleven_voice_id: string | null;
  voice_speed: number;
  narration_style: string;
  visual_style: string;
  music_style: string;
};

type Template = {
  id: string;
  version: number;
  title: string;
  body: string;
  is_active: boolean;
};

export function AdminContent() {
  const runList = useServerFn(listLanguageSettings);
  const runUpdate = useServerFn(updateLanguageSetting);
  const runTemplates = useServerFn(listContractTemplates);
  const runCreateVersion = useServerFn(createContractVersion);
  const runVoice = useServerFn(generateSceneVoice);

  const [rows, setRows] = useState<LanguageRow[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState("");

  const refresh = useCallback(async () => {
    const [l, t] = await Promise.all([runList(), runTemplates()]);
    setRows((l as { languages: LanguageRow[] }).languages);
    const list = (t as { templates: Template[] }).templates;
    setTemplates(list);
    const active = list.find((x) => x.is_active) ?? list[0];
    if (active) {
      setTitle(active.title);
      setBody(active.body);
    }
  }, [runList, runTemplates]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const patch = async (language: string, data: Record<string, unknown>) => {
    try {
      await runUpdate({ data: { language, ...data } as never });
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enregistrement impossible");
    }
  };

  const preview = async (row: LanguageRow) => {
    if (!row.eleven_voice_id) {
      toast.error("Renseigne d'abord un identifiant de voix.");
      return;
    }
    setPlaying(row.language);
    try {
      const res = (await runVoice({
        data: {
          text: "Voici un extrait de cette voix pour la narration de vos vidéos.",
          voice: row.eleven_voice_id,
          engine: "elevenlabs",
          language: row.language as "fr",
          speed: Number(row.voice_speed),
        },
      })) as { audioDataUrl: string };
      await new Audio(res.audioDataUrl).play();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Écoute impossible");
    } finally {
      setPlaying("");
    }
  };

  const activeTemplate = templates.find((t) => t.is_active) ?? null;

  return (
    <div className="space-y-4">
      <section className="surface-card overflow-x-auto p-0">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr className="border-b border-border">
              <th className="px-3 py-2">Langue</th>
              <th className="px-3 py-2">Active</th>
              <th className="px-3 py-2">Voix ElevenLabs</th>
              <th className="px-3 py-2">Vitesse</th>
              <th className="px-3 py-2">Narration</th>
              <th className="px-3 py-2">Visuel</th>
              <th className="px-3 py-2">Musique</th>
            </tr>
          </thead>
          <tbody>
            {MASTER_LANGUAGES.map((lang) => {
              const row =
                rows.find((r) => r.language === lang.id) ??
                ({
                  language: lang.id,
                  enabled: true,
                  eleven_voice_id: null,
                  voice_speed: 1.05,
                  narration_style: "revelation",
                  visual_style: "papercraft",
                  music_style: "revelation",
                } as LanguageRow);
              return (
                <tr key={lang.id} className="border-b border-border/60">
                  <td className="px-3 py-1.5">{languageLabel(lang.id)}</td>
                  <td className="px-3 py-1.5">
                    <input
                      type="checkbox"
                      checked={row.enabled}
                      onChange={(e) => void patch(lang.id, { enabled: e.target.checked })}
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-1">
                      <input
                        defaultValue={row.eleven_voice_id ?? ""}
                        onBlur={(e) => {
                          if (e.target.value !== (row.eleven_voice_id ?? "")) {
                            void patch(lang.id, { elevenVoiceId: e.target.value });
                          }
                        }}
                        placeholder="Identifiant de voix"
                        className="field w-52 font-mono text-xs"
                      />
                      <button
                        className="btn-base btn-ghost px-2 py-1 text-xs"
                        onClick={() => void preview(row)}
                        title="Écouter un extrait"
                      >
                        {playing === lang.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Volume2 className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      type="number"
                      step="0.01"
                      min={0.9}
                      max={1.15}
                      defaultValue={Number(row.voice_speed)}
                      onBlur={(e) => void patch(lang.id, { voiceSpeed: Number(e.target.value) })}
                      className="field w-20 text-xs"
                      aria-label="Vitesse de lecture"
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <select
                      value={row.narration_style}
                      onChange={(e) => void patch(lang.id, { narrationStyle: e.target.value })}
                      className="field w-36 text-xs"
                    >
                      {Object.entries(NARRATION_LABELS).map(([id, label]) => (
                        <option key={id} value={id}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-1.5">
                    <select
                      value={row.visual_style}
                      onChange={(e) => void patch(lang.id, { visualStyle: e.target.value })}
                      className="field w-36 text-xs"
                    >
                      {Object.entries(VISUAL_LABELS).map(([id, label]) => (
                        <option key={id} value={id}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-1.5">
                    <select
                      value={row.music_style}
                      onChange={(e) => void patch(lang.id, { musicStyle: e.target.value })}
                      className="field w-36 text-xs"
                    >
                      {Object.entries(NARRATION_LABELS).map(([id, label]) => (
                        <option key={id} value={id}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="surface-card p-3">
        <p className="label-x">Banque de musiques</p>
        <div className="mt-2">
          <MusicLibrary
            styles={Object.entries(NARRATION_LABELS).map(([id, label]) => ({ id, label }))}
            activeStyle="revelation"
          />
        </div>
      </section>

      <section className="surface-card p-3">
        <p className="label-x">Modèle de contrat</p>
        <div className="mt-2 flex items-start gap-3 rounded-[10px] border border-destructive/40 bg-destructive/10 p-3">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <p className="text-xs">
            Modèle de travail, non relu par un juriste. À faire valider par un avocat avant toute
            utilisation réelle. Les conditions d'utilisation d'Instagram interdisent la cession de
            comptes entre personnes, et un compte Google personnel n'est pas transférable à une
            société : une clause de restitution peut être inapplicable et exposer le compte à une
            suspension.
          </p>
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          Version active : {activeTemplate ? `v${activeTemplate.version}` : "aucune"} ·{" "}
          {templates.length} version(s) au total. Créer une nouvelle version ne modifie jamais un
          contrat déjà signé.
        </p>

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="field mt-2 text-sm"
          placeholder="Titre du contrat"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={16}
          className="field mt-2 font-mono text-xs"
          placeholder="Texte du contrat (markdown simple)"
        />
        <button
          className="btn-base btn-primary mt-2 text-xs"
          disabled={busy || body.trim().length < 50}
          onClick={async () => {
            setBusy(true);
            try {
              const res = (await runCreateVersion({ data: { title, body } })) as { version: number };
              toast.success(`Version ${res.version} créée et activée`);
              await refresh();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Création impossible");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Créer une nouvelle version
        </button>

        <div className="mt-3 max-h-72 overflow-y-auto rounded-[10px] border border-border p-3">
          <ContractMarkdown body={body} />
        </div>
      </section>
    </div>
  );
}
