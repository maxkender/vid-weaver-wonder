import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

export type AssembleScene = {
  videoUrl: string;
  audio?: string | undefined;
  /** Durée cible du plan (= durée de la voix off), en secondes. */
  duration?: number | undefined;
};

const CORE_URL = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd";

let ffmpegInstance: FFmpeg | null = null;

async function getFFmpeg(onLog?: (msg: string) => void) {
  if (ffmpegInstance) return ffmpegInstance;
  const ffmpeg = new FFmpeg();
  if (onLog) ffmpeg.on("log", ({ message }) => onLog(message));
  await ffmpeg.load({
    coreURL: await toBlobURL(`${CORE_URL}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${CORE_URL}/ffmpeg-core.wasm`, "application/wasm"),
  });
  ffmpegInstance = ffmpeg;
  return ffmpeg;
}

/**
 * Assemble every scene (video + optional voiceover) into a single MP4,
 * fully in the browser with ffmpeg.wasm.
 */
export async function assembleVideo(
  scenes: AssembleScene[],
  opts: { width: number; height: number; onProgress?: (step: string, ratio: number) => void },
): Promise<Blob> {
  const { width, height, onProgress } = opts;
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
      args.push("-i", `voice${i}.mp3`, "-map", "0:v:0", "-map", "1:a:0");
    } else {
      args.push("-map", "0:v:0", "-map", "0:a:0?");
    }
    args.push(
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
      "-ar",
      "44100",
      "-ac",
      "2",
    );
    if (target) args.push("-t", target.toFixed(2));
    else args.push("-shortest");
    args.push("-y", out);


    await ffmpeg.exec(args);
    await ffmpeg.deleteFile(vName);
    if (scene.audio) await ffmpeg.deleteFile(`voice${i}.mp3`);
    parts.push(out);
  }

  onProgress?.("Assemblage final", 0.95);
  const list = parts.map((p) => `file '${p}'`).join("\n");
  await ffmpeg.writeFile("list.txt", new TextEncoder().encode(list));
  await ffmpeg.exec([
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
    "final.mp4",
  ]);

  const data = (await ffmpeg.readFile("final.mp4")) as Uint8Array;
  for (const p of parts) await ffmpeg.deleteFile(p);
  await ffmpeg.deleteFile("list.txt");
  await ffmpeg.deleteFile("final.mp4");

  onProgress?.("Terminé", 1);
  return new Blob([data.slice().buffer as ArrayBuffer], { type: "video/mp4" });
}
