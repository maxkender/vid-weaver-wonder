import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import coreURL from "@ffmpeg/core?url";
import wasmURL from "@ffmpeg/core/wasm?url";
import { videoDuration } from "./duration";
import type { CaptionCue } from "./karaoke-overlay";

/** Cadence unique de tout le pipeline (studio ET service de rendu). */
export const OUTPUT_FPS = 30;
/**
 * Étirement maximal d'un clip pour couvrir une voix plus longue.
 * Au-delà, le plan paraît mou et « bizarre » : on préfère le signaler.
 */
const MAX_STRETCH = 1.2;
/**
 * PAS de `loudnorm` ici : en passe unique il bascule en mode dynamique, ce qui
 * force tout le graphe audio à 192 kHz et multipliait par trois la durée du
 * montage. Le niveau est mesuré dans le navigateur (src/lib/audio-gain.ts) et
 * appliqué comme un simple gain statique, plan par plan.
 */

/** Au-delà de cet étirement, on accélère d'abord un peu la voix. */
const STRETCH_BEFORE_TEMPO = 1.25;
/** Accélération maximale de la voix (inaudible à ce niveau). */
const MAX_TEMPO = 1.12;
/** Fondu audio en entrée/sortie de plan : supprime les clics de raccord. */
const AUDIO_FADE = 0.03;

export type AssembleScene = {
  /** Clip animé du plan. Absent → on retombe sur l'image fixe (imageUrl). */
  videoUrl?: string | undefined;
  /** Image fixe de secours si le clip animé n'a pas pu être généré. */
  imageUrl?: string | undefined;
  audio?: string | undefined;

  /** PNG transparent (texte incrusté) superposé sur toute la durée du plan. */
  overlay?: Blob | null | undefined;
  /**
   * Sous-titres : un PNG par mot affiché avec sa fenêtre temporelle.
   * Peut être une fonction pour ne construire les images qu'au moment du plan
   * (évite de garder toutes les scènes en mémoire → crash de l'onglet).
   */
  cues?: CaptionCue[] | null | undefined | (() => Promise<CaptionCue[] | null>);
  /** Masque PNG (carré à coins arrondis) appliqué sous le texte. */
  mask?: Blob | null | undefined;
  /** Durée cible du plan (= durée de la voix off utile), en secondes. */
  duration?: number | undefined;
  /** Début du premier mot dans l'audio (silence de tête à couper). */
  trimStart?: number | undefined;
  /** Fin du dernier mot dans l'audio (silence de queue à couper). */
  trimEnd?: number | undefined;

};



let ffmpegInstance: FFmpeg | null = null;
const logLines: string[] = [];

async function getFFmpeg() {
  if (ffmpegInstance) return ffmpegInstance;
  const ffmpeg = new FFmpeg();
  ffmpeg.on("log", ({ message }) => {
    logLines.push(message);
    if (logLines.length > 400) logLines.shift();
  });
  try {
    await ffmpeg.load({ coreURL, wasmURL });
  } catch (error) {
    ffmpeg.terminate();
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Impossible de charger le moteur d’export vidéo : ${detail}`);
  }
  ffmpegInstance = ffmpeg;
  return ffmpeg;
}

/** Lignes du log qui ressemblent vraiment à une erreur, sinon null. */
function lastErrors(): string | null {
  const errs = logLines.filter((l) =>
    /error|invalid|no such|failed|unable|abort|memory|exit code/i.test(l),
  );
  return errs.length ? errs.slice(-6).join(" | ") : null;
}

/** Repart d'une instance propre : une instance en échec (mémoire saturée) reste inutilisable. */
export function resetFFmpeg() {
  try {
    ffmpegInstance?.terminate();
  } catch {
    /* ignore */
  }
  ffmpegInstance = null;
}

function failure(label: string, detail: string | null) {
  return new Error(
    detail
      ? `${label} : ${detail}`
      : `${label} : ffmpeg s'est arrêté sans message — probablement un manque de mémoire.`,
  );
}

async function run(ffmpeg: FFmpeg, args: string[], label: string) {
  logLines.length = 0;
  let code: number;
  try {
    code = await ffmpeg.exec(args);
  } catch (e) {
    throw failure(label, lastErrors() ?? (e as Error)?.message ?? null);
  }
  if (code !== 0) {
    throw failure(label, lastErrors());
  }
}


/**
 * Assemble every scene (video + optional voiceover) into a single MP4,
 * fully in the browser with ffmpeg.wasm. Optionally mixes a background music track.
 */
