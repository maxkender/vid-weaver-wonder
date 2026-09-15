/**
 * Banque de musiques de fond, stockée DANS LE PROJET (bucket `music` +
 * table `music_tracks`) et donc visible depuis n'importe quel navigateur,
 * n'importe quelle adresse, et utilisable par le service de rendu de nuit.
 *
 * L'ancienne banque IndexedDB est migrée automatiquement au premier chargement.
 */
import {
  createMusicUpload,
  deleteMusicTrack,
  listMusicTracks,
  registerMusicTrack,
  setMusicTrackGain,
  type MusicTrackRow,
} from "./music.functions";
import { TARGET_MUSIC_DBFS, measureGainDb } from "./audio-gain";

export type MusicTrack = {
  id: string;
  /** Styles de narration auxquels le morceau s'applique. */
  styles: string[];
  name: string;
  path: string;
  url: string;
  durationSec: number;
  /** Gain de normalisation mesuré une seule fois (dB). */
  gainDb: number | null;
};

function toTrack(r: MusicTrackRow): MusicTrack {
  return {
    id: r.id,
    styles: r.styles,
    name: r.name,
    path: r.path,
    url: r.url,
    durationSec: r.durationSec,
    gainDb: r.gainDb,
  };
}

/** Durée d'un fichier audio local, pour l'afficher dans la liste. */
function fileDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve(0);
    const url = URL.createObjectURL(file);
    const a = new Audio();
    a.preload = "metadata";
    a.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(a.duration) ? a.duration : 0);
    };
    a.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(0);
    };
    a.src = url;
  });
}

/** Envoie un fichier vers le stockage partagé puis l'enregistre. */
async function uploadTrack(style: string, file: File, durationSec: number) {
  const { path, token, bucket } = (await createMusicUpload({
    data: { name: file.name },
  })) as { path: string; token: string; bucket: string };
  const { supabase } = await import("@/integrations/supabase/client");
  const { error } = await supabase.storage
    .from(bucket)
    .uploadToSignedUrl(path, token, file, { contentType: file.type || "audio/mpeg" });
  if (error) throw new Error(error.message);
  // Niveau mesuré UNE SEULE FOIS, à l'ajout : plus aucune normalisation
  // au montage, donc plus de passe ffmpeg coûteuse par langue.
  const gainDb = await measureGainDb(file, TARGET_MUSIC_DBFS);
  await registerMusicTrack({
    data: { name: file.name, path, durationSec, styles: [style], gainDb },
  });
}

export async function addTracks(style: string, files: File[]): Promise<void> {
  for (const file of files) {
    await uploadTrack(style, file, await fileDuration(file));
  }
}


export async function listTracks(): Promise<MusicTrack[]> {
  const rows = (await listMusicTracks()) as MusicTrackRow[];
  return rows.map(toTrack);
}

export async function deleteTrack(id: string): Promise<void> {
  await deleteMusicTrack({ data: { id } });
}

/** Le morceau, téléchargé, prêt à être mixé par le moteur de montage. */
export async function fetchTrackBlob(track: MusicTrack): Promise<Blob | null> {
  if (!track.url) return null;
  try {
    const res = await fetch(track.url);
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  }
}

/**
 * Pioche une musique au hasard : d'abord parmi celles du style demandé,
 * sinon dans TOUTE la banque (mieux vaut une musique que pas de musique).
 */
export async function randomTrack(
  style: string,
): Promise<(MusicTrack & { blob: Blob | null }) | null> {
  const all = await listTracks();
  const pool = all.filter((t) => t.styles.includes(style));
  const source = pool.length > 0 ? pool : all;
  if (source.length === 0) return null;
  const pick = source[Math.floor(Math.random() * source.length)]!;
  return { ...pick, blob: await fetchTrackBlob(pick) };
}

/** Nombre de musiques du style demandé et nombre total, pour l'affichage. */
export async function countTracks(style: string): Promise<{ forStyle: number; total: number }> {
  const all = await listTracks();
  return { forStyle: all.filter((t) => t.styles.includes(style)).length, total: all.length };
}

// ---------- Migration de l'ancienne banque locale (IndexedDB) ----------

const LEGACY_DB = "studio-music";
const LEGACY_STORE = "tracks";
type LegacyTrack = { id: string; style: string; name: string; blob: Blob };

function openLegacy(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    const req = indexedDB.open(LEGACY_DB, 1);
    req.onupgradeneeded = () => {
      // Base absente : rien à migrer, on ne crée pas de nouveau magasin.
      try {
        req.transaction?.abort();
      } catch {
        /* ignore */
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

/**
 * Envoie vers le stockage partagé les morceaux encore présents en local,
 * puis efface l'entrée locale. Retourne le nombre de morceaux migrés.
 */
export async function migrateLocalTracks(): Promise<number> {
  const db = await openLegacy();
  if (!db) return 0;
  if (!db.objectStoreNames.contains(LEGACY_STORE)) {
    db.close();
    return 0;
  }
  const items = await new Promise<LegacyTrack[]>((resolve) => {
    try {
      const t = db.transaction(LEGACY_STORE, "readonly");
      const req = t.objectStore(LEGACY_STORE).getAll() as IDBRequest<LegacyTrack[]>;
      req.onsuccess = () => resolve(req.result ?? []);
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
  let migrated = 0;
  for (const item of items) {
    if (!item?.blob) continue;
    try {
      const file = new File([item.blob], item.name || "musique.mp3", {
        type: item.blob.type || "audio/mpeg",
      });
      await uploadTrack(item.style || "revelation", file, await fileDuration(file));
      await new Promise<void>((resolve) => {
        const t = db.transaction(LEGACY_STORE, "readwrite");
        const req = t.objectStore(LEGACY_STORE).delete(item.id);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
      });
      migrated++;
    } catch {
      // On réessaiera au prochain chargement : rien n'est perdu.
    }
  }
  db.close();
  return migrated;
}
