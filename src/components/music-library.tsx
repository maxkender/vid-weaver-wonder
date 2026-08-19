import { useCallback, useEffect, useState } from "react";
import { Music, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { addTracks, deleteTrack, listTracks, type MusicTrack } from "@/lib/music-store";

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
    refresh();
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

  const activeCount = tracks.filter((t) => t.style === activeStyle).length;

  return (
    <div className="rounded-lg border border-border bg-secondary/30 p-4">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest">
          <Music className="h-3.5 w-3.5" /> Musiques de fond
        </span>
        <span className="text-xs text-muted-foreground">
          {activeCount} pour ce style · {open ? "fermer" : "gérer"}
        </span>
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          <p className="text-xs text-muted-foreground">
            Une musique est piochée au hasard dans la banque du style de narration choisi lors de
            l'assemblage final.
          </p>
          {styles.map((s) => {
            const list = tracks.filter((t) => t.style === s.id);
            return (
              <div key={s.id} className="rounded-lg border border-border/70 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{s.label}</span>
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs uppercase tracking-widest hover:border-primary">
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
