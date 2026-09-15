/**
 * Banque musicale PARTAGÉE : les MP3 vivent dans le stockage du projet
 * (bucket privé `music`) et sont listés dans la table `music_tracks`.
 *
 * Avant, ils dormaient dans l'IndexedDB du navigateur : la banque était donc
 * propre à une machine ET à une adresse, et le service de rendu de nuit
 * n'avait jamais de musique.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const MUSIC_BUCKET = "music";

export type MusicTrackRow = {
  id: string;
  name: string;
  path: string;
  durationSec: number;
  styles: string[];
  /** Gain de normalisation mesuré une seule fois (dB), null si jamais mesuré. */
  gainDb: number | null;
  /** Lien signé de lecture (valable 24 h). */
  url: string;
};


function safeName(name: string) {
  return (
    name
      .normalize("NFKD")
      .replace(/[^A-Za-z0-9._-]/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 80) || "piste.mp3"
  );
}

/** URL d'envoi signée : le navigateur pousse le fichier sans passer par nous. */
export const createMusicUpload = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ name: z.string().min(1).max(200) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { admin } = await import("./jobs/store.server");
    const db = await admin();
    const path = `bank/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName(data.name)}`;
    const { data: res, error } = await db.storage
      .from(MUSIC_BUCKET)
      .createSignedUploadUrl(path, { upsert: true });
    if (error || !res?.token) {
      throw new Error(`Envoi impossible : ${error?.message ?? "URL signée indisponible"}`);
    }
    return { path, token: res.token, bucket: MUSIC_BUCKET };
  });

/** Enregistre le morceau une fois le fichier téléversé. */
export const registerMusicTrack = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        name: z.string().min(1).max(200),
        path: z.string().min(1).max(300),
        durationSec: z.number().min(0).max(3600).default(0),
        styles: z.array(z.string().min(1).max(40)).min(1).max(10),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { admin } = await import("./jobs/store.server");
    const db = await admin();
    const { error } = await db.from("music_tracks").upsert(
      {
        name: data.name.slice(0, 200),
        path: data.path,
        duration_sec: data.durationSec,
        styles: data.styles,
      },
      { onConflict: "path" },
    );
    if (error) throw new Error(`Enregistrement impossible : ${error.message}`);
    return { ok: true };
  });

/** Toute la banque, avec un lien de lecture signé pour chaque morceau. */
export const listMusicTracks = createServerFn({ method: "GET" }).handler(async () => {
  const { admin } = await import("./jobs/store.server");
  const db = await admin();
  const { data, error } = await db
    .from("music_tracks")
    .select("id, name, path, duration_sec, styles")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Lecture de la banque impossible : ${error.message}`);
  const rows = (data ?? []) as {
    id: string;
    name: string;
    path: string;
    duration_sec: number;
    styles: string[] | null;
  }[];
  if (!rows.length) return [] as MusicTrackRow[];
  const { data: signed } = await db.storage
    .from(MUSIC_BUCKET)
    .createSignedUrls(rows.map((r) => r.path), 60 * 60 * 24);
  const urlByPath = new Map((signed ?? []).map((s) => [s.path ?? "", s.signedUrl ?? ""]));
  return rows.map<MusicTrackRow>((r) => ({
    id: r.id,
    name: r.name,
    path: r.path,
    durationSec: Number(r.duration_sec) || 0,
    styles: r.styles ?? [],
    url: urlByPath.get(r.path) ?? "",
  }));
});

/** Supprime le morceau du stockage et de la liste. */
export const deleteMusicTrack = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { admin } = await import("./jobs/store.server");
    const db = await admin();
    const { data: row } = await db
      .from("music_tracks")
      .select("path")
      .eq("id", data.id)
      .maybeSingle();
    const path = (row as { path?: string } | null)?.path;
    if (path) await db.storage.from(MUSIC_BUCKET).remove([path]);
    const { error } = await db.from("music_tracks").delete().eq("id", data.id);
    if (error) throw new Error(`Suppression impossible : ${error.message}`);
    return { ok: true };
  });
