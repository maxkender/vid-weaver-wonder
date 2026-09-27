CREATE TABLE IF NOT EXISTS public.slideshow_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  formats_actifs text[] NOT NULL DEFAULT '{quiz,histoire,debunk,classement,vrai_faux,echelle}',
  slide_count_defaut int NOT NULL DEFAULT 12,
  langues text[] NOT NULL DEFAULT '{fr,en,es,de,it}',
  image_style text NOT NULL DEFAULT '',
  police text NOT NULL DEFAULT 'Anton',
  graisse int NOT NULL DEFAULT 400,
  taille_ratio numeric NOT NULL DEFAULT 0.065,
  majuscules boolean NOT NULL DEFAULT true,
  position_texte text NOT NULL DEFAULT 'haut' CHECK (position_texte IN ('haut','milieu','bas')),
  largeur_max_ratio numeric NOT NULL DEFAULT 0.84,
  interligne numeric NOT NULL DEFAULT 1.15,
  couleur_texte text NOT NULL DEFAULT '#FFFFFF',
  fond_texte text NOT NULL DEFAULT 'boite' CHECK (fond_texte IN ('aucun','contour','ombre','bandeau','boite')),
  fond_couleur text NOT NULL DEFAULT '#000000',
  fond_opacite numeric NOT NULL DEFAULT 0.78,
  lignes_max int NOT NULL DEFAULT 4,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.slideshow_settings TO authenticated;
GRANT INSERT, UPDATE ON public.slideshow_settings TO authenticated;
GRANT ALL ON public.slideshow_settings TO service_role;
ALTER TABLE public.slideshow_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read slideshow settings" ON public.slideshow_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert slideshow settings" ON public.slideshow_settings FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update slideshow settings" ON public.slideshow_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
