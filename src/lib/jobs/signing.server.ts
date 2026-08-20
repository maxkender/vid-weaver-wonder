/**
 * Signature HMAC-SHA256 (Web Crypto : fonctionne dans le runtime serverless).
 * Sert à authentifier l'OS marketing, le service de rendu et les webhooks.
 */

const enc = new TextEncoder();

async function key(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

function toHex(buf: ArrayBuffer) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hmacHex(secret: string, payload: string): Promise<string> {
  const sig = await crypto.subtle.sign("HMAC", await key(secret), enc.encode(payload));
  return toHex(sig);
}

export async function sha256Hex(value: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", enc.encode(value)));
}

/** Comparaison à temps constant (évite les attaques par mesure du temps). */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Fenêtre anti-rejeu : 5 minutes. */
export const SIGNATURE_WINDOW_SEC = 300;

/**
 * Vérifie l'en-tête `x-signature` = HMAC(secret, `${timestamp}.${body}`),
 * avec `x-timestamp` en secondes epoch.
 */
export async function verifySignedBody(
  request: Request,
  body: string,
  secret: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const signature = request.headers.get("x-signature");
  const timestamp = request.headers.get("x-timestamp");
  if (!signature || !timestamp) return { ok: false, reason: "missing signature headers" };
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: "invalid timestamp" };
  if (Math.abs(Date.now() / 1000 - ts) > SIGNATURE_WINDOW_SEC) {
    return { ok: false, reason: "timestamp out of window" };
  }
  const expected = await hmacHex(secret, `${timestamp}.${body}`);
  if (!safeEqual(expected, signature.trim().toLowerCase())) {
    return { ok: false, reason: "bad signature" };
  }
  return { ok: true };
}

/** Construit les en-têtes signés pour un appel sortant (webhook, rendu). */
export async function signedHeaders(secret: string, body: string) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  return {
    "Content-Type": "application/json",
    "x-timestamp": timestamp,
    "x-signature": await hmacHex(secret, `${timestamp}.${body}`),
  };
}
