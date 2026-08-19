/** Catégories de sujets proposables par l'IA (partagé UI + serveur). */
export const TOPIC_CATEGORIES = [
  {
    id: "aleatoire",
    label: "Aléatoire",
    brief: "",
  },
  {
    id: "histoire",
    label: "Grande question d'histoire",
    brief:
      "une grande question d'histoire que tout le monde s'est déjà posée (chute d'un empire, origine d'une guerre, mystère d'un roi…), racontée par un détail méconnu",
  },
  {
    id: "faits-divers",
    label: "Faits divers",
    brief:
      "un fait divers réel, étrange ou spectaculaire (disparition, braquage improbable, coïncidence folle), raconté comme une petite enquête",
  },
  {
    id: "mythes",
    label: "Mythes & légendes",
    brief:
      "une légende ou un mythe (Odyssée, Atlantide, loups-garous, créatures…) et son origine réelle expliquée par des faits",
  },
  {
    id: "science",
    label: "Science du quotidien",
    brief:
      "un fait scientifique du quotidien (corps humain, météo, physique simple) expliqué avec des mots simples",
  },
  {
    id: "espace",
    label: "Espace & univers",
    brief: "l'espace et l'univers, un fait vertigineux expliqué simplement",
  },
  {
    id: "nature",
    label: "Animaux & nature",
    brief: "un animal ou un phénomène naturel avec un comportement incroyable mais vrai",
  },
  {
    id: "geo",
    label: "Géographie",
    brief:
      "la géographie : une frontière, une île, un fleuve, une ville ou un pays avec une bizarrerie surprenante",
  },
  {
    id: "pop",
    label: "Films & pop culture",
    brief:
      "un film, une série ou un jeu très connu : expliquer le vrai fait historique ou scientifique qui se cache derrière",
  },
  {
    id: "origines",
    label: "Origines des choses",
    brief:
      "l'origine surprenante d'un objet, d'un mot, d'un sport, d'un plat ou d'une habitude que tout le monde connaît",
  },
  {
    id: "personnages",
    label: "Personnages célèbres",
    brief: "un personnage célèbre vu sous un angle inattendu, avec un détail méconnu de sa vie",
  },
  {
    id: "mysteres",
    label: "Mystères non résolus",
    brief: "un mystère non résolu ou une théorie célèbre, expliqué avec des faits vérifiables",
  },
] as const;

export type TopicCategory = (typeof TOPIC_CATEGORIES)[number]["id"];

export const TOPIC_CATEGORY_IDS = TOPIC_CATEGORIES.map((c) => c.id) as [
  TopicCategory,
  ...TopicCategory[],
];
