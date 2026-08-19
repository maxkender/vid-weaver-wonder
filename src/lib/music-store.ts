/** Banque de musiques de fond (mp3) stockée localement par style de narration. */

export type MusicTrack = {
  id: string;
  style: string;
  name: string;
  blob: Blob;
  createdAt: number;
};

const DB_NAME = "studio-music";
const STORE = "tracks";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("style", "style", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      }),
  );
}

export async function addTracks(style: string, files: File[]): Promise<void> {
  for (const file of files) {
    const track: MusicTrack = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      style,
      name: file.name,
      blob: file,
      createdAt: Date.now(),
    };
    await tx("readwrite", (s) => s.add(track));
  }
}

export async function listTracks(): Promise<MusicTrack[]> {
  const all = await tx<MusicTrack[]>("readonly", (s) => s.getAll() as IDBRequest<MusicTrack[]>);
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteTrack(id: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(id) as unknown as IDBRequest<undefined>);
}

/** Pioche une musique au hasard parmi celles du style demandé. */
export async function randomTrack(style: string): Promise<MusicTrack | null> {
  const all = await listTracks();
  const pool = all.filter((t) => t.style === style);
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)]!;
}
