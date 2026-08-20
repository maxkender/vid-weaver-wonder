/**
 * API publique : création d'un job de production vidéo par l'OS marketing.
 *
 * Auth : en-tête `x-api-key` (clé du client, hachée en base) + signature HMAC
 * du corps (`x-signature`, `x-timestamp`) avec le secret du client.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { admin } from "@/lib/jobs/store.server";
import { sha256Hex, verifySignedBody } from "@/lib/jobs/signing.server";
import { LANGUAGE_IDS } from "@/lib/languages";
import { TOPIC_CATEGORY_IDS } from "@/lib/topic-categories";

const NARRATION = ["question", "revelation", "storytelling", "listicle"] as const;
const VISUAL = ["papercraft", "cinematique", "documentaire", "retro"] as const;

const bodySchema = z.object({
  posterId: z.string().min(1).max(120),
  language: z.enum(LANGUAGE_IDS).default("fr"),
  /** Style narratif imposé, ou tirage aléatoire dans une liste autorisée. */
  narrationStyle: z.union([z.enum(NARRATION), z.literal("random")]).default("random"),
  allowedNarrationStyles: z.array(z.enum(NARRATION)).max(4).optional(),
  topicCategory: z.union([z.enum(TOPIC_CATEGORY_IDS), z.literal("random")]).default("random"),
  allowedTopicCategories: z.array(z.enum(TOPIC_CATEGORY_IDS)).max(20).optional(),
  /** Direction artistique : fixe par posteur. */
  visualStyle: z.enum(VISUAL).default("papercraft"),
  durationSec: z.number().int().min(15).max(90).default(45),
  voiceId: z.string().min(2).max(60).optional(),
  topic: z.string().max(500).optional(),
  callbackUrl: z.string().url().max(500).optional(),
});

function pick<T>(arr: readonly T[], fallback: T): T {
  if (!arr.length) return fallback;
  return arr[Math.floor(Math.random() * arr.length)] ?? fallback;
}

export const Route = createFileRoute("/api/public/videos")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("x-api-key");
        if (!apiKey) return Response.json({ error: "missing x-api-key" }, { status: 401 });

        const raw = await request.text();
        const db = await admin();
        const { data: client } = await db
          .from("api_clients")
          .select("id, webhook_secret, daily_quota, active")
          .eq("key_hash", await sha256Hex(apiKey))
          .maybeSingle();
        const row = client as
          | { id: string; webhook_secret: string; daily_quota: number; active: boolean }
          | null;
        if (!row?.active) return Response.json({ error: "unknown api key" }, { status: 401 });

        const check = await verifySignedBody(request, raw, row.webhook_secret);
        if (!check.ok) return Response.json({ error: check.reason }, { status: 401 });

        let parsed: z.infer<typeof bodySchema>;
        try {
          parsed = bodySchema.parse(JSON.parse(raw));
        } catch (e) {
          return Response.json(
            { error: e instanceof Error ? e.message : "invalid body" },
            { status: 400 },
          );
        }

        // Quota journalier par client.
        const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
        const { count } = await db
          .from("render_jobs")
          .select("id", { count: "exact", head: true })
          .eq("client_id", row.id)
          .gte("created_at", since);
        if ((count ?? 0) >= row.daily_quota) {
          return Response.json({ error: "daily quota reached" }, { status: 429 });
        }

        const narration =
          parsed.narrationStyle === "random"
            ? pick(parsed.allowedNarrationStyles ?? NARRATION, "revelation")
            : parsed.narrationStyle;
        const category =
          parsed.topicCategory === "random"
            ? pick(parsed.allowedTopicCategories ?? [], "aleatoire")
            : parsed.topicCategory;

        const { data: created, error } = await db
          .from("render_jobs")
          .insert({
            client_id: row.id,
            poster_id: parsed.posterId,
            language: parsed.language,
            narration_style: narration,
            topic_category: category,
            visual_style: parsed.visualStyle,
            duration_sec: parsed.durationSec,
            voice_id: parsed.voiceId ?? null,
            topic: parsed.topic ?? null,
            callback_url: parsed.callbackUrl ?? null,
          })
          .select("id, status")
          .single();
        if (error) return Response.json({ error: error.message }, { status: 500 });

        const job = created as { id: string; status: string };
        return Response.json({ jobId: job.id, status: job.status }, { status: 201 });
      },
    },
  },
});
