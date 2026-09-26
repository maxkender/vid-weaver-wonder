/**
 * LES SEPT FORMES D'HISTOIRE (papier v2 uniquement).
 *
 * Avant ce module, un seul brief d'écriture servait à tous les sujets : une
 * seule règle d'accroche, un seul déroulé, un tutoiement imposé partout. Deux
 * vidéos de suite se ressemblaient forcément, et une histoire racontée à la
 * troisième personne devenait une leçon adressée au spectateur.
 *
 * Les sept formes ci-dessous sont RELEVÉES sur le corpus de référence de la
 * chaîne (les neuf scripts validés par le client), pas inventées. Chacune porte
 * sa propre règle de PREMIER MOT, sa propre architecture et sa propre chute.
 * Le tutoiement n'est autorisé que par la forme dont le sujet EST le spectateur.
 */

export type StoryStyleId =
  | "fiction_verifiee"
  | "limite_physique"
  | "enquete"
  | "mecanisme"
  | "destin"
  | "corps"
  | "actualite";

export type StoryStyle = {
  id: StoryStyleId;
  /** Nom court, affiché dans le studio et écrit dans le journal du job. */
  label: string;
  /** Le « tu » n'est permis que si le sujet est le corps ou la vie du spectateur. */
  tutoiement: boolean;
  /** Ce que la forme raconte, en une ligne. */
  forme: string;
  /** Règle d'accroche propre à la forme, premier mot compris. */
  accroche: string;
  /** Ouvertures du corpus de référence, mot pour mot. */
  exemples: string[];
  /** Architecture du déroulé, après l'accroche. */
  deroule: string;
  /** Ce que doit faire la dernière phrase. */
  chute: string;
  /** Catégories de sujets qui appellent cette forme en priorité. */
  categories: string[];
};

