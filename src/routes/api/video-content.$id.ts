import { createFileRoute } from "@tanstack/react-router";

import { fetchVideoContent } from "@/lib/ai-gateway.server";

export const Route = createFileRoute("/api/video-content/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const id = params.id;
        if (!/^[A-Za-z0-9_.:-]{3,120}$/.test(id)) {
          return new Response("Identifiant invalide", { status: 400 });
        }
        const res = await fetchVideoContent(id);
        if (!res.ok || !res.body) {
          return new Response("Vidéo indisponible", { status: res.status || 502 });
        }
        const headers = new Headers({
          "content-type": "video/mp4",
          "cache-control": "private, max-age=600",
          "accept-ranges": "bytes",
        });
        const len = res.headers.get("content-length");
        if (len) headers.set("content-length", len);
        return new Response(res.body, { headers });
      },

    },
  },
});
