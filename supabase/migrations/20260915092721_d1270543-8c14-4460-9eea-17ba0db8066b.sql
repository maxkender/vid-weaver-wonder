CREATE TABLE public.voice_rates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  voice_id text NOT NULL,
  language text NOT NULL,
  takes integer NOT NULL DEFAULT 0,
  chars bigint NOT NULL DEFAULT 0,
  seconds numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (voice_id, language)
);

GRANT ALL ON public.voice_rates TO service_role;

ALTER TABLE public.voice_rates ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER voice_rates_touch
  BEFORE UPDATE ON public.voice_rates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();