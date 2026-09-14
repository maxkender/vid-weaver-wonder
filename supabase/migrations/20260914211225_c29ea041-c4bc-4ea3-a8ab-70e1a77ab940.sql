CREATE TABLE public.topic_queue (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  topic text NOT NULL,
  angle text,
  narration_style text NOT NULL DEFAULT 'revelation',
  category text NOT NULL DEFAULT 'aleatoire',
  status text NOT NULL DEFAULT 'propose',
  position integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  used_at timestamp with time zone,
  video_job_id text
);

GRANT ALL ON public.topic_queue TO service_role;

ALTER TABLE public.topic_queue ENABLE ROW LEVEL SECURITY;

CREATE INDEX topic_queue_status_position_idx ON public.topic_queue (status, position, created_at);