import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, GripVertical, Loader2, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { TOPIC_CATEGORIES } from "@/lib/topic-categories";
import { NARRATION_LABELS, type NarrationStyleId } from "@/lib/style-presets";
import {
  addTopic,
  deleteTopic,
  listTopics,
  moveTopic,
  proposeTopicBatch,
  setTopicStatus,
  type QueuedTopic,
} from "@/lib/topics.functions";

const STYLE_IDS: NarrationStyleId[] = [
  "question",
  "revelation",
  "storytelling",
  "listicle",
  "mecanique",
];

/** Une vidéo par jour et par langue : la file avance d'un sujet par jour. */
const TOPICS_PER_DAY = 1;

export function AdminTopics() {
  const runList = useServerFn(listTopics);
  const runAdd = useServerFn(addTopic);
  const runStatus = useServerFn(setTopicStatus);
  const runDelete = useServerFn(deleteTopic);
  const runMove = useServerFn(moveTopic);
  const runPropose = useServerFn(proposeTopicBatch);

  const [topics, setTopics] = useState<QueuedTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [proposing, setProposing] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftAngle, setDraftAngle] = useState("");
  const [draftStyle, setDraftStyle] = useState<NarrationStyleId>("revelation");
  const [draftCategory, setDraftCategory] = useState("aleatoire");
  const [dragId, setDragId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = (await runList()) as { topics: QueuedTopic[] };
      setTopics(res.topics);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lecture de la file impossible");
    } finally {
      setLoading(false);
    }
  }, [runList]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const pending = topics.filter((t) => t.status === "propose" || t.status === "revoir");
  const validated = topics.filter((t) => t.status === "valide");
  const used = topics.filter((t) => t.status === "utilise");
  const rejected = topics.filter((t) => t.status === "rejete");

  /** Glisser-déposer : on rejoue des échanges de voisins jusqu'à la position visée. */
  const dropOn = async (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const from = validated.findIndex((t) => t.id === dragId);
    const to = validated.findIndex((t) => t.id === targetId);
    if (from < 0 || to < 0) return;
    const direction = to < from ? "up" : "down";
    for (let i = 0; i < Math.abs(to - from); i++) {
      await runMove({ data: { id: dragId, direction } });
    }
    setDragId(null);
    await refresh();
  };

  return (
    <div className="space-y-4">
      <section className="surface-card flex flex-wrap items-center gap-4 p-3">
        <div>
          <p className="label-x">Sujets validés en attente</p>
          <p
            className={`text-2xl font-semibold ${validated.length < 5 ? "text-destructive" : ""}`}
          >
            {validated.length}
          </p>
        </div>
        <div>
          <p className="label-x">Avance de la file</p>
          <p className="text-2xl font-semibold">
            {Math.floor(validated.length / TOPICS_PER_DAY)}{" "}
            <span className="text-sm font-normal text-muted-foreground">jour(s)</span>
          </p>
        </div>
        {validated.length < 5 ? (
          <p className="text-xs text-destructive">
            Stock bas : valide au moins cinq sujets pour que la production automatique continue.
          </p>
        ) : null}
        <button
          onClick={async () => {
            setProposing(true);
            try {
              const res = (await runPropose({ data: { count: 20, narrationStyle: draftStyle } })) as {
                inserted: number;
              };
              toast.success(`${res.inserted} sujets proposés`);
              await refresh();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Échec de la proposition");
            } finally {
              setProposing(false);
            }
          }}
          disabled={proposing}
          className="btn-base btn-primary ml-auto text-xs"
        >
          {proposing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          Proposer 20 sujets
        </button>
      </section>

      <section className="surface-card space-y-2 p-3">
        <p className="label-x">Ajouter un sujet à la main</p>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Formule-le comme la première phrase de la vidéo"
          className="field"
        />
        <input
          value={draftAngle}
          onChange={(e) => setDraftAngle(e.target.value)}
          placeholder="Angle : la révélation en une phrase (facultatif)"
          className="field"
        />
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={draftStyle}
            onChange={(e) => setDraftStyle(e.target.value as NarrationStyleId)}
            className="field w-auto text-xs"
            aria-label="Style de narration"
          >
            {STYLE_IDS.map((s) => (
              <option key={s} value={s}>
                {NARRATION_LABELS[s]}
              </option>
            ))}
          </select>
          <select
            value={draftCategory}
            onChange={(e) => setDraftCategory(e.target.value)}
            className="field w-auto text-xs"
            aria-label="Catégorie"
          >
            {TOPIC_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <button
            className="btn-base btn-ghost text-xs"
            onClick={async () => {
              if (draft.trim().length < 4) {
                toast.error("Écris d'abord le sujet");
                return;
              }
              await runAdd({
                data: {
                  topic: draft.trim(),
                  angle: draftAngle.trim(),
                  narrationStyle: draftStyle,
                  category: draftCategory,
                  status: "valide",
                },
              });
              setDraft("");
              setDraftAngle("");
              await refresh();
            }}
          >
            Ajouter
          </button>
        </div>
      </section>

      {loading ? <p className="text-xs text-muted-foreground">Chargement…</p> : null}

      <section className="surface-card p-3">
        <p className="label-x">À décider ({pending.length})</p>
        <ul className="mt-2 space-y-2">
          {pending.map((t) => (
            <li key={t.id} className="flex flex-wrap items-start gap-3 rounded-[10px] border border-border p-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  {t.status === "revoir" ? (
                    <span className="mr-2 rounded-[6px] bg-destructive/15 px-1.5 py-0.5 text-[11px] text-destructive">
                      à revoir
                    </span>
                  ) : null}
                  {t.topic}
                </p>
                {t.angle ? <p className="mt-0.5 text-xs text-muted-foreground">{t.angle}</p> : null}
              </div>
              <button
                className="btn-base btn-ghost text-xs"
                onClick={async () => {
                  await runStatus({ data: { id: t.id, status: "valide" } });
                  await refresh();
                }}
              >
                <Check className="h-3.5 w-3.5" /> Valider
              </button>
              <button
                className="btn-base btn-ghost text-xs"
                onClick={async () => {
                  await runStatus({ data: { id: t.id, status: "rejete" } });
                  await refresh();
                }}
              >
                <X className="h-3.5 w-3.5" /> Rejeter
              </button>
            </li>
          ))}
          {pending.length === 0 ? (
            <li className="text-xs text-muted-foreground">Aucune proposition en attente.</li>
          ) : null}
        </ul>
      </section>

      <section className="surface-card p-3">
        <p className="label-x">File validée ({validated.length}) — glisse pour réordonner</p>
        <ol className="mt-2 space-y-2">
          {validated.map((t, i) => (
            <li
              key={t.id}
              draggable
              onDragStart={() => setDragId(t.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => void dropOn(t.id)}
              className={`flex items-start gap-3 rounded-[10px] border p-2 ${
                dragId === t.id ? "border-primary" : "border-border"
              }`}
            >
              <GripVertical className="mt-0.5 h-3.5 w-3.5 cursor-grab text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm">{t.topic}</p>
                {t.angle ? <p className="mt-0.5 text-xs text-muted-foreground">{t.angle}</p> : null}
              </div>
              <span className="text-[11px] text-muted-foreground">
                {NARRATION_LABELS[t.narration_style as NarrationStyleId] ?? t.narration_style}
              </span>
              <button
                className="btn-base btn-ghost px-2 py-1 text-xs"
                onClick={async () => {
                  await runDelete({ data: { id: t.id } });
                  await refresh();
                }}
                aria-label="Supprimer"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
          {validated.length === 0 ? (
            <li className="text-xs text-muted-foreground">Aucun sujet validé.</li>
          ) : null}
        </ol>
      </section>

      <section className="surface-card p-3">
        <p className="label-x">Sujets déjà utilisés ({used.length})</p>
        <ul className="mt-2 space-y-1">
          {used.slice(0, 40).map((t) => (
            <li key={t.id} className="flex items-center gap-3 text-sm">
              <span className="min-w-0 flex-1 truncate">{t.topic}</span>
              <span className="text-xs text-muted-foreground">
                {t.used_at ? new Date(t.used_at).toLocaleDateString("fr-FR") : ""}
              </span>
            </li>
          ))}
        </ul>
        {rejected.length > 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">{rejected.length} sujet(s) rejeté(s).</p>
        ) : null}
      </section>
    </div>
  );
}
