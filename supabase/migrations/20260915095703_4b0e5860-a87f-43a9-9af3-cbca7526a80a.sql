-- Rôles
create type public.app_role as enum ('admin', 'poster');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null default 'poster',
  full_name text not null default '',
  email text not null default '',
  country text,
  language text not null default 'fr',
  status text not null default 'invited',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = _user_id and role = _role)
$$;

create policy "profiles_select_own_or_admin" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.has_role(auth.uid(), 'admin'));
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles_admin_update" on public.profiles
  for update to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

-- Comptes rattachés (aucun mot de passe, jamais)
create table public.poster_accounts (
  id uuid primary key default gen_random_uuid(),
  poster_id uuid not null references public.profiles(id) on delete cascade,
  platform text not null check (platform in ('instagram','tiktok','youtube')),
  handle text not null,
  gmail_address text,
  status text not null default 'pending' check (status in ('pending','active','suspended','recovered')),
  followers integer not null default 0,
  profile_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.poster_accounts to authenticated;
grant all on public.poster_accounts to service_role;
alter table public.poster_accounts enable row level security;
create policy "poster_accounts_select" on public.poster_accounts
  for select to authenticated
  using (poster_id = auth.uid() or public.has_role(auth.uid(), 'admin'));
create policy "poster_accounts_insert" on public.poster_accounts
  for insert to authenticated
  with check (poster_id = auth.uid() or public.has_role(auth.uid(), 'admin'));
create policy "poster_accounts_update" on public.poster_accounts
  for update to authenticated
  using (poster_id = auth.uid() or public.has_role(auth.uid(), 'admin'))
  with check (poster_id = auth.uid() or public.has_role(auth.uid(), 'admin'));
create policy "poster_accounts_delete" on public.poster_accounts
  for delete to authenticated
  using (poster_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

-- Modèles de contrat
create table public.contract_templates (
  id uuid primary key default gen_random_uuid(),
  version integer not null unique,
  title text not null,
  body text not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.contract_templates to authenticated;
grant all on public.contract_templates to service_role;
alter table public.contract_templates enable row level security;
create policy "contract_templates_read" on public.contract_templates
  for select to authenticated using (true);
create policy "contract_templates_admin_write" on public.contract_templates
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- Contrats signés : jamais modifiables
create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  poster_id uuid not null references public.profiles(id) on delete cascade,
  version integer not null,
  body text not null,
  signed_full_name text not null,
  signed_at timestamptz not null default now(),
  signed_ip text,
  signed_user_agent text
);
grant select, insert on public.contracts to authenticated;
grant all on public.contracts to service_role;
alter table public.contracts enable row level security;
create policy "contracts_select" on public.contracts
  for select to authenticated
  using (poster_id = auth.uid() or public.has_role(auth.uid(), 'admin'));
create policy "contracts_insert_own" on public.contracts
  for insert to authenticated with check (poster_id = auth.uid());

-- Vidéo du jour
create table public.daily_videos (
  id uuid primary key default gen_random_uuid(),
  publish_date date not null,
  language text not null,
  render_id text,
  storage_path text,
  title text not null default '',
  caption text not null default '',
  hashtags text[] not null default '{}',
  duration_sec numeric not null default 0,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (publish_date, language)
);
grant select on public.daily_videos to authenticated;
grant all on public.daily_videos to service_role;
alter table public.daily_videos enable row level security;
create policy "daily_videos_read" on public.daily_videos
  for select to authenticated
  using (status = 'published' or public.has_role(auth.uid(), 'admin'));
create policy "daily_videos_admin_write" on public.daily_videos
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- Téléchargements et publications
create table public.video_downloads (
  id uuid primary key default gen_random_uuid(),
  daily_video_id uuid not null references public.daily_videos(id) on delete cascade,
  poster_id uuid not null references public.profiles(id) on delete cascade,
  downloaded_at timestamptz not null default now(),
  posted_url text,
  posted_at timestamptz
);
grant select, insert, update on public.video_downloads to authenticated;
grant all on public.video_downloads to service_role;
alter table public.video_downloads enable row level security;
create policy "video_downloads_select" on public.video_downloads
  for select to authenticated
  using (poster_id = auth.uid() or public.has_role(auth.uid(), 'admin'));
create policy "video_downloads_insert_own" on public.video_downloads
  for insert to authenticated with check (poster_id = auth.uid());
create policy "video_downloads_update_own" on public.video_downloads
  for update to authenticated
  using (poster_id = auth.uid() or public.has_role(auth.uid(), 'admin'))
  with check (poster_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

-- Réglages par langue
create table public.language_settings (
  language text primary key,
  enabled boolean not null default true,
  eleven_voice_id text,
  voice_speed numeric not null default 1.05,
  narration_style text not null default 'revelation',
  visual_style text not null default 'papercraft',
  music_style text not null default 'revelation',
  updated_at timestamptz not null default now()
);
grant select on public.language_settings to authenticated;
grant all on public.language_settings to service_role;
alter table public.language_settings enable row level security;
create policy "language_settings_read" on public.language_settings
  for select to authenticated using (true);
create policy "language_settings_admin_write" on public.language_settings
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- Journal d'audit
create table public.audit_log (
  id bigserial primary key,
  actor_id uuid,
  action text not null,
  target_table text,
  target_id text,
  payload jsonb,
  created_at timestamptz not null default now()
);
grant select on public.audit_log to authenticated;
grant all on public.audit_log to service_role;
alter table public.audit_log enable row level security;
create policy "audit_log_admin_read" on public.audit_log
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));

-- Horodatage
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger poster_accounts_touch before update on public.poster_accounts
  for each row execute function public.touch_updated_at();
create trigger contract_templates_touch before update on public.contract_templates
  for each row execute function public.touch_updated_at();
create trigger daily_videos_touch before update on public.daily_videos
  for each row execute function public.touch_updated_at();
create trigger language_settings_touch before update on public.language_settings
  for each row execute function public.touch_updated_at();

-- Réglages initiaux : valeurs actuellement codées en dur
insert into public.language_settings (language, enabled, eleven_voice_id, voice_speed) values
  ('fr', true, '5hg8RfXWJPAYypnW7dXa', 1.05),
  ('en', true, 'JBFqnCBsd6RMkjVDRZzb', 1.05),
  ('es', true, 'o0SveC0zgHFuCsEO3vHR', 1.05),
  ('de', true, 'NlRO8ABjJNJNYaRaLiPJ', 1.05),
  ('it', true, '32vqZVYOe7sQVGys0soJ', 1.05),
  ('pt', false, '5hg8RfXWJPAYypnW7dXa', 1.05);

-- Modèle de contrat version 1
insert into public.contract_templates (version, title, body, is_active) values (
1,
'Contrat de collaboration — publication de contenus',
$md$# Contrat de collaboration — publication de contenus

**Entre** l'entreprise (ci-après « l'Entreprise ») **et** la personne signataire (ci-après « le Posteur »).

## 1. Objet
Le Posteur accepte de publier chaque jour, sur des comptes de réseaux sociaux créés pour cette collaboration, les contenus vidéo fournis par l'Entreprise via la plateforme. Le Posteur n'intervient ni sur la création, ni sur le montage, ni sur le choix des contenus.

## 2. Comptes utilisés
Le Posteur crée, pour les besoins exclusifs de cette collaboration :
- une adresse Gmail dédiée, distincte de son adresse personnelle ;
- un ou plusieurs comptes Instagram, TikTok ou YouTube rattachés à cette adresse.

Ces comptes sont créés pour le compte de l'Entreprise. Les parties conviennent que ces comptes, leur audience et l'intégralité du contenu qui y est publié relèvent de l'Entreprise.

Le Posteur ne communique jamais ses mots de passe à l'Entreprise, ni à un tiers, ni par message. L'Entreprise ne demande jamais de mot de passe et n'en conserve aucun.

## 3. Restitution des accès
À première demande de l'Entreprise, y compris en cas d'arrêt de la collaboration, le Posteur s'engage à transférer l'accès aux comptes concernés selon la procédure indiquée par l'Entreprise, dans un délai de sept (7) jours, et à cesser toute utilisation de ces comptes.

## 4. Contenus publiés
Le Posteur publie uniquement les contenus fournis par l'Entreprise, sans modification du montage, du son, du texte incrusté, de la légende ni des hashtags. Aucune autre publication n'est autorisée sur ces comptes.

## 5. Propriété intellectuelle
L'Entreprise demeure titulaire de l'ensemble des droits sur les contenus fournis. Le Posteur ne dispose d'aucun droit d'exploitation en dehors de la publication prévue au présent contrat.

## 6. Confidentialité
Le Posteur s'engage à ne divulguer à aucun tiers les informations relatives à l'Entreprise, à la plateforme, aux méthodes de production et aux contenus non encore publiés, pendant toute la durée de la collaboration et deux (2) ans après sa fin.

## 7. Durée et fin de la collaboration
La collaboration est conclue pour une durée indéterminée. Chaque partie peut y mettre fin à tout moment, par écrit, avec un préavis de quinze (15) jours. Les obligations de restitution des accès et de confidentialité survivent à la fin de la collaboration.

## 8. Données personnelles (RGPD)
L'Entreprise traite les données suivantes : nom, adresse e-mail, pays, langue, adresses des comptes créés, historique des téléchargements et des publications, ainsi que les éléments de signature du présent contrat (date, adresse IP, navigateur). Ces données servent exclusivement à la gestion de la collaboration et sont conservées pendant la durée de celle-ci, puis trois (3) ans. Le Posteur dispose d'un droit d'accès, de rectification, d'effacement, de limitation et de portabilité, qu'il exerce auprès de l'Entreprise.

## 9. Indépendance
Le présent contrat ne crée aucun lien de subordination ni contrat de travail entre les parties.

## 10. Droit applicable et juridiction
Le présent contrat est soumis au droit de __________. Tout litige relève de la compétence exclusive du tribunal de __________.

## 11. Acceptation
La signature électronique s'effectue par la saisie du nom complet du Posteur et la validation de la case d'acceptation. Elle est horodatée et vaut acceptation pleine et entière du présent texte.
$md$,
true);