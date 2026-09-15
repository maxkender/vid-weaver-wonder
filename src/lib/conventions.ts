/**
 * CONVENTIONS DE NOMMAGE DES COMPTES.
 *
 * Les identifiants ne sont plus libres : ils sont calculés à partir de gabarits
 * modifiables par l'administrateur et du code pays porté par CHAQUE compte.
 * Module pur, utilisable côté navigateur comme côté serveur.
 */

export type ConventionRow = {
  instagram_template: string;
  gmail_template: string;
  social_password: string;
  bio_text: string;
  upwork_message_fr: string;
  upwork_message_en: string;
};

export const DEFAULT_CONVENTIONS: ConventionRow = {
  instagram_template: "sophia.app.{pays}",
  gmail_template: "social.sophia.{pays}@gmail.com",
  social_password: "VikStudios123!",
  bio_text: "Sophia — la culture générale en 60 secondes. Un fait fascinant par jour.",
  upwork_message_fr: "",
  upwork_message_en: "",
};

/** Code pays par défaut déduit de la langue de publication. */
export const COUNTRY_BY_LANGUAGE: Record<string, string> = {
  fr: "fr",
  es: "es",
  de: "de",
  it: "it",
  en: "uk",
};

export function defaultCountryFor(language: string) {
  return COUNTRY_BY_LANGUAGE[language] ?? language.slice(0, 2).toLowerCase();
}

export function normalizeCountry(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .slice(0, 2);
}

/** Remplace {pays} (et {country}) dans un gabarit. */
export function applyTemplate(template: string, country: string) {
  const code = normalizeCountry(country);
  return template.replace(/\{pays\}/gi, code).replace(/\{country\}/gi, code);
}

export function conventionHandle(conv: ConventionRow, country: string) {
  return applyTemplate(conv.instagram_template, country);
}

export function conventionGmail(conv: ConventionRow, country: string) {
  return applyTemplate(conv.gmail_template, country);
}

/** Remplit le message Upwork. */
export function fillUpworkMessage(
  template: string,
  values: { prenom: string; lien: string; identifiant: string; motdepasse: string },
) {
  return template
    .replace(/\{prenom\}/gi, values.prenom)
    .replace(/\{lien\}/gi, values.lien)
    .replace(/\{identifiant\}/gi, values.identifiant)
    .replace(/\{motdepasse\}/gi, values.motdepasse);
}

/**
 * Mot de passe de connexion à la plateforme : lisible, facile à taper, et
 * DIFFÉRENT pour chaque posteur (les mots de passe des comptes sociaux sont
 * désormais affichés dans l'espace posteur, un mot de passe commun devinable
 * ouvrirait ces comptes à n'importe qui).
 */
const WORDS = [
  "soleil", "carbone", "orage", "cactus", "marbre", "banquise", "cobalt", "figue",
  "lagune", "menthe", "nickel", "olive", "pluie", "quartz", "roseau", "safran",
  "tulipe", "velours", "wagon", "zebre", "amande", "bambou", "cuivre", "dune",
  "ecume", "fusain", "givre", "hibou", "iode", "jade", "koala", "lierre",
  "mousse", "nuage", "onyx", "prisme", "rafale", "sable", "tempete", "ultra",
];

export function generatePlatformPassword() {
  const pick = () => WORDS[Math.floor(Math.random() * WORDS.length)]!;
  let a = pick();
  let b = pick();
  let c = pick();
  while (b === a) b = pick();
  while (c === a || c === b) c = pick();
  const digits = String(Math.floor(1000 + Math.random() * 9000));
  return `${a}-${b}-${c}-${digits}`.replace(/-(\d{4})$/, "-$1");
}
