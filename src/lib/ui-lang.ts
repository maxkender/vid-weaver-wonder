/**
 * Langue de l'interface de l'ESPACE POSTEUR (français ou anglais).
 *
 * Les pages d'administration restent en français : ce dictionnaire ne couvre
 * que les trois pages ouvertes par les posteurs (connexion, réinitialisation,
 * mon espace). Les contenus venant de la base (titres, légendes, hashtags,
 * pseudos) ne sont jamais traduits.
 */
import { useCallback, useEffect, useState } from "react";

export type UiLang = "fr" | "en";

export const UI_LANG_KEY = "sophia-ui-lang";

export const UI_STRINGS: Record<UiLang, Record<string, string>> = {
  fr: {
    /* --- commun --- */
    "common.copy": "Copier",
    "common.copied": "{label} copié",
    "common.save": "Enregistrer",
    "common.close": "Fermer",
    "common.loadFailed": "Chargement impossible",
    "common.actionFailed": "Action impossible",
    "common.saveFailed": "Enregistrement impossible",
    "common.saved": "Valeurs mises à jour",
    "common.language": "Langue",

    /* --- connexion --- */
    "login.title": "Plateforme de diffusion",
    "login.subtitle.signin": "Connecte-toi pour récupérer la vidéo du jour.",
    "login.subtitle.forgot": "Réinitialise ton mot de passe.",
    "login.email": "Adresse e-mail",
    "login.password": "Mot de passe",
    "login.passwordHint":
      "C'est le mot de passe de cette plateforme, jamais celui d'un compte Gmail, Instagram ou TikTok.",
    "login.submit": "Se connecter",
    "login.sendLink": "Envoyer le lien",
    "login.back": "Revenir à la connexion",
    "login.forgot": "Mot de passe oublié",
    "login.accessNote": "Les accès sont créés par l'administrateur.",
    "login.failed": "Connexion impossible",
    "login.resetSent":
      "Si cette adresse existe, un lien de réinitialisation vient de partir. Les posteurs passent par l'administrateur, qui remet le mot de passe à 12345678.",
    "login.admin.title": "Créer le compte administrateur",
    "login.admin.note":
      "Aucun compte n'existe encore. Ce formulaire disparaît dès que l'administrateur est créé ; tous les autres accès seront ensuite créés depuis le tableau de bord.",
    "login.admin.name": "Nom complet",
    "login.admin.create": "Créer l'administrateur",
    "login.admin.failed": "Création impossible",

    /* --- réinitialisation --- */
    "reset.title": "Nouveau mot de passe",
    "reset.password": "Mot de passe",
    "reset.save": "Enregistrer",
    "reset.done": "Mot de passe mis à jour",
    "reset.failed": "Mise à jour impossible",

    /* --- espace : en-tête --- */
    "space.title": "Mon espace",
    "space.signout": "Déconnexion",
    "space.pending.title": "Ton compte est en préparation",
    "space.pending.body":
      "L'administrateur doit d'abord t'attribuer un compte à créer. Reviens dans quelques minutes, tout s'affichera ici.",

    /* --- espace : parcours --- */
    "onb.accountReady": "Compte prêt",
    "onb.accountTitle": "Compte {language}",
    "onb.stepOf": "Étape {n} sur 5",
    "onb.intro":
      "Suis les étapes dans l'ordre. Chaque valeur à recopier est affichée avec un bouton pour la copier.",
    "onb.fixNote": "Ces valeurs diffèrent de la convention ({handle} · {gmail}).",
    "onb.fixOpen": "Corriger mon pseudo ou mon adresse",
    "onb.handle": "Pseudo",
    "onb.gmail": "Adresse Gmail",

    "step1.title": "Créer l'adresse Gmail",
    "step1.body":
      "C'est une adresse dédiée à cette activité : n'utilise jamais ton adresse personnelle.",
    "step1.expected": "Adresse à créer",
    "step1.password": "Mot de passe à utiliser",
    "step1.actual": "Adresse réellement créée",
    "step1.hint": "Si cette adresse était déjà prise, corrige-la ici : l'administrateur le verra.",
    "step1.cta": "L'adresse est créée, continuer",
    "step1.ok": "Adresse Gmail enregistrée",

    "step2.title": "Créer le compte Instagram",
    "step2.body": "Crée le compte AVEC l'adresse Gmail de l'étape 1 ({gmail}).",
    "step2.expected": "Pseudo à créer",
    "step2.actual": "Pseudo réellement créé",
    "step2.hint": "Si le pseudo était déjà pris, saisis celui que tu as obtenu.",
    "step2.cta": "Le compte est créé, continuer",
    "step2.ok": "Compte Instagram enregistré",

    "step3.title": "Photo de profil et biographie",
    "step3.body":
      "Télécharge le logo Sophia et mets-le en photo de profil, puis colle la biographie.",
    "step3.photo": "Télécharger la photo de profil",
    "step3.photoAlt": "Logo Sophia à utiliser en photo de profil",
    "step3.bio": "Biographie du compte",
    "step3.cta": "C'est fait, démarrer la chauffe de 24 h",
    "step3.ok": "Photo et biographie enregistrées",

    "step4.title": "Chauffe du compte — 24 heures",
    "step4.warning":
      "Aucune publication pendant 24 heures : un compte neuf qui publie tout de suite est traité comme un robot et sa portée est bridée durablement.",
    "step4.cta": "Les 24 h sont passées, continuer",
    "step4.wait": "Disponible à la fin du compte à rebours",
    "step4.ok": "Compte prêt à publier",
    "warmup.scroll": "Scroller le fil et les Reels 15 à 20 minutes, 2 ou 3 fois dans la journée",
    "warmup.follow":
      "S'abonner à 30 ou 40 comptes de culture générale, sciences, histoire ou faits insolites, dans ta langue",
    "warmup.engage": "Aimer et commenter sincèrement quelques publications",
    "warmup.watch": "Regarder plusieurs Reels jusqu'au bout",
    "warmup.slow": "Ne jamais s'abonner à 100 comptes d'un coup : étaler dans la journée",

    "step5.title": "Lire et signer le contrat",
    "step5.name": "Ton nom complet, en toutes lettres",
    "step5.namePlaceholder": "Prénom Nom",
    "step5.accept": "J'ai lu et j'accepte l'intégralité du contrat ci-dessus.",
    "step5.cta": "Signer et accéder à mon espace",
    "step5.ok": "Contrat signé",
    "step5.failed": "Signature impossible",
    "step5.none": "Aucun contrat n'est disponible pour l'instant.",

    /* --- espace : vidéos --- */
    "video.posted": "Publiée",
    "video.warmNote":
      "Ton compte n'a pas terminé ses 24 h de chauffe. Prépare ta publication, mais ne publie qu'une fois la chauffe validée.",
    "video.none": "La vidéo du jour n'est pas encore publiée pour ce compte. Reviens un peu plus tard.",
    "video.titleOf": "Vidéo du {date}",
    "video.save": "Télécharger le MP4",
    "video.saveHint":
      "Sur téléphone, choisis « Enregistrer la vidéo » : elle arrive dans ta pellicule.",
    "video.saved": "Vidéo enregistrée",
    "video.downloaded": "Téléchargement lancé",
    "video.saveFailed": "Téléchargement impossible",
    "video.caption": "Légende",
    "video.hashtags": "Hashtags",
    "video.captionCopied": "Légende copiée",
    "video.hashtagsCopied": "Liste de hashtags copiée",
    "video.declareLabel": "J'ai publié — colle le lien de ta publication",
    "video.declareCta": "Enregistrer ma publication",
    "video.declareOk": "Publication enregistrée",
    "history.title": "30 derniers jours",
    "history.posted": "Publiée",
    "history.downloaded": "Téléchargée",
    "history.notDownloaded": "Non téléchargée",

    /* --- espace : contrat --- */
    "contract.title": "Mon contrat signé",
    "contract.meta": "Version {version} · signé le {date} par {name}",
    "contract.hide": "Masquer le texte",
    "contract.show": "Relire le texte",
    "contract.signedLine":
      "Signé électroniquement par {name} ({email}) le {date} — version {version}.",
  },

  en: {
    "common.copy": "Copy",
    "common.copied": "{label} copied",
    "common.save": "Save",
    "common.close": "Close",
    "common.loadFailed": "Could not load your space",
    "common.actionFailed": "That didn't work",
    "common.saveFailed": "Could not save",
    "common.saved": "Details updated",
    "common.language": "Language",

    "login.title": "Posting platform",
    "login.subtitle.signin": "Sign in to get today's video.",
    "login.subtitle.forgot": "Reset your password.",
    "login.email": "Email address",
    "login.password": "Password",
    "login.passwordHint":
      "This is your password for this platform, never the one for a Gmail, Instagram or TikTok account.",
    "login.submit": "Sign in",
    "login.sendLink": "Send the link",
    "login.back": "Back to sign in",
    "login.forgot": "Forgot password",
    "login.accessNote": "Accounts are created by the administrator.",
    "login.failed": "Could not sign you in",
    "login.resetSent":
      "If this address exists, a reset link is on its way. Posters can also ask the administrator, who resets the password to 12345678.",
    "login.admin.title": "Create the administrator account",
    "login.admin.note":
      "No account exists yet. This form disappears as soon as the administrator is created; every other account is then created from the dashboard.",
    "login.admin.name": "Full name",
    "login.admin.create": "Create the administrator",
    "login.admin.failed": "Could not create the account",

    "reset.title": "New password",
    "reset.password": "Password",
    "reset.save": "Save",
    "reset.done": "Password updated",
    "reset.failed": "Could not update your password",

    "space.title": "My space",
    "space.signout": "Sign out",
    "space.pending.title": "Your account is being set up",
    "space.pending.body":
      "The administrator still has to assign you an account to create. Come back in a few minutes and everything will show up here.",

    "onb.accountReady": "Account ready",
    "onb.accountTitle": "{language} account",
    "onb.stepOf": "Step {n} of 5",
    "onb.intro": "Follow the steps in order. Every value to copy has a copy button next to it.",
    "onb.fixNote": "These differ from the agreed values ({handle} · {gmail}).",
    "onb.fixOpen": "Fix my username or email",
    "onb.handle": "Username",
    "onb.gmail": "Gmail address",

    "step1.title": "Create the Gmail address",
    "step1.body": "This address is only for this activity: never use your personal one.",
    "step1.expected": "Address to create",
    "step1.password": "Password to use",
    "step1.actual": "Address you actually created",
    "step1.hint": "If that address was taken, correct it here: the administrator will see it.",
    "step1.cta": "The address is created, continue",
    "step1.ok": "Gmail address saved",

    "step2.title": "Create the Instagram account",
    "step2.body": "Create the account WITH the Gmail address from step 1 ({gmail}).",
    "step2.expected": "Username to create",
    "step2.actual": "Username you actually created",
    "step2.hint": "If the username was taken, enter the one you got.",
    "step2.cta": "The account is created, continue",
    "step2.ok": "Instagram account saved",

    "step3.title": "Profile picture and bio",
    "step3.body": "Download the Sophia logo, set it as your profile picture, then paste the bio.",
    "step3.photo": "Download the profile picture",
    "step3.photoAlt": "Sophia logo to use as a profile picture",
    "step3.bio": "Account bio",
    "step3.cta": "Done, start the 24 h warm-up",
    "step3.ok": "Picture and bio saved",

    "step4.title": "Account warm-up — 24 hours",
    "step4.warning":
      "No posting for 24 hours: a brand-new account that posts straight away is treated as a bot and its reach stays limited for a long time.",
    "step4.cta": "The 24 hours are over, continue",
    "step4.wait": "Available when the countdown ends",
    "step4.ok": "Account ready to post",
    "warmup.scroll": "Scroll the feed and Reels for 15 to 20 minutes, 2 or 3 times during the day",
    "warmup.follow":
      "Follow 30 to 40 accounts about general knowledge, science, history or curious facts, in your language",
    "warmup.engage": "Genuinely like and comment on a few posts",
    "warmup.watch": "Watch several Reels all the way through",
    "warmup.slow": "Never follow 100 accounts at once: spread it across the day",

    "step5.title": "Read and sign the agreement",
    "step5.name": "Your full name, written out",
    "step5.namePlaceholder": "First name Last name",
    "step5.accept": "I have read and accept the whole agreement above.",
    "step5.cta": "Sign and open my space",
    "step5.ok": "Agreement signed",
    "step5.failed": "Could not sign the agreement",
    "step5.none": "No agreement is available right now.",

    "video.posted": "Posted",
    "video.warmNote":
      "Your account hasn't finished its 24 h warm-up. Get your post ready, but only publish once the warm-up is done.",
    "video.none": "Today's video isn't published for this account yet. Come back a bit later.",
    "video.titleOf": "Video for {date}",
    "video.save": "Save the video",
    "video.saveHint": "On your phone, choose \u201cSave video\u201d: it goes straight to your camera roll.",
    "video.saved": "Video saved",
    "video.downloaded": "Download started",
    "video.saveFailed": "Could not get the video",
    "video.caption": "Caption",
    "video.hashtags": "Hashtags",
    "video.captionCopied": "Caption copied",
    "video.hashtagsCopied": "Hashtags copied",
    "video.declareLabel": "I posted it — paste the link to your post",
    "video.declareCta": "Save my post",
    "video.declareOk": "Post saved",
    "history.title": "Last 30 days",
    "history.posted": "Posted",
    "history.downloaded": "Downloaded",
    "history.notDownloaded": "Not downloaded",

    "contract.title": "My signed agreement",
    "contract.meta": "Version {version} · signed on {date} by {name}",
    "contract.hide": "Hide the text",
    "contract.show": "Read it again",
    "contract.signedLine": "Signed electronically by {name} ({email}) on {date} — version {version}.",
  },
};

