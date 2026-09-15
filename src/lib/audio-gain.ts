/**
 * Mesure de niveau DANS LE NAVIGATEUR, pour remplacer `loudnorm`.
 *
 * `loudnorm` en passe unique bascule en mode dynamique : libavfilter force
 * alors tout le graphe audio à 192 kHz (le seul taux accepté par le mesureur
 * R128), soit un suréchantillonnage ×4,35 de toute la piste, deux fois par
 * langue, dans un ffmpeg WebAssembly mono-thread. C'est ce qui faisait passer
 * un montage de 7 à 20 minutes.
 *
 * Ici on décode l'audio avec l'API Web Audio (quelques millisecondes), on
 * calcule le niveau RMS intégré, et on en déduit un GAIN STATIQUE en dB —
 * une simple multiplication par échantillon côté ffmpeg, à 44,1 kHz, sans
 * rééchantillonnage, sans limiteur et sans pompage de niveau.
 */

/** Niveau RMS visé, commun à toutes les langues (dBFS). */
export const TARGET_VOICE_DBFS = -20;
/** Niveau RMS visé pour une musique avant atténuation (dBFS). */
export const TARGET_MUSIC_DBFS = -20;
/** Correction maximale appliquée, dans les deux sens (dB). */
export const MAX_GAIN_DB = 12;
/** Sous ce niveau, un échantillon est considéré comme du silence. */
const SILENCE_FLOOR = 10 ** (-50 / 20);

async function decode(data: ArrayBuffer): Promise<AudioBuffer | null> {
  if (typeof window === "undefined") return null;
  const Ctx =
    window.OfflineAudioContext ??
    (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext })
      .webkitOfflineAudioContext;
  if (!Ctx) return null;
  const ctx = new Ctx(1, 1, 44100);
  try {
    return await ctx.decodeAudioData(data);
  } catch {
    return null;
  }
}

/** Niveau RMS d'un tampon décodé, silences exclus (dBFS), ou null. */
function rmsDbOf(buffer: AudioBuffer): number | null {
  let sum = 0;
  let count = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    // Un échantillon sur quatre suffit largement pour un niveau intégré.
    for (let i = 0; i < data.length; i += 4) {
      const v = data[i]!;
      const a = v < 0 ? -v : v;
      if (a < SILENCE_FLOOR) continue;
      sum += v * v;
      count++;
    }
  }
  if (count < 100) return null;
  const rms = Math.sqrt(sum / count);
  if (!(rms > 0)) return null;
  return 20 * Math.log10(rms);
}

async function toArrayBuffer(source: Blob | string): Promise<ArrayBuffer | null> {
  try {
    if (typeof source !== "string") return await source.arrayBuffer();
    const res = await fetch(source);
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

function clampGain(db: number) {
  return Math.max(-MAX_GAIN_DB, Math.min(MAX_GAIN_DB, db));
}

/** Gain à appliquer à un fichier pour l'amener au niveau cible (dB). */
export async function measureGainDb(
  source: Blob | string,
  targetDbfs = TARGET_VOICE_DBFS,
): Promise<number | null> {
  const data = await toArrayBuffer(source);
  if (!data) return null;
  const buffer = await decode(data);
  if (!buffer) return null;
  const rms = rmsDbOf(buffer);
  if (rms === null) return null;
  return clampGain(targetDbfs - rms);
}

/**
 * Gain d'une LANGUE entière : mesure intégrée sur toutes les prises de voix,
 * pour que toutes les langues sortent au même niveau perçu.
 */
export async function measureVoiceGainDb(
  sources: (Blob | string | undefined)[],
  targetDbfs = TARGET_VOICE_DBFS,
): Promise<number> {
  let sum = 0;
  let count = 0;
  for (const src of sources) {
    if (!src) continue;
    const data = await toArrayBuffer(src);
    if (!data) continue;
    const buffer = await decode(data);
    if (!buffer) continue;
    const rms = rmsDbOf(buffer);
    if (rms === null) continue;
    // Moyenne d'énergie, pondérée par la durée de la prise.
    const weight = buffer.duration || 1;
    sum += 10 ** (rms / 10) * weight;
    count += weight;
  }
  if (!count) return 0;
  const rms = 10 * Math.log10(sum / count);
  return clampGain(targetDbfs - rms);
}

/** Conversion d'un volume linéaire (0,22) en décibels. */
export function linearToDb(volume: number) {
  return 20 * Math.log10(Math.max(volume, 0.0001));
}
