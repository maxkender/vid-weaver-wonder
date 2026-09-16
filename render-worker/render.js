/**
 * Assemblage ffmpeg, calqué sur le montage navigateur (src/lib/assemble-video.ts).
 *
 * Un plan = clip animé (ou image fixe avec léger zoom si le clip a échoué)
 * + voix off calée + sous-titres mot par mot + masque carré, puis concaténation
 * toujours ré-encodée.
 *
 * Aucune boucle vidéo (`-stream_loop`) et aucun gel : quand la voix dépasse le
 * clip, on étire le clip et on accélère très légèrement la voix.
 */
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildAss, shiftTimings, smoothTimings, voiceWindow } from "./captions.js";
import { buildMaskPng } from "./mask.js";

const FONT_FILE = process.env.CAPTION_FONT_FILE ?? "/usr/share/fonts/truetype/poppins/Poppins-ExtraBold.ttf";
const FONT_NAME = process.env.CAPTION_FONT_NAME ?? "Poppins";

/** Constantes strictement identiques à src/lib/assemble-video.ts. */
export const OUTPUT_FPS = 30;
const MAX_STRETCH = 1.2;
const STRETCH_BEFORE_TEMPO = 1.25;
const MAX_TEMPO = 1.12;
const AUDIO_FADE = 0.03;

function run(args, cwd) {
  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", ...args], { cwd });
    let err = "";
    p.stderr.on("data", (d) => (err += d.toString().slice(0, 4000)));
    p.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg (${code}) : ${err.slice(0, 1500)}`)),
    );
  });
}

/** Durée d'un média, via ffprobe. */
function probeDuration(path, cwd) {
  return new Promise((resolve) => {
    const p = spawn(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
      { cwd },
    );
    let out = "";
    p.stdout.on("data", (d) => (out += d.toString()));
    p.on("close", () => resolve(Number.parseFloat(out.trim()) || 0));
    p.on("error", () => resolve(0));
  });
}

async function download(url, path) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Téléchargement impossible (${res.status})`);
  await writeFile(path, Buffer.from(await res.arrayBuffer()));
}

