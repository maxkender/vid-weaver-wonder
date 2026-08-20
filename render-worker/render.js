/**
 * Assemblage ffmpeg : un plan = clip animé (ou image fixe si le clip a échoué)
 * + voix off + sous-titres mot par mot, puis concaténation.
 */
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { drawTextFilters, smoothTimings } from "./captions.js";

const FONT_FILE = process.env.CAPTION_FONT_FILE ?? "/usr/share/fonts/truetype/anton/Anton-Regular.ttf";
const SQUARE_MARGIN_RATIO = 0.06;
const SQUARE_RADIUS_RATIO = 0.07;

function run(args) {
  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", ...args]);
    let err = "";
    p.stderr.on("data", (d) => (err += d.toString().slice(0, 4000)));
    p.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg (${code}) : ${err.slice(0, 1500)}`)),
    );
  });
}

async function download(url, path) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Téléchargement impossible (${res.status})`);
  await writeFile(path, Buffer.from(await res.arrayBuffer()));
}

/** Masque carré à coins arrondis, identique pour tous les plans. */
function squareFilter(width, height) {
  const side = Math.round(Math.min(width * (1 - 2 * SQUARE_MARGIN_RATIO), height));
  const r = Math.round(side * SQUARE_RADIUS_RATIO);
  const x = Math.round((width - side) / 2);
  const y = Math.round((height - side) / 2);
  return (
    `scale=${side}:${side}:force_original_aspect_ratio=increase,crop=${side}:${side},` +
    `geq=lum='p(X,Y)':cb='p(X,Y)':cr='p(X,Y)',` +
    `pad=${width}:${height}:${x}:${y}:black,` +
    // Coins arrondis : masque alpha généré à la volée.
    `format=yuv420p`
  ).replace("geq=lum='p(X,Y)':cb='p(X,Y)':cr='p(X,Y)',", `format=rgba,` +
    `geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':` +
    `a='if(gt(hypot(max(0,${r}-X)+max(0,X-(${side}-${r})),max(0,${r}-Y)+max(0,Y-(${side}-${r}))),${r}),0,255)',`);
}

/** Rend un plan : vidéo (ou image bouclée) + audio + sous-titres. */
async function renderScene(scene, dir, opts) {
  const i = scene.index;
  const out = join(dir, `scene-${i}.mp4`);
  const duration = Math.max(0.8, Number(scene.duration) || 3);
  const args = ["-y"];

  let source;
  if (scene.videoUrl) {
    source = join(dir, `clip-${i}.mp4`);
    await download(scene.videoUrl, source);
    args.push("-stream_loop", "-1", "-i", source);
  } else if (scene.imageUrl) {
    source = join(dir, `img-${i}.png`);
    await download(scene.imageUrl, source);
    args.push("-loop", "1", "-i", source);
  } else {
    throw new Error(`Plan ${i} : ni clip ni image.`);
  }

  let hasAudio = false;
  if (scene.audioUrl) {
    const audio = join(dir, `voice-${i}.mp3`);
    await download(scene.audioUrl, audio);
    args.push("-i", audio);
    hasAudio = true;
  }

  const chain = [
    opts.squareMask
      ? squareFilter(opts.width, opts.height)
      : `scale=${opts.width}:${opts.height}:force_original_aspect_ratio=increase,crop=${opts.width}:${opts.height}`,
    "fps=30",
  ];
  const words = smoothTimings(scene.words, duration);
  if (words.length) {
    chain.push(drawTextFilters(words, { width: opts.width, height: opts.height, fontFile: FONT_FILE }));
  }
  chain.push("format=yuv420p");

  args.push(
    "-t", String(duration),
    "-filter_complex", `[0:v]${chain.join(",")}[v]`,
    "-map", "[v]",
  );
  if (hasAudio) args.push("-map", "1:a", "-c:a", "aac", "-b:a", "192k");
  args.push(
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "20",
    "-pix_fmt", "yuv420p",
    "-r", "30",
    "-shortest",
    out,
  );

  await run(args);
  return out;
}

export async function renderJob(manifest) {
  const dir = await mkdtemp(join(tmpdir(), "sophia-"));
  try {
    const opts = {
      width: manifest.width ?? 1080,
      height: manifest.height ?? 1920,
      squareMask: Boolean(manifest.squareMask),
    };
    const parts = [];
    for (const scene of [...manifest.scenes].sort((a, b) => a.index - b.index)) {
      parts.push(await renderScene(scene, dir, opts));
    }

    const listPath = join(dir, "list.txt");
    await writeFile(listPath, parts.map((p) => `file '${p}'`).join("\n"));
    const finalPath = join(dir, "final.mp4");
    await run([
      "-y", "-f", "concat", "-safe", "0", "-i", listPath,
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
      "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
      finalPath,
    ]);

    const bytes = await readFile(finalPath);
    const duration = manifest.scenes.reduce((s, sc) => s + (Number(sc.duration) || 0), 0);
    return { bytes, duration };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
