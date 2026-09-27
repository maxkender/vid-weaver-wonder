/**
 * LES FORMATS DE SLIDESHOW.
 *
 * Chaîne SÉPARÉE de la chaîne vidéo : aucune voix, aucun clip animé, aucun
 * passage par le service de rendu. Un slideshow, c'est une image par slide et
 * du texte incrusté par-dessus au moment de l'export.
 *
 * Conséquence de coût, et c'est ce qui décide de l'architecture : la seule
 * chose qui change d'une langue à l'autre est le TEXTE. Les images sont
 * générées UNE fois et partagées par les cinq langues. Un slideshow coûte donc
 * ses N images, et les langues sont gratuites.
 *
 * Même principe que `story-styles.ts` côté vidéo : chaque format porte sa
 * propre architecture de slides, sa règle de première slide et sa chute. Les
 * formats inactifs sont déclarés mais ne sortent jamais du choix, pour qu'on
 * les active un par un après validation.
 */

export type SlideshowFormatId =
  | "quiz"
  | "histoire"
  | "debunk"
  | "classement"
  | "vrai_faux"
  | "echelle";

export type SlideKind = "hook" | "question" | "reponse" | "beat" | "final";

export type SlideshowFormat = {
  id: SlideshowFormatId;
  label: string;
  /** Un format inactif n'est jamais choisi automatiquement. */
  actif: boolean;
  /** Nombre de slides, bornes comprises. */
  slides: { min: number; max: number };
  /** Ce que raconte le format, en une ligne. */
  forme: string;
  /** Règle de la slide 1 : c'est elle qui décide si on swipe. */
  premiereSlide: string;
  /** Enchaînement des slides suivantes. */
  architecture: string;
  /** Ce que doit faire la dernière slide. */
  chute: string;
  /** Catégories de sujets qui appellent ce format. */
  categories: string[];
};

