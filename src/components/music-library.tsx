import { useCallback, useEffect, useState } from "react";
import { Music, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  addTracks,
  deleteTrack,
  listTracks,
  migrateLocalTracks,
  type MusicTrack,
} from "@/lib/music-store";

export function MusicLibrary({
  styles,
  activeStyle,
}: {
  styles: { id: string; label: string }[];
  activeStyle: string;
}) {
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [open, setOpen] = useState(false);

  const refresh = useCallback(() => {
    listTracks()
      .then(setTracks)
      .catch(() => setTracks([]));
  }, []);

  useEffect(() => {
    // Migration : les MP3 encore dans l'ancienne banque locale du navigateur
    // sont envoyés vers le stockage partagé, puis effacés en local.
    migrateLocalTracks()
      .then((n) => {
        if (n > 0) toast.success(`${n} musique(s) transférée(s) vers le stockage partagé`);
      })
      .catch(() => undefined)
      .finally(refresh);
  }, [refresh]);

  const onUpload = async (styleId: string, files: FileList | null) => {
    if (!files || files.length === 0) return;
    try {
      await addTracks(styleId, Array.from(files));
      refresh();
      toast.success(`${files.length} musique(s) ajoutée(s)`);
    } catch {
      toast.error("Impossible d'enregistrer la musique");
    }
  };

  const activeCount = tracks.filter((t) => t.styles.includes(activeStyle)).length;

  return (
    <div className="rounded-[10px] border border-border p-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span className="inline-flex items-center gap-2 text-xs font-medium">
          <Music className="h-3.5 w-3.5" /> Musiques de fond
        </span>
        <span className="text-xs text-muted-foreground">
          {activeCount} pour ce style · {tracks.length} au total · {open ? "fermer" : "gérer"}
        </span>
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          <p className="text-xs text-muted-foreground">
            Une musique est piochée au hasard dans la banque du style de narration choisi lors de
            l'assemblage final. Les fichiers sont stockés avec le projet : ils sont visibles depuis
            n'importe quel navigateur et utilisables par la génération automatique de nuit.
          </p>
          {styles.map((s) => {
            const list = tracks.filter((t) => t.styles.includes(s.id));
            return (
              <div key={s.id} className="rounded-[10px] border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{s.label}</span>
                  <label className="btn-base btn-ghost cursor-pointer px-2.5 py-1.5 text-xs">
                    <Upload className="h-3.5 w-3.5" /> Ajouter des MP3
                    <input
                      type="file"
                      accept="audio/mpeg,audio/mp3,audio/*"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        void onUpload(s.id, e.target.files);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
                {list.length === 0 ? (
                  <p className="mt-2 text-xs text-muted-foreground">Aucune musique.</p>
                ) : (
                  <ul className="mt-2 space-y-1">
                    {list.map((t) => (
                      <li
                        key={t.id}
                        className="flex items-center justify-between gap-2 rounded bg-background/50 px-2 py-1"
                      >
                        <span className="truncate text-xs">{t.name}</span>
                        <button
                          onClick={async () => {
                            await deleteTrack(t.id);
                            refresh();
                          }}
                          className="text-muted-foreground hover:text-destructive"
                          aria-label={`Supprimer ${t.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
