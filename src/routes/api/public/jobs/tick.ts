/** Boucle de production : appelée par pg_cron toutes les minutes. */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/jobs/tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = request.headers.get("apikey");
        if (!key || key !== process.env["SUPABASE_PUBLISHABLE_KEY"]) {
          return Response.json({ error: "unauthorized" }, { status: 401 });
        }
        const { runTick } = await import("@/lib/jobs/pipeline.server");
        const origin = new URL(request.url).origin;
        try {
          const result = await runTick(origin);
          return Response.json(result);
        } catch (e) {
          return Response.json(
            { error: e instanceof Error ? e.message : "tick failed" },
            { status: 500 },
          );
        }
      },
    },
  },
});