export const SLIDESHOW_FORMATS: SlideshowFormat[] = [
  {
    id: "quiz",
    label: "Le quiz",
    actif: true,
    slides: { min: 9, max: 13 },
    forme:
      "Une série de questions de culture générale, de la plus facile à la plus dure, où le spectateur répond dans sa tête avant de swiper.",
    premiereSlide:
      "La slide 1 annonce le thème, le nombre de questions, et DÉSIGNE CELLE QUI FAIT TOMBER TOUT LE MONDE — c'est ça qui fait swiper. « Six questions d'histoire. Personne ne passe la cinquième. » Jamais « Teste tes connaissances », jamais « Es-tu incollable ». Le thème est nommé, pas suggéré.",
    architecture:
      "Ensuite on alterne strictement QUESTION puis RÉPONSE, une par slide. La question tient en une phrase et se comprend sans contexte. La réponse donne la réponse en trois mots, puis UNE information de plus que le spectateur ne connaissait pas — c'est cette information qui fait la valeur du quiz, pas la question. La difficulté monte : la première question doit être trouvée par presque tout le monde, la dernière par presque personne.",
    chute:
      "La dernière slide donne le barème et une raison de commenter : « 6 sur 6 : tu es une encyclopédie. 3 sur 6 : la moyenne. Moins de 3 : recommence. Dis ton score. » Jamais un « abonne-toi ».",
    categories: ["histoire", "episodes", "science", "espace", "nature", "geo", "pop", "origines"],
  },
  {
    id: "histoire",
    label: "La petite histoire",
    actif: false,
    slides: { min: 7, max: 10 },
    forme: "Un récit vrai, un beat par slide, qu'on lit jusqu'au bout pour savoir la fin.",
    premiereSlide:
      "La slide 1 pose la situation impossible, au présent, sans nommer personne : « Un homme entre dans une banque. Il en ressortira quarante ans plus tard. »",
    architecture:
      "Un beat par slide, dans l'ordre chronologique. Chaque slide finit sur une question ouverte implicite. Les noms, dates et lieux arrivent après la slide 3.",
    chute: "La dernière slide donne le chiffre ou le détail qui recadre tout le récit.",
    categories: ["faits-divers", "personnages", "episodes", "histoire"],
  },
  {
    id: "debunk",
    label: "Le debunk",
    actif: false,
    slides: { min: 6, max: 9 },
    forme: "Une croyance très répandue, démontée preuve par preuve.",
    premiereSlide:
      "La slide 1 énonce la croyance telle que tout le monde la dit, SANS la démentir encore. Le démenti arrive slide 2, en deux mots.",
    architecture:
      "Slide 2 : « C'est faux. » Puis une preuve par slide, de la plus simple à la plus forte. Puis d'où vient le mythe.",
    chute: "La dernière slide dit ce qui est vrai, en une phrase qu'on a envie de répéter.",
    categories: ["mythes", "mysteres", "science", "histoire"],
  },
  {
    id: "classement",
    label: "Le classement",
    actif: false,
    slides: { min: 7, max: 12 },
    forme: "Un top N en compte à rebours, le plus fort en dernier.",
    premiereSlide:
      "La slide 1 annonce le classement et ce qui se joue à la première place, sans la révéler.",
    architecture:
      "Une position par slide, du dernier au premier. Chaque slide donne le chiffre qui justifie la place.",
    chute: "La première place, avec l'écart qui la sépare de la deuxième.",
    categories: ["geo", "nature", "espace", "science"],
  },
  {
    id: "vrai_faux",
    label: "Vrai ou faux",
    actif: false,
    slides: { min: 9, max: 13 },
    forme: "Six affirmations, une par slide, dont le spectateur doit dire si elles sont vraies.",
    premiereSlide:
      "La slide 1 annonce la règle et le piège : « Six affirmations. Trois sont vraies. Lesquelles ? »",
    architecture:
      "Affirmation puis verdict, une slide chacun. Les vraies sont les plus invraisemblables, et c'est le sel du format.",
    chute: "Le compte des bonnes réponses et l'affirmation qui piège tout le monde.",
    categories: ["science", "nature", "histoire", "pop"],
  },
  {
    id: "echelle",
    label: "L'échelle",
    actif: false,
    slides: { min: 7, max: 11 },
    forme: "Du plus petit au plus grand, chaque slide écrase la précédente. Le vertige monte.",
    premiereSlide:
      "La slide 1 part d'une chose familière et minuscule, à taille humaine, pour que la suite ait une référence.",
    architecture:
      "Un cran par slide, chaque cran comparé au précédent par un facteur : « dix fois plus grand que la slide d'avant ».",
    chute: "Le dernier cran, et la première chose familière rappelée pour mesurer la distance.",
    categories: ["espace", "science", "nature", "geo"],
  },
];

const BY_ID = new Map(SLIDESHOW_FORMATS.map((f) => [f.id, f]));

export function slideshowFormatById(id: string | null | undefined): SlideshowFormat | null {
  return (id && BY_ID.get(id as SlideshowFormatId)) || null;
}

/** Formats utilisables en production. */
export function activeSlideshowFormats(): SlideshowFormat[] {
  return SLIDESHOW_FORMATS.filter((f) => f.actif);
}

/**
 * Choisit le format d'un sujet parmi les formats ACTIFS.
 * Déterministe : même sujet, même format, sans aléa. Un format utilisé dans les
 * `recents` est écarté tant qu'il reste un autre format actif.
 */
export function pickSlideshowFormat(
  topic: string,
  category: string | null | undefined,
  recents: string[] = [],
): SlideshowFormat {
  const actifs = activeSlideshowFormats();
  if (!actifs.length) throw new Error("Aucun format de slideshow actif.");

  const cat = (category ?? "").trim();
  const byCategory = actifs.filter((f) => cat && f.categories.includes(cat));
  const pool = byCategory.length ? byCategory : actifs;

  const recent = new Set(recents);
  const fresh = pool.filter((f) => !recent.has(f.id));
  const usable = fresh.length ? fresh : pool;

  let sum = 0;
  for (const ch of topic) sum = (sum + ch.charCodeAt(0)) % 100000;
  return usable[sum % usable.length]!;
}

