import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ArrowDown, ArrowUp, Check, Loader2, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Toaster } from "@/components/ui/sonner";
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

export const Route = createFileRoute("/_authenticated/_admin/sujets")({
  head: () => ({
    meta: [
      { title: "File de sujets — valider les idées avant de produire" },
      {
        name: "description",
        content:
          "Proposez, validez et ordonnez les sujets de vos vidéos courtes avant toute génération : le stock de sujets approuvés alimente la production automatique.",
      },
      { property: "og:title", content: "File de sujets du studio vidéo" },
      {
        property: "og:description",
        content:
          "Un stock de sujets validés à l'avance, testés sur les cinq leviers viraux, pour ne jamais produire une vidéo sur un mauvais sujet.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TopicQueuePage,
});

const STYLE_IDS: NarrationStyleId[] = [
  "question",
  "revelation",
  "storytelling",
  "listicle",
  "mecanique",
];

function TopicQueuePage() {
  const [topics, setTopics] = useState<QueuedTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [proposing, setProposing] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftAngle, setDraftAngle] = useState("");
  const [draftStyle, setDraftStyle] = useState<NarrationStyleId>("revelation");
  const [draftCategory, setDraftCategory] = useState("aleatoire");

  const runList = useServerFn(listTopics);
  const runAdd = useServerFn(addTopic);
  const runStatus = useServerFn(setTopicStatus);
  const runDelete = useServerFn(deleteTopic);
  const runMove = useServerFn(moveTopic);
  const runPropose = useServerFn(proposeTopicBatch);

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

  // Les sujets marqués « à revoir » par la vérification des faits reviennent
  // dans la liste à décider, signalés, plutôt que de partir en production.
  const pending = topics.filter((t) => t.status === "propose" || t.status === "revoir");
  const validated = topics.filter((t) => t.status === "valide");
  const used = topics.filter((t) => t.status === "utilise");
  const rejected = topics.filter((t) => t.status === "rejete");

  const onPropose = async () => {
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
  };

  const onAdd = async () => {
    if (draft.trim().length < 4) {
      toast.error("Écris d'abord le sujet");
      return;
    }
    try {
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
      toast.success("Sujet ajouté et validé");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ajout impossible");
    }
  };

  const decide = async (id: string, status: "valide" | "rejete") => {
    await runStatus({ data: { id, status } });
    await refresh();
  };

  const remove = async (id: string) => {
    await runDelete({ data: { id } });
    await refresh();
  };

  const move = async (id: string, direction: "up" | "down") => {
    await runMove({ data: { id, direction } });
    await refresh();
  };

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-6">
      <Toaster position="top-center" />

      <div className="mb-5 flex flex-wrap items-center gap-3 border-b border-border pb-3">
        <Link to="/studio" className="btn-base btn-ghost px-2.5 py-1.5 text-xs">
          <ArrowLeft className="h-3.5 w-3.5" /> Studio
        </Link>
        <h1 className="text-[15px] font-semibold tracking-tight">File de sujets</h1>
        <span className="ml-auto text-xs text-muted-foreground">
          Rien ne se génère à partir d'un sujet non validé.
        </span>
      </div>

      {/* STOCK DISPONIBLE — l'information la plus importante de la page. */}
      <section className="surface-card mb-4 flex flex-wrap items-center gap-4 p-4">
        <div>
          <p className="label-x">Sujets validés en attente</p>
          <p
            className={`text-3xl font-semibold ${
              validated.length < 5 ? "text-destructive" : "text-foreground"
            }`}
          >
            {validated.length}
          </p>
        </div>
        {validated.length < 5 && (
          <p className="text-xs text-destructive">
            Stock bas : valide au moins cinq sujets pour que la production automatique continue.
          </p>
        )}
        <button
          onClick={onPropose}
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

      {/* AJOUT MANUEL */}
      <section className="surface-card mb-4 space-y-2 p-4">
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
            className="field w-auto max-w-full text-xs"
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
            className="field w-auto max-w-full text-xs"
            aria-label="Catégorie"
          >
            {TOPIC_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <button onClick={onAdd} className="btn-base btn-ghost text-xs">
            Ajouter
          </button>
        </div>
      </section>

      {loading && <p className="text-xs text-muted-foreground">Chargement…</p>}

      {/* EN ATTENTE DE DÉCISION */}
      <section className="surface-card mb-4 p-4">
        <p className="label-x">À décider ({pending.length})</p>
        {pending.length === 0 && (
          <p className="mt-2 text-xs text-muted-foreground">Aucune proposition en attente.</p>
        )}
        <ul className="mt-2 space-y-2">
          {pending.map((t) => (
            <li
              key={t.id}
              className="flex flex-wrap items-start gap-3 rounded-[10px] border border-border p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  {t.status === "revoir" && (
                    <span className="mr-2 rounded-[6px] bg-destructive/15 px-1.5 py-0.5 text-[11px] text-destructive">
                      à revoir
                    </span>
                  )}
                  {t.topic}
                </p>
                {t.angle && <p className="mt-1 text-xs text-muted-foreground">{t.angle}</p>}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => void decide(t.id, "valide")}
                  className="btn-base btn-ghost text-xs"
                >
                  <Check className="h-3.5 w-3.5" /> Valider
                </button>
                <button
                  onClick={() => void decide(t.id, "rejete")}
                  className="btn-base btn-ghost text-xs"
                >
                  <X className="h-3.5 w-3.5" /> Rejeter
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* FILE VALIDÉE, ORDONNABLE */}
      <section className="surface-card mb-4 p-4">
        <p className="label-x">File validée ({validated.length})</p>
        {validated.length === 0 && (
          <p className="mt-2 text-xs text-muted-foreground">Aucun sujet validé pour l'instant.</p>
        )}
        <ol className="mt-2 space-y-2">
          {validated.map((t, i) => (
            <li
              key={t.id}
              className="flex flex-wrap items-start gap-3 rounded-[10px] border border-border p-3"
            >
              <span className="text-xs text-muted-foreground">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm">{t.topic}</p>
                {t.angle && <p className="mt-1 text-xs text-muted-foreground">{t.angle}</p>}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => void move(t.id, "up")}
                  disabled={i === 0}
                  className="btn-base btn-ghost px-2 py-1 text-xs"
                  aria-label="Monter"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => void move(t.id, "down")}
                  disabled={i === validated.length - 1}
                  className="btn-base btn-ghost px-2 py-1 text-xs"
                  aria-label="Descendre"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => void remove(t.id)}
                  className="btn-base btn-ghost px-2 py-1 text-xs"
                  aria-label="Supprimer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* HISTORIQUE */}
      <section className="surface-card p-4">
        <p className="label-x">Sujets déjà utilisés ({used.length})</p>
        {used.length === 0 && (
          <p className="mt-2 text-xs text-muted-foreground">Aucun sujet utilisé pour l'instant.</p>
        )}
        <ul className="mt-2 space-y-2">
          {used.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-3 text-sm">
              <span className="min-w-0 flex-1">{t.topic}</span>
              <span className="text-xs text-muted-foreground">
                {t.used_at ? new Date(t.used_at).toLocaleDateString("fr-FR") : ""}
              </span>
              {t.video_job_id && (
                <Link
                  to="/studio"
                  search={{ projet: t.video_job_id } as never}
                  className="btn-base btn-ghost px-2 py-1 text-xs"
                >
                  Voir la vidéo
                </Link>
              )}
            </li>
          ))}
        </ul>
        {rejected.length > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">{rejected.length} sujet(s) rejeté(s).</p>
        )}
      </section>
    </main>
  );
}
