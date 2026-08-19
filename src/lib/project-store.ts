/** Sauvegarde locale des médias d'un projet (images, vidéos, voix) pour l'historique. */

export type StoredSceneMedia = {
  image?: string | undefined;
  videoId?: string | undefined;
  videoUrl?: string | undefined;
  audio?: string | undefined;
};

export type StoredProject = {
  id: string;
  updatedAt: number;
  scenes: Record<number, StoredSceneMedia>;
};

const DB_NAME = "studio-projects";
const STORE = "media";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
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

/** Enregistre (remplace) les médias d'un projet. */
export async function saveProjectMedia(
  id: string,
  scenes: Record<number, StoredSceneMedia>,
): Promise<void> {
  const clean: Record<number, StoredSceneMedia> = {};
  for (const [k, v] of Object.entries(scenes)) {
    const entry: StoredSceneMedia = {};
    if (v.image) entry.image = v.image;
    if (v.videoId) entry.videoId = v.videoId;
    if (v.videoUrl) entry.videoUrl = v.videoUrl;
    if (v.audio) entry.audio = v.audio;
    if (Object.keys(entry).length) clean[Number(k)] = entry;
  }
  const project: StoredProject = { id, updatedAt: Date.now(), scenes: clean };
  try {
    await tx("readwrite", (s) => s.put(project) as unknown as IDBRequest<undefined>);
  } catch {
    /* quota / mode privé : on ignore */
  }
}

export async function loadProjectMedia(
  id: string,
): Promise<Record<number, StoredSceneMedia>> {
  try {
    const p = await tx<StoredProject | undefined>(
      "readonly",
      (s) => s.get(id) as IDBRequest<StoredProject | undefined>,
    );
    return p?.scenes ?? {};
  } catch {
    return {};
  }
}

export async function deleteProjectMedia(id: string): Promise<void> {
  try {
    await tx("readwrite", (s) => s.delete(id) as unknown as IDBRequest<undefined>);
  } catch {
    /* ignore */
  }
}
