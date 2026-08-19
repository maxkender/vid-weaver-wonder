/** Durée de lecture estimée d'un texte français (≈ 2,6 mots/seconde). */
export function estimateSpeechSeconds(text: string) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return words / 2.6;
}

/** Durée réelle d'un fichier audio (data URL ou URL) en secondes. */
export function audioDuration(src: string): Promise<number> {
  return new Promise((resolve) => {
    const a = new Audio();
    a.preload = "metadata";
    a.onloadedmetadata = () => resolve(Number.isFinite(a.duration) ? a.duration : 0);
    a.onerror = () => resolve(0);
    a.src = src;
  });
}
