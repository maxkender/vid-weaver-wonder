import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

export type KaraokeSeqInput = { fps: number; frames: Blob[] };

export type AssembleScene = {
  videoUrl: string;
  audio?: string | undefined;
  /** PNG transparent (texte incrusté) superposé sur toute la durée du plan. */
  overlay?: Blob | null | undefined;
  /**
   * Sous-titres karaoké : séquence d'images à cadence fixe.
   * Peut être une fonction pour ne construire les images qu'au moment du plan
   * (évite de garder toutes les scènes en mémoire → crash de l'onglet).
   */
  karaokeSeq?:
    | KaraokeSeqInput
    | null
    | undefined
    | (() => Promise<KaraokeSeqInput | null>);
  /** Durée cible du plan (= durée de la voix off), en secondes. */
  duration?: number | undefined;
};


const CORE_URL = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd";

let ffmpegInstance: FFmpeg | null = null;
const logLines: string[] = [];

async function getFFmpeg() {
  if (ffmpegInstance) return ffmpegInstance;
  const ffmpeg = new FFmpeg();
  ffmpeg.on("log", ({ message }) => {
    logLines.push(message);
    if (logLines.length > 400) logLines.shift();
  });
  await ffmpeg.load({
    coreURL: await toBlobURL(`${CORE_URL}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${CORE_URL}/ffmpeg-core.wasm`, "application/wasm"),
  });
  ffmpegInstance = ffmpeg;
  return ffmpeg;
}

function lastErrors() {
  const errs = logLines.filter((l) =>
    /error|invalid|no such|failed|unable|abort|memory|exit code/i.test(l),
  );
  return (errs.length ? errs : logLines).slice(-8).join(" | ");
}

async function run(ffmpeg: FFmpeg, args: string[], label: string) {
  logLines.length = 0;
  const code = await ffmpeg.exec(args);
  if (code !== 0) throw new Error(`${label} : ${lastErrors() || `ffmpeg code ${code}`}`);
}

/**
 * Assemble every scene (video + optional voiceover) into a single MP4,
 * fully in the browser with ffmpeg.wasm. Optionally mixes a background music track.
 */
export async function assembleVideo(
  scenes: AssembleScene[],
  opts: {
    width: number;
    height: number;
    music?: Blob | undefined;
    musicVolume?: number | undefined;
    onProgress?: (step: string, ratio: number) => void;
  },
): Promise<Blob> {
  const { width, height, music, musicVolume = 0.14, onProgress } = opts;
  const ffmpeg = await getFFmpeg();
  const parts: string[] = [];

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i]!;
    onProgress?.(`Encodage scène ${i + 1}/${scenes.length}`, i / scenes.length);

    const vName = `in${i}.mp4`;
    await ffmpeg.writeFile(vName, await fetchFile(scene.videoUrl));

    const out = `part${i}.mp4`;
    const target = scene.duration && scene.duration > 0.5 ? scene.duration : undefined;
    // Le plan est figé sur sa dernière image (tpad) : la coupe finale est ensuite
    // pilotée par la voix off (-shortest), pour que la vidéo se termine EXACTEMENT
    // quand la voix se tait (pas de trou, pas de plan qui traîne).
    const padDur = (target ?? 20) + 5;
    const vf = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=24,tpad=stop_mode=clone:stop_duration=${padDur.toFixed(
      2,
    )}`;

    const args = ["-i", vName];
    const hasVoice = Boolean(scene.audio);
    if (scene.audio) {
      await ffmpeg.writeFile(`voice${i}.mp3`, await fetchFile(scene.audio));
      args.push("-i", `voice${i}.mp3`);
    } else {
      // Pas de voix : piste silencieuse de la durée du plan (flux identiques
      // pour que la concaténation en copie fonctionne).
      args.push("-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100");
    }

    // On enlève le silence de fin de la voix puis on laisse une petite respiration
    // de 0,25 s : la fin du plan colle au dernier mot prononcé.
    const af = hasVoice
      ? `[1:a]silenceremove=stop_periods=-1:stop_duration=0.3:stop_threshold=-45dB,apad=pad_dur=0.25,aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo[a]`
      : `[1:a]atrim=0:${(target ?? 8).toFixed(2)},aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo[a]`;

    const seq = scene.karaokeSeq ?? null;
    const overlayFiles: string[] = [];

    if (seq && seq.frames.length) {
      // Une séquence d'images à cadence fixe : FFmpeg la lit comme une vidéo,
      // c'est bien plus robuste (et léger) qu'un overlay par mot.
      // Les images commencent à l'index 0 -> -start_number 0 est obligatoire.
      for (let k = 0; k < seq.frames.length; k++) {
        const name = `kw${i}_${String(k).padStart(4, "0")}.png`;
        await ffmpeg.writeFile(name, new Uint8Array(await seq.frames[k]!.arrayBuffer()));
        overlayFiles.push(name);
      }
      args.push(
        "-framerate",
        String(seq.fps),
        "-start_number",
        "0",
        "-i",
        `kw${i}_%04d.png`,
      );
      args.push(
        "-filter_complex",
        `[0:v]${vf}[base];[2:v]fps=24,scale=${width}:${height},format=rgba[txt];[base][txt]overlay=0:0:shortest=0[v];${af}`,
        "-map",
        "[v]",
        "-map",
        "[a]",
      );
    } else if (scene.overlay) {
      const name = `ov${i}.png`;
      await ffmpeg.writeFile(name, new Uint8Array(await scene.overlay.arrayBuffer()));
      overlayFiles.push(name);
      args.push("-i", name);
      args.push(
        "-filter_complex",
        `[0:v]${vf}[base];[2:v]scale=${width}:${height}[txt];[base][txt]overlay=0:0[v];${af}`,
        "-map",
        "[v]",
        "-map",
        "[a]",
      );
    } else {
      args.push(
        "-filter_complex",
        `[0:v]${vf}[v];${af}`,
        "-map",
        "[v]",
        "-map",
        "[a]",
      );
    }

    args.push(
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
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
    // La voix pilote la durée finale du plan.
    args.push("-shortest", "-fflags", "+shortest", "-max_interleave_delta", "0");
    args.push("-y", out);


    await run(ffmpeg, args, `Scène ${i + 1}`);
    await ffmpeg.deleteFile(vName);
    if (scene.audio) await ffmpeg.deleteFile(`voice${i}.mp3`);
    for (const f of overlayFiles) await ffmpeg.deleteFile(f);

    parts.push(out);
  }

  onProgress?.("Assemblage final", 0.9);
  const list = parts.map((p) => `file '${p}'`).join("\n");
  await ffmpeg.writeFile("list.txt", new TextEncoder().encode(list));
  const concatArgs = (copy: boolean) => [
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    "list.txt",
    ...(copy
      ? ["-c", "copy"]
      : [
          "-c:v",
          "libx264",
          "-preset",
          "ultrafast",
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
        ]),
    "-movflags",
    "+faststart",
    "-y",
    "concat.mp4",
  ];
  try {
    await run(ffmpeg, concatArgs(true), "Concaténation");
  } catch {
    // Repli : ré-encodage complet si la copie de flux échoue.
    await run(ffmpeg, concatArgs(false), "Concaténation");
  }


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
        `[1:a]volume=${musicVolume}[bg];[0:a][bg]amix=inputs=2:duration=first:dropout_transition=0[a]`,
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
