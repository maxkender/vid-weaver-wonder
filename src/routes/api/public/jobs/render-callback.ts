/** Retour du service de rendu : MP4 final ou échec. */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import {
  getJob,
  patchJob,
  patchJobIfStatus,
  logEvent,
  uploadBytes,
} from "@/lib/jobs/store.server";
import { verifySignedBody } from "@/lib/jobs/signing.server";

const schema = z.object({
  jobId: z.string().uuid(),
  status: z.enum(["done", "failed"]),
  error: z.string().max(2000).optional(),
  /** URL temporaire du MP4 produit par le worker. */
  videoUrl: z.string().url().optional(),
  durationSec: z.number().optional(),
});

export const Route = createFileRoute("/api/public/jobs/render-callback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["RENDER_WORKER_SECRET"];
        if (!secret) return Response.json({ error: "worker not configured" }, { status: 500 });

        const raw = await request.text();
        const check = await verifySignedBody(request, raw, secret);
        if (!check.ok) return Response.json({ error: check.reason }, { status: 401 });

        let body: z.infer<typeof schema>;
        try {
          body = schema.parse(JSON.parse(raw));
        } catch (e) {
          return Response.json(
            { error: e instanceof Error ? e.message : "invalid body" },
            { status: 400 },
          );
        }

        const job = await getJob(body.jobId);
        if (!job) return Response.json({ error: "not found" }, { status: 404 });

        // RAPPEL IDEMPOTENT : un travail déjà terminé n'est jamais réécrit, et
        // la vidéo du jour n'est pas retouchée par un rappel en double.
        if (job.status === "done" || job.status === "cancelled") {
          await logEvent(
            job.id,
            "callback",
            `Rappel ignoré : travail déjà « ${job.status} »`,
            "warn",
          );
          return Response.json({ ok: true, ignored: job.status });
        }

        if (body.status === "failed" || !body.videoUrl) {
          await patchJob(job.id, {
            status: "failed",
            step: "failed",
            error: body.error?.slice(0, 1000) ?? "rendu échoué",
            lease_until: null,
          });
        } else {
          // Le rendu est PAYÉ et RÉUSSI : un hoquet réseau ne doit pas le
          // perdre. Trois tentatives, attentes croissantes.
          let res: Response | null = null;
          let lastError = "";
          for (const wait of [0, 2_000, 8_000]) {
            if (wait) await new Promise((r) => setTimeout(r, wait));
            try {
              const attempt = await fetch(body.videoUrl);
              if (attempt.ok) {
                res = attempt;
                break;
              }
              lastError = `HTTP ${attempt.status}`;
            } catch (e) {
              lastError = e instanceof Error ? e.message : String(e);
            }
          }
          if (!res) {
            // Échec marqué : la relance automatique le reprendra à l'étape rendu.
            await logEvent(
              job.id,
              "callback",
              `Téléchargement du MP4 impossible après 3 tentatives (${lastError})`,
              "error",
            );
            await patchJob(job.id, {
              status: "failed",
              step: "failed",
              error: `téléchargement du MP4 impossible (${lastError})`,
              lease_until: null,
            });
          } else {
            const path = await uploadBytes(
              `jobs/${job.id}/final.mp4`,
              await res.arrayBuffer(),
              "video/mp4",
            );
            // Règle unique : tout travail qui n'est pas déjà terminé ou annulé
            // est finalisé par un rappel valide. Aucun autre critère ne bloque.
            const won = await patchJobIfStatus(
              job.id,
              ["queued", "scripting", "images", "voice", "clips", "rendering", "failed"],
              {
                status: "done",
                step: "done",
                progress: 1,
                video_path: path,
                error: null,
                lease_until: null,
              },
            );
            if (!won) {
              await logEvent(
                job.id,
                "callback",
                "Rappel refusé : le travail est passé à un état final pendant le traitement",
                "warn",
              );
              return Response.json({ ok: true, ignored: "already-final" });
            }
            await logEvent(job.id, "done", "Vidéo finale disponible");

            // La vidéo rejoint la diffusion du jour dans sa langue, en brouillon :
            // l'administrateur la relit et la publie depuis son tableau de bord.
            try {
              const { admin } = await import("@/lib/jobs/store.server");
              const db = await admin();
              // Date de diffusion : celle voulue par le travail si elle existe,
              // sinon le jour courant DANS LE FUSEAU de diffusion (un rendu
              // terminé à 23 h à Paris appartient au jour en cours, pas à la veille).
              const { data: settings } = await db
                .from("distribution_settings")
                .select("timezone")
                .eq("id", 1)
                .maybeSingle();
              const timeZone = (settings as { timezone?: string } | null)?.timezone ?? "Europe/Paris";
              const localDay = new Intl.DateTimeFormat("en-CA", {
                timeZone,
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
              }).format(new Date());
              const publishDate = job.publish_date ?? localDay;

              // Titre : celui du script DANS LA LANGUE de la vidéo, pas la
              // phrase brute du sujet.
              const scriptTitle = (
                (job.script as { title?: string } | null)?.title ?? ""
              ).trim();

              // Légende et hashtags déjà produits à l'écriture ou à la
              // traduction ; repli garanti si la génération est revenue vide.
              const { buildSocialCopy } = await import("@/lib/social-copy");
              const social = buildSocialCopy({
                caption: job.caption ?? "",
                hashtags: job.hashtags ?? [],
                hook:
                  (job.script as { hook?: string } | null)?.hook ??
                  job.scenes[0]?.narration ??
                  "",
                language: job.language,
              });

              // Une légende saisie à la main par l'administrateur n'est JAMAIS
              // réécrite.
              const { data: current } = await db
                .from("daily_videos")
                .select("caption, hashtags, render_id")
                .eq("publish_date", publishDate)
                .eq("language", job.language)
                .maybeSingle();
              const existing = current as
                | {
                    caption?: string | null;
                    hashtags?: string[] | null;
                    render_id?: string | null;
                  }
                | null;
              const keepCaption = (existing?.caption ?? "").trim();
              const keepTags = existing?.hashtags ?? [];

              // Garde anti-écrasement : un rendu SANS date de diffusion
              // (test studio, renvoi manuel) ne remplace jamais la vidéo
              // d'une journée déjà occupée par un autre rendu. Les jobs de
              // nuit, qui portent toujours une date, ne sont pas concernés.
              if (
                !job.publish_date &&
                existing?.render_id &&
                existing.render_id !== job.id
              ) {
                await logEvent(
                  job.id,
                  "done",
                  "Vidéo hors diffusion : la journée a déjà sa vidéo, rien n'a été remplacé",
                );
                return Response.json({ ok: true });
              }

              await db.from("daily_videos").upsert(
                {
                  publish_date: publishDate,
                  language: job.language,
                  render_id: job.id,
                  storage_path: path,
                  title: scriptTitle || job.topic || "",
                  caption: keepCaption || social.caption,
                  hashtags: keepTags.length ? keepTags : social.hashtags,
                  duration_sec: body.durationSec ?? job.duration_sec ?? 0,
                  status: "draft",
                },
                { onConflict: "publish_date,language" },
              );
            } catch {
              /* l'assignation du jour ne doit jamais faire échouer le rendu */
            }
          }
        }

        const { notifyClient } = await import("@/lib/jobs/notify.server");
        await notifyClient(job.id);
        return Response.json({ ok: true });
      },
    },
  },
});