/** Rend un plan : vidéo (ou image animée d'un lent zoom) + voix + sous-titres. */
async function renderScene(scene, dir, opts) {
  const i = scene.index;
  const out = `part-${i}.mp4`;
  const args = [];

  // Un plan a TOUJOURS de l'image : clip animé si disponible et lisible,
  // sinon image fixe. On télécharge l'image dès qu'elle existe, pour pouvoir
  // basculer dessus si le clip est illisible (clip raté, fichier tronqué).
  let imageName = null;
  if (scene.imageUrl) {
    imageName = `img-${i}.png`;
    await download(scene.imageUrl, join(dir, imageName));
  }
  let clipName = null;
  let clipLen = 0;
  if (scene.videoUrl) {
    clipName = `clip-${i}.mp4`;
    await download(scene.videoUrl, join(dir, clipName));
    clipLen = await probeDuration(clipName, dir);
    if (!(clipLen > 0.2)) {
      // Durée illisible : le clip ne peut pas porter le plan. On repasse sur
      // l'image fixe plutôt que de livrer du noir.
      if (!imageName) {
        throw new Error(`Plan ${i + 1} : clip animé illisible et aucune image de secours.`);
      }
      clipName = null;
      clipLen = 0;
    }
  }
  const stillOnly = !clipName;
  if (stillOnly && !imageName) throw new Error(`Plan ${i + 1} : ni clip ni image.`);
  const sourceName = stillOnly ? imageName : clipName;

  const hasVoice = Boolean(scene.audioUrl);
  let audioName = null;
  let audioLen = 0;
  if (hasVoice) {
    audioName = `voice-${i}.mp3`;
    await download(scene.audioUrl, join(dir, audioName));
    audioLen = await probeDuration(audioName, dir);
  }

  // --- Calage du plan sur la voix ---------------------------------------
  // Cible = fenêtre utile de la voix off (silences de tête/queue retirés).
  const rawWords = (scene.words ?? []).filter((w) => w?.word && w.end > w.start);
  const declared = Math.max(0.8, Number(scene.duration) || audioLen || 4);
  const win = hasVoice ? voiceWindow(rawWords, audioLen || declared) : { start: 0, end: declared };
  const tStart = Math.max(0, win.start);
  const tEnd = win.end > tStart + 0.3 ? win.end : undefined;
  const voiceSpan = tEnd ? tEnd - tStart : undefined;
  const target = voiceSpan && voiceSpan > 0.5 ? voiceSpan : declared;

  let tempo = 1; // accélération de la voix
  let stretch = 1; // ralentissement du clip
  if (!stillOnly && target > clipLen) {
    const needed = target / clipLen;
    if (needed > STRETCH_BEFORE_TEMPO) {
      tempo = Math.min(MAX_TEMPO, needed / STRETCH_BEFORE_TEMPO);
    }
    stretch = Math.min(MAX_STRETCH, target / tempo / clipLen);
  }
  // LA VOIX COMMANDE : la durée du plan est celle dont la voix a besoin, sans
  // jamais être plafonnée par la piste vidéo (jamais de phrase coupée).
  // Si le clip s'arrête avant, `tpad` clone la dernière image pour couvrir
  // l'écart — mieux vaut une image figée qu'un mot perdu.
  const outDur = target / tempo;

  const { width, height } = opts;
  if (stillOnly) {
    args.push("-loop", "1", "-framerate", String(OUTPUT_FPS), "-t", outDur.toFixed(3), "-i", sourceName);
  } else {
    args.push("-i", sourceName);
  }
  if (hasVoice) args.push("-i", audioName);
  else args.push("-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100");

  const big = { w: Math.round(width * 1.2), h: Math.round(height * 1.2) };
  const base = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,setsar=1`;
  // Filet de sécurité commun : `tpad` clone la dernière image si, malgré tout,
  // la piste vidéo s'arrêtait avant la fin du plan. Jamais de noir.
  const pad = `,tpad=stop_mode=clone:stop_duration=2,trim=0:${outDur.toFixed(3)},setpts=PTS-STARTPTS`;
  const vf = stillOnly
    ? // Image fixe : très léger zoom lent, jamais parfaitement immobile.
      `scale=${big.w}:${big.h}:force_original_aspect_ratio=decrease,pad=${big.w}:${big.h}:(ow-iw)/2:(oh-ih)/2:black,` +
      `zoompan=z='min(1+0.00035*on,1.07)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':` +
      `d=${Math.max(1, Math.ceil(outDur * OUTPUT_FPS))}:s=${width}x${height}:fps=${OUTPUT_FPS},setsar=1,fps=${OUTPUT_FPS}${pad}`
    : `${base}${stretch > 1.001 ? `,setpts=PTS*${stretch.toFixed(4)}` : ""},fps=${OUTPUT_FPS}${pad}`;

  const chain = [`[0:v]${vf}[base]`];
  let last = "base";
  let nextInput = 2;

  if (opts.squareMask) {
    args.push("-i", opts.maskName);
    const idx = nextInput++;
    chain.push(`[${idx}:v]scale=${width}:${height},format=rgba[mask]`);
    chain.push(`[${last}][mask]overlay=0:0[masked]`);
    last = "masked";
  }

  // Sous-titres : timings recalés sur l'audio rogné, puis divisés par le
  // facteur d'accélération de la voix pour ce plan.
  let groups = smoothTimings(shiftTimings(rawWords, tStart), outDur * tempo);
  if (tempo > 1.001) {
    groups = groups.map((g) => ({ word: g.word, start: g.start / tempo, end: g.end / tempo }));
  }
  const ass = buildAss(groups, { width, height, fontName: FONT_NAME });
  if (ass) {
    const assName = `subs-${i}.ass`;
    await writeFile(join(dir, assName), ass, "utf8");
    chain.push(`[${last}]subtitles=${assName}:fontsdir=/usr/share/fonts[subbed]`);
    last = "subbed";
  }
  chain.push(`[${last}]format=yuv420p[v]`);

  // Audio : coupe uniquement aux bornes (jamais au milieu), fondus anti-clic.
  const fadeOutAt = Math.max(0, outDur - AUDIO_FADE);
  const fades = `afade=t=in:st=0:d=${AUDIO_FADE},afade=t=out:st=${fadeOutAt.toFixed(3)}:d=${AUDIO_FADE}`;
  const trim = `atrim=start=${tStart.toFixed(3)}${tEnd ? `:end=${tEnd.toFixed(3)}` : ""},asetpts=PTS-STARTPTS`;
  const af = hasVoice
    ? `[1:a]${trim}${tempo > 1.001 ? `,atempo=${tempo.toFixed(4)}` : ""},${fades},aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo[a]`
    : `[1:a]atrim=0:${outDur.toFixed(3)},${fades},aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo[a]`;

  args.push(
    "-filter_complex", `${chain.join(";")};${af}`,
    "-map", "[v]",
    "-map", "[a]",
    "-r", String(OUTPUT_FPS),
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "20",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", "128k",
    "-ar", "44100",
    "-ac", "2",
    "-t", outDur.toFixed(3),
    "-max_interleave_delta", "0",
    "-y", out,
  );

  await run(args, dir);

  // CONTRÔLE DE SORTIE : mieux vaut un rendu en échec qu'une vidéo à moitié
  // noire livrée en silence. La piste vidéo doit couvrir toute la durée du plan.
  const madeDur = await probeDuration(out, dir);
  if (!(madeDur >= outDur - 0.15)) {
    throw new Error(
      `Plan ${i + 1} : la piste vidéo ne dure que ${madeDur.toFixed(2)} s pour une voix de ${outDur.toFixed(2)} s — rendu interrompu pour éviter une vidéo noire.`,
    );
  }
  return { name: out, duration: outDur };
}

export async function renderJob(manifest) {
  const dir = await mkdtemp(join(tmpdir(), "sophia-"));
  try {
    const width = manifest.width ?? 1080;
    const height = manifest.height ?? 1920;
    const squareMask = Boolean(manifest.squareMask);
    const maskName = "mask.png";
    if (squareMask) await writeFile(join(dir, maskName), buildMaskPng(width, height));
    const opts = { width, height, squareMask, maskName };

    const parts = [];
    let duration = 0;
    for (const scene of [...manifest.scenes].sort((a, b) => a.index - b.index)) {
      const part = await renderScene(scene, dir, opts);
      parts.push(part.name);
      duration += part.duration;
    }

    await writeFile(join(dir, "list.txt"), parts.map((p) => `file '${p}'`).join("\n"));
    // TOUJOURS ré-encoder : la copie de flux laisse des trous et une dérive audio.
    await run(
      [
        "-f", "concat", "-safe", "0", "-i", "list.txt",
        "-vf", `fps=${OUTPUT_FPS},scale=${width}:${height},setsar=1,format=yuv420p`,
        // Normalisation de sonie de la voix : toutes les langues au même niveau
        // perçu, pour que la musique soit toujours posée pareil en dessous.
        "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
        "-r", String(OUTPUT_FPS),
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2",
        "-movflags", "+faststart",
        "-y", "concat.mp4",
      ],
      dir,
    );

    let finalName = "concat.mp4";
    if (manifest.musicUrl) {
      await download(manifest.musicUrl, join(dir, "music.mp3"));
      const volume = Number(manifest.musicVolume) > 0 ? Number(manifest.musicVolume) : 0.22;
      // Même réglage que le studio : gain du morceau mesuré une fois dans la
      // banque musicale, puis atténuation à 0,22. Sans gain connu, on
      // normalise le morceau comme avant.
      const gainDb = Number(manifest.musicGainDb);
      const level = Number.isFinite(gainDb)
        ? `volume=${(gainDb + 20 * Math.log10(volume)).toFixed(2)}dB`
        : `loudnorm=I=-16:TP=-1.5:LRA=11,volume=${volume}`;
      await run(
        [
          "-i", "concat.mp4",
          "-stream_loop", "-1", "-i", "music.mp3",
          // normalize=0 : sans ça, amix divise chaque entrée par 2 et la voix
          // off perd 6 dB. Seule la musique est atténuée, par son propre volume.
          "-filter_complex",
          `[1:a]${level}[bg];[0:a][bg]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[a]`,
          "-map", "0:v:0", "-map", "[a]",
          "-c:v", "copy", "-c:a", "aac", "-b:a", "160k",
          "-movflags", "+faststart",
          "-y", "final.mp4",
        ],
        dir,
      );
      finalName = "final.mp4";
    }

    const bytes = await readFile(join(dir, finalName));
    return { bytes, duration };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export { FONT_FILE };
