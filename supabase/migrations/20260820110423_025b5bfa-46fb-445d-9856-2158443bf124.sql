-- Clients d'API (l'OS marketing)
CREATE TABLE public.api_clients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  webhook_secret TEXT NOT NULL,
  daily_quota INTEGER NOT NULL DEFAULT 50,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.api_clients TO service_role;
ALTER TABLE public.api_clients ENABLE ROW LEVEL SECURITY;

-- File d'attente de production
CREATE TABLE public.render_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES public.api_clients(id) ON DELETE SET NULL,
  poster_id TEXT,
  language TEXT NOT NULL DEFAULT 'fr',
  narration_style TEXT NOT NULL DEFAULT 'revelation',
  topic_category TEXT NOT NULL DEFAULT 'aleatoire',
  visual_style TEXT NOT NULL DEFAULT 'papercraft',
  duration_sec INTEGER NOT NULL DEFAULT 45,
  voice_id TEXT,
  voice_engine TEXT NOT NULL DEFAULT 'elevenlabs',
  topic TEXT,
  callback_url TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  step TEXT NOT NULL DEFAULT 'queued',
  progress NUMERIC NOT NULL DEFAULT 0,
  script JSONB,
  scenes JSONB NOT NULL DEFAULT '[]'::jsonb,
  video_path TEXT,
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  lease_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX render_jobs_pending_idx ON public.render_jobs (status, created_at);
CREATE INDEX render_jobs_client_idx ON public.render_jobs (client_id, created_at DESC);
GRANT ALL ON public.render_jobs TO service_role;
ALTER TABLE public.render_jobs ENABLE ROW LEVEL SECURITY;

-- Journal par étape
CREATE TABLE public.job_events (
  id BIGSERIAL PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.render_jobs(id) ON DELETE CASCADE,
  level TEXT NOT NULL DEFAULT 'info',
  step TEXT NOT NULL,
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX job_events_job_idx ON public.job_events (job_id, created_at);
GRANT ALL ON public.job_events TO service_role;
ALTER TABLE public.job_events ENABLE ROW LEVEL SECURITY;

-- Interrupteur global (coupe-circuit crédits IA)
CREATE TABLE public.job_control (
  id INTEGER PRIMARY KEY DEFAULT 1,
  paused BOOLEAN NOT NULL DEFAULT false,
  paused_reason TEXT,
  paused_at TIMESTAMPTZ,
  CONSTRAINT job_control_singleton CHECK (id = 1)
);
INSERT INTO public.job_control (id, paused) VALUES (1, false);
GRANT ALL ON public.job_control TO service_role;
ALTER TABLE public.job_control ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$
LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER render_jobs_touch BEFORE UPDATE ON public.render_jobs
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Verrou : réclame UN job libre à la fois
CREATE OR REPLACE FUNCTION public.claim_render_job(lease_seconds INTEGER DEFAULT 300)
RETURNS SETOF public.render_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.render_jobs j
  SET lease_until = now() + make_interval(secs => lease_seconds),
      attempts = j.attempts + 1
  WHERE j.id = (
    SELECT id FROM public.render_jobs
    WHERE status NOT IN ('done', 'failed', 'cancelled')
      AND (lease_until IS NULL OR lease_until < now())
    ORDER BY created_at
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING j.*;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_render_job(INTEGER) FROM PUBLIC;