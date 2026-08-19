import { useEffect, useRef, useState } from "react";

type Props = {
  text: string;
  fallback: string;
  getMedia: () => HTMLMediaElement | null;
};

/** Word-by-word caption synced with the scene audio/video (TikTok style). */
export function KaraokeCaption({ text, fallback, getMedia }: Props) {
  const [word, setWord] = useState<string | null>(null);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const words = text.split(/\s+/).filter(Boolean);
    const weights = words.map((w) => w.length + 2);
    const total = weights.reduce((a, b) => a + b, 0);
    const bounds: number[] = [];
    let acc = 0;
    for (const w of weights) {
      acc += w;
      bounds.push(acc / total);
    }

    const tick = () => {
      const media = getMedia();
      if (!media || media.paused || !media.duration || Number.isNaN(media.duration)) {
        setWord(null);
      } else {
        const ratio = Math.min(0.9999, media.currentTime / media.duration);
        const i = bounds.findIndex((b) => ratio < b);
        setWord(words[i === -1 ? words.length - 1 : i] ?? null);
      }
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [text, getMedia]);

  if (word) {
    return (
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6">
        <span
          key={word}
          className="caption-overlay animate-in fade-in zoom-in-95 duration-150 text-center text-3xl font-black uppercase tracking-tight text-white drop-shadow-[0_3px_10px_rgba(0,0,0,0.9)]"
        >
          {word}
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
