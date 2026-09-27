alter table public.topic_queue
  add column if not exists format text not null default 'video'
  check (format in ('video','slideshow','both'));

alter table public.language_settings
  add column if not exists slideshow_format text;

-- Ligne 2 = pause propre à la chaîne slideshow (la ligne 1 reste la vidéo).
alter table public.job_control drop constraint if exists job_control_singleton;
alter table public.job_control add constraint job_control_rows check (id in (1, 2));
insert into public.job_control (id, paused) values (2, false) on conflict (id) do nothing;

create table if not exists public.slideshow_jobs (
  id uuid primary key default gen_random_uuid(),
  publish_date date,
  topic text,
  topic_category text,
  format text not null default 'quiz',
  languages text[] not null default '{}',
  slide_count int not null default 11,
  slides jsonb not null default '[]'::jsonb,
  textes jsonb not null default '{}'::jsonb,
  status text not null default 'queued',
  step text,
  progress numeric not null default 0,
  error text,
  attempts int not null default 0,
  lease_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant all on public.slideshow_jobs to service_role;
alter table public.slideshow_jobs enable row level security;
create trigger slideshow_jobs_touch before update on public.slideshow_jobs
  for each row execute function public.touch_updated_at();

create table if not exists public.slideshow_events (
  id bigserial primary key,
  slideshow_job_id uuid not null references public.slideshow_jobs(id) on delete cascade,
  step text not null,
  message text,
  level text not null default 'info',
  created_at timestamptz not null default now()
);
grant all on public.slideshow_events to service_role;
grant usage, select on sequence public.slideshow_events_id_seq to service_role;
alter table public.slideshow_events enable row level security;

create table if not exists public.daily_slideshows (
  id uuid primary key default gen_random_uuid(),
  slideshow_job_id uuid references public.slideshow_jobs(id) on delete set null,
  publish_date date not null,
  language text not null,
  format text not null default 'quiz',
  title text,
  caption text,
  hashtags text[] not null default '{}',
  slides jsonb not null default '[]'::jsonb,
  status text not null default 'published',
  created_at timestamptz not null default now(),
  unique (publish_date, language, format)
);
grant select on public.daily_slideshows to authenticated;
grant insert, update, delete on public.daily_slideshows to authenticated;
grant all on public.daily_slideshows to service_role;
alter table public.daily_slideshows enable row level security;
create policy daily_slideshows_admin_write on public.daily_slideshows for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
create policy daily_slideshows_read on public.daily_slideshows for select to authenticated
  using (
    public.has_role(auth.uid(), 'admin')
    or (status = 'published' and exists (
      select 1 from public.poster_accounts a
      where a.poster_id = auth.uid() and a.language = daily_slideshows.language))
  );

create table if not exists public.slideshow_downloads (
  id uuid primary key default gen_random_uuid(),
  daily_slideshow_id uuid not null references public.daily_slideshows(id) on delete cascade,
  poster_id uuid not null,
  account_id uuid,
  downloaded_at timestamptz not null default now(),
  posted_url text,
  posted_at timestamptz
);
grant select, insert, update on public.slideshow_downloads to authenticated;
grant all on public.slideshow_downloads to service_role;
alter table public.slideshow_downloads enable row level security;
create policy slideshow_downloads_insert_own on public.slideshow_downloads for insert to authenticated
  with check (poster_id = auth.uid());
create policy slideshow_downloads_select on public.slideshow_downloads for select to authenticated
  using (poster_id = auth.uid() or public.has_role(auth.uid(), 'admin'));
create policy slideshow_downloads_update_own on public.slideshow_downloads for update to authenticated
  using (poster_id = auth.uid() or public.has_role(auth.uid(), 'admin'))
  with check (poster_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

create index if not exists slideshow_jobs_status_idx on public.slideshow_jobs (status, created_at);
create index if not exists daily_slideshows_jour_idx on public.daily_slideshows (publish_date desc, language);
create index if not exists slideshow_downloads_poster_idx on public.slideshow_downloads (poster_id);
create index if not exists slideshow_events_job_idx on public.slideshow_events (slideshow_job_id, created_at);