import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

export type AssembleScene = {
  videoUrl: string;
  audio?: string | undefined;
  /** PNG transparent (texte incrusté) superposé sur toute la durée du plan. */
  overlay?: Blob | null | undefined;
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
  const errs = logLines.filter((l) => /error|invalid|no such|failed|unable/i.test(l));
  return (errs.length ? errs : logLines).slice(-4).join(" | ");
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
    // Le plan est figé sur sa dernière image (tpad) puis coupé à la durée de la voix off,
    // pour que la vidéo fasse toujours exactement la longueur de l'audio.
    const vf = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=24${
      target ? `,tpad=stop_mode=clone:stop_duration=${target.toFixed(2)}` : ""
    }`;

    const args = ["-i", vName];
    if (scene.audio) {
      await ffmpeg.writeFile(`voice${i}.mp3`, await fetchFile(scene.audio));
      args.push("-i", `voice${i}.mp3`);
    } else {
      // Piste silencieuse : toutes les parties doivent avoir exactement les mêmes
      // flux pour que la concaténation en copie fonctionne.
      args.push("-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100");
    }
    args.push(
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-vf",
      vf,
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
    if (target) args.push("-t", target.toFixed(2));
    else args.push("-shortest");
    args.push("-y", out);

    await run(ffmpeg, args, `Scène ${i + 1}`);
    await ffmpeg.deleteFile(vName);
    if (scene.audio) await ffmpeg.deleteFile(`voice${i}.mp3`);
    parts.push(out);
  }

  onProgress?.("Assemblage final", 0.9);
  const list = parts.map((p) => `file '${p}'`).join("\n");
  await ffmpeg.writeFile("list.txt", new TextEncoder().encode(list));
  await run(
    ffmpeg,
    [
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      "list.txt",
      "-c",
      "copy",
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
