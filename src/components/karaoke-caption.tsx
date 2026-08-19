import { useEffect, useMemo, useRef, useState } from "react";

import { wordTimings } from "@/lib/karaoke-overlay";

type Timing = { word: string; start: number; end: number };

type Props = {
  text: string;
  fallback: string;
  getMedia: () => HTMLMediaElement | null;
  /** Timings exacts (alignement ElevenLabs) si disponibles. */
  words?: Timing[] | undefined;
};

/** Word-by-word caption synced with the scene audio/video (TikTok style). */
export function KaraokeCaption({ text, fallback, getMedia, words }: Props) {
  const [state, setState] = useState<{ word: string; pop: number } | null>(null);
  const frame = useRef<number | null>(null);
  const exact = useMemo(
    () => (words && words.length ? words.filter((w) => w.end > w.start) : null),
    [words],
  );

  useEffect(() => {
    let cached: { duration: number; timings: Timing[] } | null = null;

    const tick = () => {
      const media = getMedia();
      if (!media || media.paused || !media.duration || Number.isNaN(media.duration)) {
        setState(null);
      } else {
        let timings = exact;
        if (!timings) {
          if (!cached || Math.abs(cached.duration - media.duration) > 0.05) {
            cached = { duration: media.duration, timings: wordTimings(text, media.duration) };
          }
          timings = cached.timings;
        }
        const t = media.currentTime;
        const cur = timings.find((w) => t >= w.start && t < w.end) ?? null;
        if (!cur) setState(null);
        else {
          const pop = Math.min(1, Math.max(0, (t - cur.start) / 0.13));
          setState({ word: cur.word, pop });
        }
      }
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [text, getMedia, exact]);

  if (state) {
    const eased = 1 - Math.pow(1 - state.pop, 3);
    const scale = 0.84 + 0.16 * eased + 0.05 * Math.sin(Math.PI * state.pop);
    return (
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6">
        <span
          className="caption-overlay select-none text-center text-4xl uppercase leading-none tracking-tight text-white"
          style={{
            fontFamily: '"Anton", "Arial Narrow", Impact, sans-serif',
            transform: `scale(${scale.toFixed(3)})`,
            transition: "none",
            WebkitTextStroke: "3px #000",
            paintOrder: "stroke fill",
            textShadow: "0 4px 18px rgba(0,0,0,0.55)",
          }}
        >
          {state.word.replace(/[«»"]/g, "").toUpperCase()}
        </span>
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-5">
      <p className="caption-overlay text-2xl leading-tight text-white">{fallback}</p>
    </div>
  );
}
