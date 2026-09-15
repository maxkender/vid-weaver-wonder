ALTER TABLE public.render_jobs
  ADD COLUMN IF NOT EXISTS master_id uuid REFERENCES public.render_jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS languages text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS publish_date date;

CREATE INDEX IF NOT EXISTS render_jobs_master_id_idx ON public.render_jobs (master_id);