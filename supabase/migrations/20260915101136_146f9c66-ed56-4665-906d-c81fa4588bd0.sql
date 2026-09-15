create table public.distribution_settings (
  id integer primary key default 1,
  auto_enabled boolean not null default false,
  run_hour integer not null default 0,
  timezone text not null default 'Europe/Paris',
  languages text[] not null default '{fr,en,es,de,it}'::text[],
  on_failure text not null default 'replay',
  last_run_at timestamp with time zone,
  last_run_result text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint distribution_settings_singleton check (id = 1),
  constraint distribution_settings_on_failure check (on_failure in ('replay','skip')),
  constraint distribution_settings_hour check (run_hour between 0 and 23)
);

grant select, insert, update on public.distribution_settings to authenticated;
grant all on public.distribution_settings to service_role;

alter table public.distribution_settings enable row level security;

create policy distribution_settings_admin_all
  on public.distribution_settings
  for all
  to authenticated
  using (has_role(auth.uid(), 'admin'::app_role))
  with check (has_role(auth.uid(), 'admin'::app_role));

create trigger distribution_settings_touch
  before update on public.distribution_settings
  for each row execute function public.touch_updated_at();

insert into public.distribution_settings (id) values (1) on conflict (id) do nothing;