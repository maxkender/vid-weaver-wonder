CREATE TABLE public.music_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  path text NOT NULL UNIQUE,
  duration_sec numeric NOT NULL DEFAULT 0,
  styles text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.music_tracks TO service_role;

ALTER TABLE public.music_tracks ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER music_tracks_touch
BEFORE UPDATE ON public.music_tracks
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();