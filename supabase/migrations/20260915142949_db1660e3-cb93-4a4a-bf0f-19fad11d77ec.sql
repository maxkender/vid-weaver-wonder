ALTER TABLE public.poster_accounts
  ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'fr',
  ADD COLUMN IF NOT EXISTS country_code text NOT NULL DEFAULT 'fr',
  ADD COLUMN IF NOT EXISTS gmail_done_at timestamptz,
  ADD COLUMN IF NOT EXISTS handle_done_at timestamptz,
  ADD COLUMN IF NOT EXISTS photo_done_at timestamptz,
  ADD COLUMN IF NOT EXISTS warmup_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS warmup_done_at timestamptz,
  ADD COLUMN IF NOT EXISTS warmup_checks jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.poster_accounts a
SET language = p.language,
    country_code = CASE p.language WHEN 'en' THEN 'uk' ELSE p.language END
FROM public.profiles p
WHERE p.id = a.poster_id;

ALTER TABLE public.video_downloads
  ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES public.poster_accounts(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS video_downloads_video_account_key
  ON public.video_downloads (daily_video_id, account_id)
  WHERE account_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.account_conventions (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  instagram_template text NOT NULL DEFAULT 'sophia.app.{pays}',
  gmail_template text NOT NULL DEFAULT 'social.sophia.{pays}@gmail.com',
  social_password text NOT NULL DEFAULT 'VikStudios123!',
  bio_text text NOT NULL DEFAULT 'Sophia — la culture générale en 60 secondes. Un fait fascinant par jour.',
  upwork_message_fr text NOT NULL DEFAULT '',
  upwork_message_en text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.account_conventions TO authenticated;
GRANT ALL ON public.account_conventions TO service_role;

ALTER TABLE public.account_conventions ENABLE ROW LEVEL SECURITY;

CREATE POLICY account_conventions_admin_all ON public.account_conventions
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER account_conventions_touch
  BEFORE UPDATE ON public.account_conventions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.account_conventions (id, upwork_message_fr, upwork_message_en)
VALUES (
  1,
  E'Bonjour {prenom},\n\nVoici ton accès à la plateforme Sophia : {lien}\nIdentifiant : {identifiant}\nMot de passe : {motdepasse}\n\nTout le reste (création de l''adresse Gmail, du compte Instagram, photo de profil, mise en route du compte et contrat) est expliqué pas à pas une fois connecté. Tu n''as rien d''autre à préparer.\n\nÀ très vite,\nL''équipe Sophia',
  E'Hi {prenom},\n\nHere is your access to the Sophia platform: {lien}\nLogin: {identifiant}\nPassword: {motdepasse}\n\nEverything else (creating the Gmail address, the Instagram account, the profile picture, warming up the account and the contract) is explained step by step once you log in. Nothing else to prepare.\n\nTalk soon,\nThe Sophia team'
)
ON CONFLICT (id) DO NOTHING;