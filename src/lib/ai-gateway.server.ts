const GATEWAY = "https://ai.gateway.lovable.dev/v1";

function key() {
  const k = process.env["LOVABLE_API_KEY"];
  if (!k) throw new Error("Clé AI manquante côté serveur.");
  return k;
}

export function gatewayHeaders(json = true): Record<string, string> {
  const h: Record<string, string> = { Authorization: `Bearer ${key()}` };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

async function readError(res: Response) {
  const body = (await res.json().catch(() => null)) as { message?: string } | null;
  const msg = body?.message ?? `Erreur du service IA (${res.status})`;
  if (res.status === 429) return "Trop de requêtes, réessayez dans quelques instants.";
  if (res.status === 402) return msg;
  return msg;
}

export async function chatJSON<T>(
  model: string,
  system: string,
  user: string,
  temperature?: number,
): Promise<T> {
  const res = await fetch(`${GATEWAY}/chat/completions`, {
    method: "POST",
    headers: gatewayHeaders(),
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      ...(temperature === undefined ? {} : { temperature }),
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as { choices: { message: { content: string } }[] };
  const raw = data.choices?.[0]?.message?.content ?? "{}";
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "");
  return JSON.parse(cleaned) as T;
}

/** Génère une image (Nano Banana) et renvoie une data URL. */
export async function generateImageDataUrl(
  prompt: string,
  referenceImages: string[] = [],
): Promise<string> {
  const content = referenceImages.length
    ? [
        { type: "text", text: prompt },
        ...referenceImages.map((url) => ({ type: "image_url", image_url: { url } })),
      ]
    : prompt;
  const res = await fetch(`${GATEWAY}/chat/completions`, {
    method: "POST",
    headers: gatewayHeaders(),
    body: JSON.stringify({
      model: "google/gemini-3.1-flash-image",
      modalities: ["image", "text"],
      messages: [{ role: "user", content }],
    }),
  });

  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as {
    choices: { message: { images?: { image_url?: { url?: string } }[] } }[];
  };
  const url = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!url) throw new Error("Aucune image générée.");
  return url;
}

export type VideoJob = {
  id: string;
  status: "queued" | "in_progress" | "completed" | "failed";
  progress?: number;
  error?: { code?: string; message?: string };
};

export async function createVideoJob(input: {
  prompt: string;
  seconds: "4" | "6" | "8";
  size: string;
  inputReference?: string;
}): Promise<VideoJob> {
  const res = await fetch(`${GATEWAY}/videos`, {
    method: "POST",
    headers: gatewayHeaders(),
    body: JSON.stringify({
      model: "google/veo-3.1-lite",
      prompt: input.prompt,
      seconds: input.seconds,
      size: input.size,
      ...(input.inputReference ? { input_reference: input.inputReference } : {}),
    }),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as VideoJob;
}

export async function getVideoJob(id: string): Promise<VideoJob> {
  const res = await fetch(`${GATEWAY}/videos/${id}`, { headers: gatewayHeaders(false) });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as VideoJob;
}

export async function fetchVideoContent(id: string): Promise<Response> {
  return fetch(`${GATEWAY}/videos/${id}/content`, { headers: gatewayHeaders(false) });
}

/** Génère une voix off (TTS) et renvoie une data URL audio/mpeg. */
export async function generateSpeechDataUrl(text: string, voice: string): Promise<string> {
  const res = await fetch(`${GATEWAY}/audio/speech`, {
    method: "POST",
    headers: gatewayHeaders(),
    body: JSON.stringify({
      model: "openai/gpt-4o-mini-tts",
      voice,
      input: text,
      response_format: "mp3",
      speed: 1.0,
      instructions: [
        "Langue : français de France, accent neutre et parfaitement naturel.",
        "Rôle : narrateur de documentaire moderne pour une vidéo courte verticale.",
        "Ton : posé mais captivant, chaleureux, complice, jamais robotique ni publicitaire.",
        "Débit : moyen-rapide, avec de vraies respirations et de courtes pauses après chaque phrase.",
        "Intonation : descends en fin de phrase, appuie légèrement les mots clés et les révélations, garde une montée de tension sur la dernière phrase.",
        "Ne lis pas la ponctuation, n'exagère pas, ne chante pas.",
      ].join(" "),
    }),
  });
  if (!res.ok) throw new Error(await readError(res));
  const buf = Buffer.from(await res.arrayBuffer());
  return `data:audio/mpeg;base64,${buf.toString("base64")}`;
}