export const STORY_STYLES: StoryStyle[] = [
  {
    id: "fiction_verifiee",
    label: "La fiction vérifiée",
    tutoiement: false,
    forme:
      "On part d'une œuvre que tout le monde connaît (film, série, jeu, personnage) et on montre le vrai qui se cache derrière.",
    accroche:
      "LE PREMIER MOT EST LE NOM CÉLÈBRE. La première phrase nomme l'œuvre ou le personnage, puis affirme quelque chose de spectaculaire à son sujet. La deuxième phrase dit où se trouve la vérité, sans la donner entièrement.",
    exemples: [
      "« Le Spider Sense de Spider-Man n'a pas été inventé. Il a été copié sur les vraies araignées. Et dans la nature, il fonctionne encore mieux que dans le film. »",
      "« La scène où Spider-Man arrête un train est peut-être le moment le plus scientifiquement correct du cinéma de super-héros. »",
    ],
    deroule:
      "On quitte la fiction dès le deuxième plan et on ne raconte plus que le réel : l'organe, le matériau, le phénomène, avec ses chiffres. On revient à l'œuvre une seule fois, à la fin.",
    chute:
      "La chute met la fiction et le réel face à face, et c'est le réel qui gagne : « Une araignée de quelques millimètres fabrique en silence ce que nos meilleures usines ne savent pas copier. »",
    categories: ["pop", "mythes", "personnages"],
  },
  {
    id: "limite_physique",
    label: "La limite physique",
    tutoiement: false,
    forme:
      "Quelqu'un a fait le calcul, et une règle dure de la nature bloque tout. On donne la règle, puis on l'applique jusqu'à l'absurde.",
    accroche:
      "LE PREMIER MOT EST LA PROUESSE OU LE POUVOIR dont on parle. La première phrase annonce qu'une chose précise est impossible, ou possible, et que c'est mesuré. Aucun suspense sur le QUOI : toute la tension porte sur le COMBIEN.",
    exemples: [
      "« De tous les pouvoirs de Spider-Man, un seul est vraiment impossible : grimper au mur. »",
      "« Un fil épais comme un simple crayon pourrait retenir une voiture lancée à pleine vitesse. »",
    ],
    deroule:
      "Les chiffres du calcul arrivent tôt et ils sont absurdes (pointure 145, 40 % du corps). Puis on donne la RÈGLE en une phrase simple, et on descend l'échelle des animaux ou des tailles jusqu'au point de rupture.",
    chute:
      "La chute pose les deux cas côte à côte, en phrases nominales : « Une araignée peut grimper. Une araignée de 70 kilos, non. »",
    categories: ["pop", "science", "nature", "espace"],
  },
  {
    id: "enquete",
    label: "L'enquête",
    tutoiement: false,
    forme:
      "Une chose qu'on croyait inventée existe vraiment. Un homme la cherche, creuse, et trouve. On avance couche par couche.",
    accroche:
      "LE PREMIER MOT EST L'OBJET DE LA CROYANCE (la ville, le monstre, l'objet). La première phrase affirme platement qu'elle est réelle. La deuxième dit que tout le monde en doutait, et nomme celui qui a cherché.",
    exemples: [
      "« La ville de Troie a vraiment existé. Tout le monde la croyait inventée, jusqu'à ce qu'un marchand allemand, obsédé par Homère, creuse en suivant le texte comme une carte et la trouve. »",
      "« Le Cyclope de l'Odyssée a une origine bien réelle. Les Grecs avaient des preuves : de vrais crânes géants percés d'un trou unique. »",
    ],
    deroule:
      "On suit la méthode de celui qui cherche, pas ses états d'âme. Ce qu'il lit, où il pose le doigt, ce qu'il sort de terre. Les preuves arrivent une par une et de plus en plus précises, jusqu'à une date ou un détail qui colle exactement à la légende.",
    chute:
      "La chute sépare ce qui reste une légende de ce qui est établi : « Le cheval, Achille, Hélène, ça, c'est peut-être la légende. Mais la ville, la guerre, les flammes, elles sont là, sous la colline. »",
    categories: [
      "mysteres",
      "mythes",
      "histoire",
      "origines",
      "episodes",
      "geo",
      "faits-divers",
    ],
  },
  {
    id: "mecanisme",
    label: "Le mécanisme qui s'emballe",
    tutoiement: false,
    forme:
      "Une chose franchit un seuil et se met à se nourrir elle-même. On montre la boucle qui se referme.",
    accroche:
      "LE PREMIER MOT EST LA CHOSE ELLE-MÊME. La première phrase dit ce qu'elle devient une fois le seuil franchi, dans une formule qui tient debout seule.",
    exemples: [
      "« Un incendie assez grand ne subit plus la météo, il fabrique la sienne. »",
      "« Le soleil s'est éteint pendant dix-huit mois. »",
    ],
    deroule:
      "Étape par étape, dans l'ordre physique, chaque étape provoquant la suivante. Au milieu, une relance très courte (« Comment c'est possible ? ») suivie de l'explication en deux phrases. La boucle doit se refermer explicitement : « Le feu nourrit le nuage, le nuage nourrit le feu. »",
    chute:
      "La chute change la catégorie de la chose : « À ce stade, ce n'est plus un incendie qu'on combat. C'est un système météo. »",
    categories: ["science", "nature", "espace", "geo", "origines"],
  },
  {
    id: "destin",
    label: "Le destin",
    tutoiement: false,
    forme:
      "Un homme, des dates, des heures, une décision. Du récit, presque aucune explication.",
    accroche:
      "LE PREMIER MOT EST L'HOMME OU LE FAIT IMPOSSIBLE — « Un homme… », « Une adolescente… », « Le soleil… ». La première phrase énonce le fait que personne ne croit. La deuxième donne l'écart qui le rend pire : trois jours, deux villes, quatre cent trente-huit jours.",
    exemples: [
      "« Un homme a vu les deux bombes atomiques. Les deux. À trois jours d'écart, dans deux villes différentes. »",
      "« Un homme a passé quatre cent trente-huit jours à dériver dans le Pacifique. Il est rentré vivant. »",
    ],
    deroule:
      "Au passé, dans l'ordre où ça s'est passé, avec ce qu'il risquait. Un détail concret et minuscule tôt dans le récit (un tampon oublié, un plateau tournant, une pièce de monnaie) : c'est lui qui rend l'histoire vraie. Aucune morale en route, aucune explication scientifique.",
    chute:
      "La chute ramène un chiffre ou une date qui recadre tout : « Environ 165 personnes étaient dans les deux villes ces jours-là. Lui est le seul que le Japon ait officiellement reconnu. »",
    categories: ["faits-divers", "personnages", "episodes", "histoire", "mysteres"],
  },
  {
    id: "corps",
    label: "Le corps du spectateur",
    tutoiement: true,
    forme:
      "Le sujet est littéralement son corps, sa tête, sa mémoire ou sa vie. C'est la SEULE forme où le « tu » est autorisé.",
    accroche:
      "LE PREMIER MOT EST LA SENSATION QU'IL CONNAÎT DÉJÀ, ou la partie de lui dont on parle — « Ton cerveau… », « Plus tu grandis… », « Ta voix… ». La première phrase énonce la sensation comme un fait. La deuxième promet qu'il y a une raison, et parfois un moyen d'agir.",
    exemples: [
      "« Plus tu grandis, plus le temps passe vite. Il y a une vraie raison à ça et il existe même un moyen de le ralentir. »",
      "« Ton cerveau coupe exprès tes muscles. Pendant ton sommeil, ta zone motrice s'allume comme pour sprinter. »",
    ],
    deroule:
      "Au présent, du début à la fin. Au moins une phrase le renvoie à un moment précis de sa propre vie (« Souviens-toi d'un été quand tu avais huit ans », « le message envoyé à deux heures du matin »). Le mécanisme vient se coller sur cette scène, jamais l'inverse.",
    chute:
      "La chute se retourne vers lui et lui laisse quelque chose : « Tu ne peux pas ajouter des années à ta vie, mais tu peux rendre chaque année plus longue. »",
    categories: [],
  },
  {
    id: "actualite",
    label: "L'actualité expliquée",
    tutoiement: false,
    forme:
      "Un événement qui vient d'arriver, puis pourquoi il va revenir. Le « nous » collectif remplace le « tu ».",
    accroche:
      "LE PREMIER MOT DÉSIGNE L'ÉVÉNEMENT — « Cette tornade… », « Ce séisme… ». La première phrase dit qu'il annonce quelque chose de plus large.",
    exemples: [
      "« Cette tornade qui vient de frapper la France pourrait être un avant-goût de ce qui nous attend dans les prochaines années. »",
    ],
    deroule:
      "On liste les conditions nécessaires, une par plan, dans l'ordre où elles s'empilent. Puis on dit laquelle est en train de changer, et pourquoi.",
    chute:
      "La chute reste honnête sur ce qu'on ne sait pas encore, et c'est ça qui la rend crédible : « On ne sait pas encore si la France connaîtra plus de tornades, mais les conditions qui les produisent, elles, deviennent plus favorables. »",
    categories: [],
  },
];

