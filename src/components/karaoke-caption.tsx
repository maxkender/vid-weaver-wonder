import { useEffect, useMemo, useRef, useState } from "react";

import {
  CAPTION_FADE,
  smoothTimings,
  sophiaWindow,
  wordTimings,
} from "@/lib/karaoke-overlay";

import sophiaLogo from "@/assets/sophia-logo.png.asset.json";

type Timing = { word: string; start: number; end: number };

type Props = {
  text: string;
  fallback: string;
  getMedia: () => HTMLMediaElement | null;
  /** Timings exacts (alignement ElevenLabs) si disponibles. */
  words?: Timing[] | undefined;
  /** Affiche le logo Sophia quand la voix prononce « Sophia ». */
  showLogo?: boolean | undefined;
};

/** Word-by-word caption synced with the scene audio/video (TikTok style). */
export function KaraokeCaption({ text, fallback, getMedia, words, showLogo = true }: Props) {
  const [state, setState] = useState<{ word: string; pop: number } | null>(null);
  const [logoPop, setLogoPop] = useState<number | null>(null);
  const frame = useRef<number | null>(null);
  const exact = useMemo(
    () => (words && words.length ? words.filter((w) => w.end > w.start) : null),
    [words],
  );

  useEffect(() => {
    type Group = Timing & { words: Timing[] };
    let cached: { duration: number; timings: Group[] } | null = null;

    const tick = () => {
      const media = getMedia();
      if (!media || media.paused || !media.duration || Number.isNaN(media.duration)) {
        setState(null);
        setLogoPop(null);
      } else {
        if (!cached || Math.abs(cached.duration - media.duration) > 0.05) {
          cached = {
            duration: media.duration,
            timings: smoothTimings(
              exact ?? wordTimings(text, media.duration),
              media.duration,
              Boolean(exact),
            ),
          };
        }
        const timings = cached.timings;
        const t = media.currentTime;
        if (showLogo) {
          const win = sophiaWindow(text, media.duration, exact);
          setLogoPop(
            win && t >= win.start && t <= win.end
              ? Math.min(1, (t - win.start) / 0.35)
              : null,
          );
        }
        const cur = timings.find((w) => t >= w.start && t < w.end) ?? null;
        if (!cur) setState(null);
        else {
          // Fondu doux à l'apparition (pas de zoom).
          const pop = Math.min(1, Math.max(0, (t - cur.start) / CAPTION_FADE));
          setState({ word: cur.word, pop });
        }
      }
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [text, getMedia, exact, showLogo]);

  const logoNode =
    logoPop === null ? null : (
      <img
        src={sophiaLogo.url}
        alt="Logo de l'application Sophia"
        className="pointer-events-none absolute left-1/2 top-[26%] w-[34%] -translate-x-1/2 -translate-y-1/2 rounded-[22%] drop-shadow-[0_8px_20px_rgba(0,0,0,0.5)]"
        style={{
          opacity: Math.min(1, logoPop * 3),
          transform: `translate(-50%,-50%) scale(${(
            0.7 +
            0.3 * (1 - Math.pow(1 - logoPop, 3)) +
            0.06 * Math.sin(Math.PI * Math.min(1, logoPop))
          ).toFixed(3)})`,
        }}
      />
    );

  if (state) {
    return (
      <div
        className="pointer-events-none absolute inset-0 flex items-center justify-center px-6"
        style={{ containerType: "inline-size" }}
      >
        {logoNode}
        <span
          className="max-w-[92%] select-none truncate text-center lowercase tracking-tight text-white"
          style={{
            fontFamily: '"Anton", "Arial Narrow", Impact, sans-serif',
            // Même taille relative que dans l'export MP4 (6,2 % de la largeur).
            fontSize: "6.2cqw",
            lineHeight: 1.08,
            whiteSpace: "nowrap",
            WebkitTextStroke: "0.28cqw #000",
            paintOrder: "stroke fill",
            textShadow: "0 0.28cqw 1.1cqw rgba(0,0,0,0.55)",
            opacity: state.pop,
          }}
        >
          {state.word.replace(/[«»"]/g, "").toLowerCase()}
        </span>
      </div>
    );
  }

  return (
    <>
      {logoNode}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-5">
        <p className="caption-overlay text-2xl leading-tight text-white">{fallback}</p>
      </div>
    </>
  );
}