/** Traduit une clé, avec interpolation simple des `{variables}`. */
export function t(lang: UiLang, key: string, vars?: Record<string, string | number>): string {
  const raw = UI_STRINGS[lang]?.[key] ?? UI_STRINGS.fr[key] ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (m, name: string) =>
    vars[name] === undefined ? m : String(vars[name]),
  );
}

function defaultLang(): UiLang {
  if (typeof navigator === "undefined") return "fr";
  return navigator.language?.toLowerCase().startsWith("fr") ? "fr" : "en";
}

/** Date lisible, dans la langue de l'interface. */
export function formatDay(iso: string, lang: UiLang): string {
  const [y, m, d] = iso.split("-");
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(lang === "fr" ? "fr-FR" : "en-GB");
}

export function localeOf(lang: UiLang): string {
  return lang === "fr" ? "fr-FR" : "en-GB";
}

/**
 * Langue choisie par le posteur, mémorisée dans le navigateur.
 * Premier rendu toujours en « fr » pour rester identique côté serveur.
 */
export function useUiLang() {
  const [lang, setLang] = useState<UiLang>("fr");

  useEffect(() => {
    const stored =
      typeof localStorage === "undefined" ? null : localStorage.getItem(UI_LANG_KEY);
    setLang(stored === "fr" || stored === "en" ? stored : defaultLang());
  }, []);

  const change = useCallback((next: UiLang) => {
    setLang(next);
    try {
      localStorage.setItem(UI_LANG_KEY, next);
    } catch {
      /* navigation privée : on garde le choix en mémoire seulement */
    }
  }, []);

  const tr = useCallback(
    (key: string, vars?: Record<string, string | number>) => t(lang, key, vars),
    [lang],
  );

  return { lang, setLang: change, t: tr };
}