const BY_ID = new Map(STORY_STYLES.map((s) => [s.id, s]));

export function storyStyleById(id: string | null | undefined): StoryStyle | null {
  return (id && BY_ID.get(id as StoryStyleId)) || null;
}

/**
 * OUVERTURES INTERDITES : un premier mot vide coûte deux secondes d'attention.
 * Le premier mot doit être le sujet de l'histoire.
 */
export const WEAK_OPENINGS = [
  "il existe",
  "il y a",
  "il était",
  "on pense",
  "on croit",
  "on dit",
  "on raconte",
  "on imagine",
  "on s'imagine",
  "c'est",
  "ce sont",
  "cela",
  "ça a commencé",
  "dans les",
  "dans un",
  "dans une",
  "dans le",
  "dans la",
  "en réalité",
  "beaucoup de gens",
  "la plupart des gens",
  "tout le monde pense",
  "tout le monde croit",
  "saviez-vous",
  "savais-tu",
  "imagine",
  "imaginez",
  "voici",
  "selon",
  "depuis",
  "pendant longtemps",
  "aujourd'hui",
  "à l'époque",
  "au début",
];

function normalize(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Renvoie l'ouverture faible détectée en tête de texte, sinon null.
 * Pur, sans effet de bord : la décision d'agir appartient à l'appelant.
 */
export function findWeakOpening(text: string): string | null {
  const head = normalize(text).replace(/^[«"“\-–—\s]+/, "");
  if (!head) return null;
  for (const bad of WEAK_OPENINGS) {
    const seq = normalize(bad);
    if (head === seq || head.startsWith(`${seq} `) || head.startsWith(`${seq}'`)) return bad;
  }
  // Une année ou une date en ouverture : déjà interdit par le brief, vérifié ici.
  if (/^(en |vers |le )?\d{3,4}\b/.test(head)) return "une date en ouverture";
  return null;
}

/** Le sujet parle-t-il du spectateur lui-même ? Signal porté par le sujet. */
export function topicParleDuSpectateur(topic: string): boolean {
  const t = normalize(topic);
  return /\b(tu|t'|ton|ta|tes|toi)\b/.test(t);
}

/**
 * Choisit la forme d'histoire d'un sujet.
 *
 * Règle 1 : un sujet écrit à la deuxième personne est le corps du spectateur.
 * Règle 2 : sinon la catégorie décide, parmi les formes qui la revendiquent.
 * Règle 3 : une forme utilisée dans les `recents` est écartée — deux vidéos de
 *           suite ne peuvent pas partager la même architecture.
 */
export function pickStoryStyle(
  topic: string,
  category: string | null | undefined,
  recents: string[] = [],
): StoryStyle {
  if (topicParleDuSpectateur(topic)) return BY_ID.get("corps")!;

  const cat = (category ?? "").trim();
  const byCategory = STORY_STYLES.filter((s) => cat && s.categories.includes(cat));
  const pool = byCategory.length
    ? byCategory
    : STORY_STYLES.filter((s) => s.id !== "corps" && s.id !== "actualite");

  const recent = new Set(recents);
  const general = STORY_STYLES.filter((s) => s.id !== "corps" && s.id !== "actualite");
  // Une catégorie ne portant qu'une seule forme ne doit pas faire répéter cette
  // forme : on élargit alors à toutes les formes générales avant de renoncer.
  const usable =
    pool.filter((s) => !recent.has(s.id)).length > 0
      ? pool.filter((s) => !recent.has(s.id))
      : general.filter((s) => !recent.has(s.id)).length > 0
        ? general.filter((s) => !recent.has(s.id))
        : pool;

  // Choix déterministe à partir du sujet : même sujet, même forme, sans aléa.
  let sum = 0;
  for (const ch of topic) sum = (sum + ch.charCodeAt(0)) % 100000;
  return usable[sum % usable.length]!;
}

/** Bloc de prompt propre à la forme choisie, placé en tête du brief v2. */
export function storyStyleBrief(style: StoryStyle): string {
  return [
    `FORME DE L'HISTOIRE IMPOSÉE POUR CETTE VIDÉO : ${style.label.toUpperCase()}. Cette forme prime sur toute autre consigne de ton ou de structure. Tu écris « ${style.id} » au début de hookChoice.`,
    `CE QUE RACONTE CETTE FORME : ${style.forme}`,
    "",
    `ACCROCHE (plan 1) — ${style.accroche}`,
    "RÈGLE DU PREMIER MOT, ÉLIMINATOIRE ET COMMUNE À TOUTES LES FORMES : le premier mot du script est le SUJET de l'histoire, un nom concret ou un nom propre. Sont interdits en ouverture, quelle qu'en soit la tournure : " +
      WEAK_OPENINGS.join(", ") +
      ", et toute année ou date en chiffres. « Il existe une année que les historiens appellent la pire année pour être en vie » est raté : deux mots pour rien avant d'arriver au sujet. « Le soleil s'est éteint pendant dix-huit mois » est juste.",
    "L'accroche fait DEUX phrases courtes, 20 à 30 mots au total, et reste compréhensible sans aucune connaissance préalable.",
    "",
    "OUVERTURES DE RÉFÉRENCE DE CETTE FORME (mot pour mot, à relire avant d'écrire) :",
    ...style.exemples.map((e) => `• ${e}`),
    "",
    `DÉROULÉ PROPRE À CETTE FORME : ${style.deroule}`,
    `CHUTE PROPRE À CETTE FORME : ${style.chute}`,
    "",
    style.tutoiement
      ? "PERSONNE : le « tu » est autorisé et attendu du début à la fin — le sujet, c'est lui."
      : "PERSONNE — RÈGLE ÉLIMINATOIRE : AUCUN « tu », « ton », « ta », « tes », « toi » dans tout le script. Cette histoire ne parle pas du spectateur, elle se raconte à la troisième personne, avec « on » ou « nous » pour l'humanité. Six des neuf scripts de référence de la chaîne n'emploient pas une seule fois le « tu » : Troie, le Cyclope, la soie d'araignée, le mégafeu, les super-centenaires, la tornade. Une histoire adressée au spectateur devient une leçon et il décroche.",
    "",
    "PRÉCISION CONTRE VULGARISATION : le mot exact retient mieux que le mot simplifié. Tu nommes la chose (trichobothries, pyrocumulonimbus, Hisarlik) et tu passes à la suite en une incise de quelques mots — tu ne consacres pas une phrase entière à expliquer un mot, et tu n'aplatis pas un terme précis en périphrase enfantine. C'est la précision qui fait rester, pas la simplification.",
  ].join("\n");
}
