ALTER TABLE public.render_jobs
  ADD COLUMN IF NOT EXISTS rendering_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS rendering_sends integer NOT NULL DEFAULT 0;

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
      AND NOT (
        status = 'rendering'
        AND rendering_sent_at IS NOT NULL
        AND rendering_sent_at > now() - interval '15 minutes'
      )
    ORDER BY created_at
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING j.*;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_render_job(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_render_job(INTEGER) TO service_role;