/**
 * Le texte d'une slide est LU EN UNE SECONDE ET DEMIE sur un téléphone, par
 * dessus une image. Au-delà de cette limite il devient illisible et la slide
 * est perdue. La limite est vérifiée en code, pas seulement demandée au prompt.
 */
export const MAX_MOTS_PAR_SLIDE = 14;

/** Slides dont le texte dépasse la limite, avec leur nombre de mots. */
export function findOverlongSlides(
  slides: { index: number; text: string }[],
  max = MAX_MOTS_PAR_SLIDE,
): { index: number; mots: number }[] {
  return slides
    .map((s) => ({
      index: s.index,
      mots: (s.text ?? "").trim().split(/\s+/).filter(Boolean).length,
    }))
    .filter((s) => s.mots > max);
}

/**
 * Prompt système d'écriture d'un slideshow, pour le format choisi.
 *
 * Les images étant partagées par toutes les langues, l'imagePrompt ne doit
 * contenir NI texte NI rien de propre à une langue.
 */
export function slideshowWritingBrief(format: SlideshowFormat, slideCount: number): string {
  return [
    `Tu écris un SLIDESHOW pour TikTok et Instagram, au format « ${format.label} », en ${slideCount} slides exactement.`,
    `CE QUE RACONTE CE FORMAT : ${format.forme}`,
    "",
    `SLIDE 1 — ${format.premiereSlide}`,
    `ARCHITECTURE — ${format.architecture}`,
    `DERNIÈRE SLIDE — ${format.chute}`,
    "",
    `LONGUEUR, RÈGLE ÉLIMINATOIRE : ${MAX_MOTS_PAR_SLIDE} MOTS MAXIMUM par slide, et viser dix. Le texte est incrusté sur une image et lu en une seconde et demie sur un téléphone. Compte les mots de chaque slide avant de répondre. Une slide trop longue est refusée par le programme et te revient à réécrire.`,
    "MOTS DU QUOTIDIEN, écrits pour quelqu'un de quinze ans. Aucune périphrase, aucun adjectif de remplissage, aucun point d'exclamation, aucun emoji.",
    "INTERDIT sur la slide 1 : « Teste tes connaissances », « Es-tu incollable », « Saviez-vous », « Top 10 », et toute formule qui pourrait coiffer n'importe quel sujet. La slide 1 nomme le sujet.",
    "",
    "L'IMAGE DE CHAQUE SLIDE, et c'est la règle la plus facile à rater :",
    "• Une image par slide, décrite en anglais dans imagePrompt, SANS AUCUN TEXTE, SANS LETTRE, SANS CHIFFRE ni logo — le texte est ajouté par-dessus ensuite.",
    "• L'image ne doit contenir AUCUN élément propre à une langue : elle est partagée par les cinq langues de la production.",
    "• UNE SLIDE QUI POSE UNE QUESTION NE MONTRE JAMAIS SA RÉPONSE. Son image montre la CATÉGORIE, pas le gagnant : pour « quel est l'animal le plus rapide du monde ? », on montre un ciel vide ou une savane, jamais un faucon. Montrer la réponse tue la question et le spectateur swipe sans jouer.",
    "• La slide de réponse, elle, montre la réponse en gros et en entier.",
    "• Sujet unique, énorme, centré, lisible en un tiers de seconde sur un téléphone. Le texte sera incrusté dans le tiers supérieur : garde cette zone visuellement calme, sans détail important.",
    "",
    'Réponds uniquement en JSON : {"title":string,"caption":string,"hashtags":string[],"slides":[{"index":number,"kind":"hook"|"question"|"reponse"|"beat"|"final","text":string,"imagePrompt":string}]} — exactement ' +
      `${slideCount} slides, index de 0 à ${slideCount - 1}, dans l'ordre.`,
  ].join("\n");
}
