import type { TokenUsage } from "./usage";

const GATEWAY = "https://ai.gateway.lovable.dev/v1";

/** Consommation rapportée par la passerelle, conservée telle quelle. */
function readUsage(body: unknown): TokenUsage | undefined {
  const u = (body as { usage?: Record<string, number> } | null)?.usage;
  if (!u) return undefined;
  const out: TokenUsage = {};
  if (typeof u["prompt_tokens"] === "number") out.promptTokens = u["prompt_tokens"];
  if (typeof u["completion_tokens"] === "number") out.completionTokens = u["completion_tokens"];
  if (typeof u["total_tokens"] === "number") out.totalTokens = u["total_tokens"];
  return out;
}

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

/** Erreur de passerelle portant son code HTTP (pour décider d'un réessai). */
export class GatewayError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "GatewayError";
    this.status = status;
  }
}

async function readError(res: Response) {
  const body = (await res.json().catch(() => null)) as { message?: string } | null;
  const msg = body?.message ?? `Erreur du service IA (${res.status})`;
  if (res.status === 429) return "Trop de requêtes, réessayez dans quelques instants.";
  if (res.status === 402) return msg;
  return msg;
}

/** Erreur prête à lever : message lisible + code HTTP conservé. */
async function gatewayError(res: Response) {
  return new GatewayError(await readError(res), res.status);
}

/**
 * ERREURS TRANSITOIRES UNIQUEMENT : hoquet du service ou coupure réseau.
 * 401/402/403 (clé, crédits, politique) et refus de contenu ne sont JAMAIS
 * réessayés : ils gardent leur droit de veto immédiat sur la dépense.
 */
const TRANSIENT_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

export function isTransientError(e: unknown): boolean {
  if (e instanceof GatewayError) return TRANSIENT_STATUS.has(e.status);
  if (e instanceof Error) {
    if (/\b(401|402|403)\b|credit|insufficient|forbidden|refus/i.test(e.message)) return false;
    // Coupures réseau : la requête n'a jamais abouti, rien n'est facturé.
    return /fetch failed|network|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|aborted|timeout/i.test(
      e.message,
    );
  }
  return false;
}

/** Attentes croissantes : 2 s, 8 s, 20 s. Trois tentatives au total. */
export const RETRY_DELAYS_MS = [2_000, 8_000, 20_000];

export async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (!isTransientError(e) || attempt === RETRY_DELAYS_MS.length - 1) throw e;
      console.warn(
        `[ai] ${label} : erreur transitoire, nouvelle tentative dans ${RETRY_DELAYS_MS[attempt]! / 1000} s`,
      );
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]!));
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

export async function chatJSON<T>(
  model: string,
  system: string,
  user: string,
  temperature?: number,
  /** Réceptacle facultatif : la consommation rapportée par la passerelle. */
  usageOut?: { usage?: TokenUsage | undefined },
): Promise<T> {
  return withRetry("texte", async () => {
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

    if (!res.ok) throw await gatewayError(res);
    const data = (await res.json()) as { choices: { message: { content: string } }[] };
    if (usageOut) usageOut.usage = readUsage(data);
    const raw = data.choices?.[0]?.message?.content ?? "{}";
    const cleaned = raw
      .trim()
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/, "");
    return JSON.parse(cleaned) as T;
  });
}

/** Génère une image (Nano Banana) et renvoie une data URL. */
export async function generateImageDataUrl(
  prompt: string,
  referenceImages: string[] = [],
  usageOut?: { usage?: TokenUsage | undefined },
): Promise<string> {
  const content = referenceImages.length
    ? [
        { type: "text", text: prompt },
        ...referenceImages.map((url) => ({ type: "image_url", image_url: { url } })),
      ]
    : prompt;
  return withRetry("image", async () => {
    const res = await fetch(`${GATEWAY}/chat/completions`, {
      method: "POST",
      headers: gatewayHeaders(),
      body: JSON.stringify({
        model: "google/gemini-3.1-flash-image",
        modalities: ["image", "text"],
        messages: [{ role: "user", content }],
      }),
    });

    if (!res.ok) throw await gatewayError(res);
    const data = (await res.json()) as {
      choices: { message: { images?: { image_url?: { url?: string } }[] } }[];
    };
    if (usageOut) usageOut.usage = readUsage(data);
    const url = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!url) throw new Error("Aucune image générée.");
    return url;
  });
}

export type VideoJob = {
  id: string;
  status: "queued" | "in_progress" | "completed" | "failed";
  progress?: number;
  error?: { code?: string; message?: string };
};

// Veo génère une piste audio par défaut — et la facture (~40 % du prix du clip).
// Or ce studio n'utilise JAMAIS cet audio : la bande-son est refaite
// intégralement en aval (voix off ElevenLabs + musique), et le montage ne
// mappe que la piste vidéo du clip. On demande donc generateAudio: false ;
// si la passerelle rejette le paramètre, on retombe sur l'appel sans lui
// (l'économie est alors indisponible, mais la génération ne doit pas échouer).
let audioOptOutUnavailableLogged = false;

function videoJobBody(input: {
  prompt: string;
  seconds: "4" | "6" | "8";
  size: string;
  inputReference?: string;
}): Record<string, unknown> {
  return {
    model: "google/veo-3.1-lite",
    prompt: input.prompt,
    seconds: input.seconds,
    size: input.size,
    ...(input.inputReference ? { input_reference: input.inputReference } : {}),
  };
}

async function postVideoJob(body: Record<string, unknown>): Promise<Response> {
  return fetch(`${GATEWAY}/videos`, {
    method: "POST",
    headers: gatewayHeaders(),
    body: JSON.stringify(body),
  });
}

export async function createVideoJob(input: {
  prompt: string;
  seconds: "4" | "6" | "8";
  size: string;
  inputReference?: string;
}): Promise<VideoJob> {
  const base = videoJobBody(input);

  // 1er essai : audio désactivé (tarif sans audio).
  let res = await postVideoJob({ ...base, generateAudio: false });
  if (!res.ok) {
    const firstError = await readError(res);
    // 2e essai avec la variante snake_case, au cas où.
    res = await postVideoJob({ ...base, generate_audio: false });
    if (!res.ok) {
      await readError(res); // consomme le corps
      // 3e essai : sans le paramètre — la génération ne doit jamais échouer
      // à cause de cette optimisation de coût.
      res = await postVideoJob(base);
      if (!res.ok) throw new Error(await readError(res));
      if (!audioOptOutUnavailableLogged) {
        audioOptOutUnavailableLogged = true;
        console.warn(
          "[video] La passerelle refuse generateAudio=false — audio natif généré et facturé. Première erreur :",
          firstError,
        );
      }
    }
  }
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
export async function generateSpeechDataUrl(
  text: string,
  voice: string,
  langName = "français de France",
): Promise<string> {
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
        `Langue : ${langName}, accent neutre et parfaitement naturel.`,
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
