/**
 * Service de rendu Sophia.
 *
 * POST /render  — reçoit un manifeste signé (HMAC), rend le MP4 puis rappelle
 *                 le studio avec une URL temporaire de téléchargement.
 * GET  /files/:id.mp4 — sert le MP4 produit (le studio le recopie aussitôt
 *                 dans son stockage privé, puis le fichier est purgé).
 * GET  /health
 */
import express from "express";
import { createHmac, timingSafeEqual } from "node:crypto";

import { renderJob } from "./render.js";

const PORT = process.env.PORT ?? 8787;
const SECRET = process.env.RENDER_WORKER_SECRET;
const PUBLIC_URL = process.env.PUBLIC_URL ?? `http://localhost:${PORT}`;
const SIGNATURE_WINDOW_SEC = 300;

if (!SECRET) {
  console.error("RENDER_WORKER_SECRET manquant.");
  process.exit(1);
}

/** MP4 en mémoire, purgés après récupération ou au bout d'une heure. */
const files = new Map();

const app = express();
app.use(express.text({ type: "*/*", limit: "8mb" }));

function sign(body) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  return {
    "Content-Type": "application/json",
    "x-timestamp": timestamp,
    "x-signature": createHmac("sha256", SECRET).update(`${timestamp}.${body}`).digest("hex"),
  };
}

function verify(req, raw) {
  const signature = req.get("x-signature");
  const timestamp = req.get("x-timestamp");
  if (!signature || !timestamp) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > SIGNATURE_WINDOW_SEC) return false;
  const expected = createHmac("sha256", SECRET).update(`${timestamp}.${raw}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature.trim().toLowerCase());
  return a.length === b.length && timingSafeEqual(a, b);
}

app.get("/health", (_req, res) => res.json({ ok: true, pending: files.size }));

app.post("/render", async (req, res) => {
  const raw = typeof req.body === "string" ? req.body : "";
  if (!verify(req, raw)) return res.status(401).json({ error: "bad signature" });

  let manifest;
  try {
    manifest = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: "invalid json" });
  }
  if (!manifest.jobId || !Array.isArray(manifest.scenes) || !manifest.scenes.length) {
    return res.status(400).json({ error: "manifeste incomplet" });
  }

  // Le rendu dure plusieurs minutes : on accuse réception tout de suite.
  res.status(202).json({ accepted: true, jobId: manifest.jobId });

  let payload;
  try {
    const { bytes, duration } = await renderJob(manifest);
    files.set(manifest.jobId, bytes);
    setTimeout(() => files.delete(manifest.jobId), 60 * 60 * 1000).unref?.();
    payload = {
      jobId: manifest.jobId,
      status: "done",
      videoUrl: `${PUBLIC_URL.replace(/\/$/, "")}/files/${manifest.jobId}.mp4`,
      durationSec: duration,
    };
  } catch (e) {
    payload = { jobId: manifest.jobId, status: "failed", error: String(e?.message ?? e).slice(0, 2000) };
  }

  if (!manifest.callbackUrl) return;
  const body = JSON.stringify(payload);
  try {
    await fetch(manifest.callbackUrl, { method: "POST", headers: sign(body), body });
  } catch (e) {
    console.error("Callback impossible :", e);
  }
});

app.get("/files/:name", (req, res) => {
  const id = req.params.name.replace(/\.mp4$/, "");
  const bytes = files.get(id);
  if (!bytes) return res.status(404).end();
  res.setHeader("Content-Type", "video/mp4");
  res.send(bytes);
});

app.listen(PORT, () => console.log(`Service de rendu Sophia sur ${PORT}`));
