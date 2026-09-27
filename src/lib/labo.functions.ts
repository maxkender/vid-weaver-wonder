/** BANC D'ESSAI — lecture des briefs serveur en vigueur (aucune dépense). */
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getLabDefaults = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as unknown as { supabase: any; userId: string };
    const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
    if (data !== true) throw new Error("Accès réservé à l'administrateur.");
    const { TOPIC_INTRIGUE, TOPIC_VIRAL } = await import("./prompts.server");
    return { topicBrief: [TOPIC_INTRIGUE, TOPIC_VIRAL].join("\n") };
  });