async function assembleVideoInner(
  scenes: AssembleScene[],
  opts: {
    width: number;
    height: number;
    music?: Blob | undefined;
    musicVolume?: number | undefined;
    /** Gain statique appliqué à la voix de cette langue (dB), mesuré en amont. */
    voiceGainDb?: number | undefined;
    /** Gain statique du morceau de musique (dB), mesuré une seule fois. */
    musicGainDb?: number | undefined;
    /** Langue du montage, pour nommer la langue dans les avertissements. */
    langLabel?: string | undefined;
    /** Signalé quand un plan doit être ralenti au-delà du plafond. */
    onStretchWarning?: ((message: string) => void) | undefined;
    onProgress?: (step: string, ratio: number) => void;
  },
): Promise<Blob> {
  const {
    width,
    height,
    music,
    musicVolume = 0.22,
    voiceGainDb = 0,
    musicGainDb = 0,
    langLabel,
    onStretchWarning,
    onProgress,
  } = opts;

  const ffmpeg = await getFFmpeg();
  const parts: string[] = [];

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i]!;
    onProgress?.(`Encodage scène ${i + 1}/${scenes.length}`, i / scenes.length);

    // Un plan sans clip animé n'est JAMAIS supprimé : on le rend à partir de
    // son image fixe pour que l'histoire reste complète.
    const stillOnly = !scene.videoUrl;
    const vName = stillOnly ? `in${i}.png` : `in${i}.mp4`;
    const source = scene.videoUrl ?? scene.imageUrl;
    if (!source) throw new Error(`Scène ${i + 1} : ni clip vidéo ni image.`);
    await ffmpeg.writeFile(vName, await fetchFile(source));

    const out = `part${i}.mp4`;

    // --- Calage du plan sur la voix -------------------------------------
    // Cible = fenêtre utile de la voix (silences de tête et de queue retirés).
    // Jamais de gel sur la dernière image, jamais de boucle.
    const tStart = Math.max(0, scene.trimStart ?? 0);
    const tEnd = scene.trimEnd && scene.trimEnd > tStart + 0.3 ? scene.trimEnd : undefined;
    const voiceSpan = tEnd ? tEnd - tStart : undefined;
    const target =
      voiceSpan && voiceSpan > 0.5
        ? voiceSpan
        : scene.duration && scene.duration > 0.5
          ? scene.duration
          : 4;

    const clipLen = stillOnly ? 0 : await videoDuration(scene.videoUrl!);
    if (!stillOnly && !(clipLen > 0.2)) {
      // Durée illisible = clip non chargé. Continuer produirait une dernière
      // image figée en silence : on préfère une erreur explicite.
      throw new Error(
        `Plan ${i + 1}${langLabel ? ` (${langLabel})` : ""} : la durée du clip animé n'a pas pu être lue (fichier introuvable ou illisible). Montage interrompu.`,
      );
    }
    let tempo = 1; // accélération de la voix
    let stretch = 1; // ralentissement du clip
    if (!stillOnly && target > clipLen) {
      const needed = target / clipLen;
      if (needed > STRETCH_BEFORE_TEMPO) {
        // On gagne d'abord un peu sur la voix (inaudible), puis on étire le clip.
        tempo = Math.min(MAX_TEMPO, needed / STRETCH_BEFORE_TEMPO);
      }
      const needTotal = target / tempo / clipLen;
      // Le plafond est RÉELLEMENT appliqué : au-delà de 1,2× l'image devient
      // molle. On ne ralentit pas davantage, on signale le plan et la langue —
      // c'est un défaut de calibrage du script, à corriger en amont.
      stretch = Math.min(MAX_STRETCH, needTotal);
      if (needTotal > MAX_STRETCH + 0.001) {
        onStretchWarning?.(
          `Plan ${i + 1}${langLabel ? ` (${langLabel})` : ""} : la voix dure ${target.toFixed(1)} s pour un clip de ${clipLen.toFixed(1)} s. Il faudrait ralentir ×${needTotal.toFixed(2)}, au-delà du plafond ×${MAX_STRETCH} : le plan est coupé à la durée de l'image. Le texte de ce plan doit être raccourci.`,
        );
      }
    }
    // Durée finale du plan. Jamais d'image figée : quand le plafond d'étirement
    // ne suffit pas, c'est la durée de l'image qui fait foi (la voix doit avoir
    // été condensée en amont).
    const videoSpan = stillOnly ? Infinity : clipLen * stretch;
    const outDur = Math.min(target / tempo, videoSpan);


    const base = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,setsar=1`;
    const vf = stillOnly
      ? // Image fixe : très léger zoom lent pour qu'elle ne paraisse pas figée.
        `scale=${Math.round(width * 1.2)}:${Math.round(height * 1.2)}:force_original_aspect_ratio=decrease,pad=${Math.round(width * 1.2)}:${Math.round(height * 1.2)}:(ow-iw)/2:(oh-ih)/2:black,zoompan=z='min(1+0.00035*on,1.07)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${Math.max(1, Math.ceil(outDur * OUTPUT_FPS))}:s=${width}x${height}:fps=${OUTPUT_FPS},setsar=1,fps=${OUTPUT_FPS}`
      : `${base}${stretch > 1.001 ? `,setpts=PTS*${stretch.toFixed(4)}` : ""},fps=${OUTPUT_FPS}`;

    const args = stillOnly
      ? ["-loop", "1", "-framerate", String(OUTPUT_FPS), "-t", outDur.toFixed(3), "-i", vName]
      : ["-i", vName];

    const hasVoice = Boolean(scene.audio);
    if (scene.audio) {
      await ffmpeg.writeFile(`voice${i}.mp3`, await fetchFile(scene.audio));
      args.push("-i", `voice${i}.mp3`);
    } else {
      args.push("-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100");
    }

    // Audio : coupe UNIQUEMENT aux bornes (jamais au milieu, sinon les
    // timestamps ne collent plus), puis fondus de 30 ms anti-clic.
    const fadeOutAt = Math.max(0, outDur - AUDIO_FADE);
    const fades = `afade=t=in:st=0:d=${AUDIO_FADE},afade=t=out:st=${fadeOutAt.toFixed(3)}:d=${AUDIO_FADE}`;
    const trim = `atrim=start=${tStart.toFixed(3)}${tEnd ? `:end=${tEnd.toFixed(3)}` : ""},asetpts=PTS-STARTPTS`;
    // Gain statique mesuré dans le navigateur : remplace `loudnorm` (qui
    // imposait un rééchantillonnage à 192 kHz de tout le graphe audio).
    const gain = Math.abs(voiceGainDb) > 0.05 ? `,volume=${voiceGainDb.toFixed(2)}dB` : "";
    const af = hasVoice
      ? `[1:a]${trim}${tempo > 1.001 ? `,atempo=${tempo.toFixed(4)}` : ""}${gain},${fades},aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo[a]`
      : `[1:a]atrim=0:${outDur.toFixed(3)},${fades},aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo[a]`;


    const rawCues = scene.cues;
    let cues: CaptionCue[] | null =
      typeof rawCues === "function" ? await rawCues() : (rawCues ?? null);
    // Voix accélérée → les sous-titres de CE plan sont divisés par le même
    // facteur, sinon le texte se décale.
    if (cues && tempo > 1.001) {
      cues = cues.map((c) => ({ blob: c.blob, start: c.start / tempo, end: c.end / tempo }));
    }

    const overlayFiles: string[] = [];
    let nextInput = 2; // 0 = vidéo, 1 = audio
    const chain: string[] = [`[0:v]${vf}[base]`];
    let last = "base";

    // Masque carré à coins arrondis (papier découpé) : appliqué SOUS le texte.
    if (scene.mask) {
      const name = `mask${i}.png`;
      await ffmpeg.writeFile(name, new Uint8Array(await scene.mask.arrayBuffer()));
      overlayFiles.push(name);
      args.push("-i", name);
      const idx = nextInput++;
      chain.push(`[${idx}:v]scale=${width}:${height},format=rgba[mask]`);
      chain.push(`[${last}][mask]overlay=0:0[masked]`);
      last = "masked";
    }

    if (cues && cues.length) {
      // Un PNG par mot affiché, incrusté sur sa seule fenêtre temporelle.
      for (let k = 0; k < cues.length; k++) {
        const cue = cues[k]!;
        const name = `cue${i}_${String(k).padStart(3, "0")}.png`;
        await ffmpeg.writeFile(name, new Uint8Array(await cue.blob.arrayBuffer()));
        overlayFiles.push(name);
        args.push("-i", name);
        const idx = nextInput++;
        chain.push(`[${idx}:v]scale=${width}:${height},format=rgba[c${k}]`);
        const outLabel = `o${k}`;
        chain.push(
          `[${last}][c${k}]overlay=0:0:enable='between(t,${cue.start.toFixed(3)},${cue.end.toFixed(3)})'[${outLabel}]`,
        );
        last = outLabel;
      }
    } else if (scene.overlay) {
      const name = `ov${i}.png`;
      await ffmpeg.writeFile(name, new Uint8Array(await scene.overlay.arrayBuffer()));
      overlayFiles.push(name);
      args.push("-i", name);
      const idx = nextInput++;
      chain.push(`[${idx}:v]scale=${width}:${height},format=rgba[txt]`);
      chain.push(`[${last}][txt]overlay=0:0[txtv]`);
      last = "txtv";
    }

    chain.push(`[${last}]format=yuv420p[v]`);
    args.push("-filter_complex", `${chain.join(";")};${af}`, "-map", "[v]", "-map", "[a]");

    args.push(
      "-r",
      String(OUTPUT_FPS),
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "20",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-ar",
      "44100",
      "-ac",
      "2",
    );
    // La voix pilote la durée finale du plan : coupe nette, sans gel ni boucle.
    args.push("-t", outDur.toFixed(3), "-max_interleave_delta", "0");
    args.push("-y", out);


    await run(ffmpeg, args, `Scène ${i + 1}`);
    await ffmpeg.deleteFile(vName);
    if (scene.audio) await ffmpeg.deleteFile(`voice${i}.mp3`);
    for (const f of overlayFiles) await ffmpeg.deleteFile(f);
    // Libère les PNG de sous-titres de la mémoire JS dès que le plan est encodé.
    cues = null;

    parts.push(out);
  }


  onProgress?.("Assemblage final", 0.9);
  const list = parts.map((p) => `file '${p}'`).join("\n");
  await ffmpeg.writeFile("list.txt", new TextEncoder().encode(list));
  // TOUJOURS ré-encoder : la copie de flux (-c copy) laissait des trous et une
  // dérive audio, les segments n'ayant pas exactement les mêmes bases de temps.
  await run(
    ffmpeg,
    [
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      "list.txt",
      "-vf",
      `fps=${OUTPUT_FPS},scale=${width}:${height},setsar=1,format=yuv420p`,
      // Aucun filtre audio ici : la voix est déjà au bon niveau, plan par plan.

      "-r",
      String(OUTPUT_FPS),
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "20",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-ar",
      "44100",
      "-ac",
      "2",
      "-movflags",
      "+faststart",
      "-y",
      "concat.mp4",
    ],
    "Concaténation",
  );


  let finalName = "concat.mp4";
  if (music) {
    onProgress?.("Ajout de la musique", 0.96);
    await ffmpeg.writeFile("music.mp3", new Uint8Array(await music.arrayBuffer()));
    await run(
      ffmpeg,
      [
        "-i",
        "concat.mp4",
        "-stream_loop",
        "-1",
        "-i",
        "music.mp3",
        "-filter_complex",
        // normalize=0 : sans ça, amix divise chaque entrée par 2 et la voix off
        // perd 6 dB dès qu'une musique est présente. Seule la musique est
        // atténuée, par son propre filtre volume.
        // La musique est elle aussi normalisée (même cible que la voix) AVANT
        // d'être atténuée : elle est donc posée à un niveau fixe sous la voix,
        // et non à un pourcentage d'un signal brut au niveau imprévisible.
        `[1:a]${LOUDNORM},volume=${musicVolume}[bg];[0:a][bg]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[a]`,
        "-map",
        "0:v:0",
        "-map",
        "[a]",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-b:a",
        "160k",
        "-movflags",
        "+faststart",
        "-y",
        "final.mp4",
      ],
      "Mixage musique",
    );
    finalName = "final.mp4";
    await ffmpeg.deleteFile("music.mp3");
  }

  const data = (await ffmpeg.readFile(finalName)) as Uint8Array;
  for (const p of parts) await ffmpeg.deleteFile(p);
  await ffmpeg.deleteFile("list.txt");
  await ffmpeg.deleteFile("concat.mp4");
  if (finalName !== "concat.mp4") await ffmpeg.deleteFile(finalName);

  onProgress?.("Terminé", 1);
  return new Blob([data.slice().buffer as ArrayBuffer], { type: "video/mp4" });
}

/**
 * Enveloppe : en cas d'échec (mémoire saturée notamment), l'instance ffmpeg est
 * détruite pour que la tentative suivante reparte propre au lieu de replanter.
 */
export async function assembleVideo(
  scenes: AssembleScene[],
  opts: Parameters<typeof assembleVideoInner>[1],
): Promise<Blob> {
  try {
    return await assembleVideoInner(scenes, opts);
  } catch (e) {
    resetFFmpeg();
    throw e;
  }
}
