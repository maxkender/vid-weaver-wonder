import {
  DEFAULT_MOTION,
  DEFAULT_QUALITY,
  DEFAULT_STYLE_BRIEF,
  DEFAULT_VISUAL_BRIEF,
} from "./style-presets";

export type VideoKind = "faits" | "culture" | "pub";

/** Ton / structure narrative du script. */
export type NarrationStyle = "question" | "revelation" | "storytelling" | "listicle";

/** Direction artistique des visuels. */
export type VisualStyle = "papercraft" | "cinematique" | "documentaire" | "retro";

export type Scene = {
  index: number;
  narration: string;
  overlay: string;
  imagePrompt: string;
  videoPrompt: string;
};

/** Personnage / élément récurrent, décrit une fois et réutilisé à l'identique. */
export type CharacterSheet = { name: string; description: string };

export type Script = {
  title: string;
  hook: string;
  scenes: Scene[];
  cta: string;
  hashtags: string[];
  /** Bible visuelle : personnages, palette et décors constants d'une scène à l'autre. */
  characters?: CharacterSheet[];
  palette?: string;
};

/** Outro par défaut (fallback si l'IA n'en génère pas). */
export const SOPHIA_OUTRO =
  "Ce fait vient de l'application Sophia : des cours simples et gratuits pour booster ta culture générale. Télécharge Sophia, c'est gratuit.";

/** Consignes de CTA : outro adaptée au sujet, orientée téléchargement de l'app. */
export const CTA_BRIEF = [
  "RÈGLE CTA : la dernière scène est TOUJOURS un appel à l'action pour l'application Sophia, mais il doit être RÉÉCRIT et ADAPTÉ au sujet de la vidéo (jamais copié-collé d'une vidéo à l'autre).",
  "Le CTA fait 18 à 30 mots, ton oral et naturel, et suit cette logique : rebond sur le fait qu'on vient de raconter → Sophia (app gratuite de culture générale, cours simples) → invitation claire à TÉLÉCHARGER l'appli maintenant.",
  "Le mot « Sophia » doit être prononcé au moins une fois dans le CTA.",
  "Exemple de forme (à ne pas recopier) : « Des histoires comme ça, Sophia t'en apprend une par jour, gratuitement, en cours de deux minutes. Télécharge l'appli, c'est cadeau. »",
  "Le CTA doit donner envie de télécharger : bénéfice concret, zéro ton publicitaire agressif, zéro emoji.",
].join("\n");

const KIND_BRIEF: Record<VideoKind, string> = {
  faits:
    "Sujet : un fait fascinant, surprenant et vérifiable, raconté comme une petite enquête.",
  culture:
    "Sujet : culture générale par thème (histoire, science, mythologie, espace…), pédagogique mais captivant.",
  pub: "Sujet : un fait fascinant, avec en plus une mention naturelle de l'application Sophia glissée au milieu du script (une phrase, jamais agressive) en plus de l'outro finale.",
};

export function scriptSystemPrompt(
  kind: VideoKind,
  sceneCount: number,
  style: NarrationStyle,
  wordsPerScene = 18,
  styleBriefOverride?: string,
) {
  const lo = Math.max(8, Math.round(wordsPerScene - 4));
  const hi = Math.min(30, Math.round(wordsPerScene + 4));
  return [
    "Tu es un scénariste de vidéos courtes verticales (TikTok / Reels) en français, spécialisé en culture générale.",
    KIND_BRIEF[kind],
    styleBriefOverride?.trim() || DEFAULT_STYLE_BRIEF[style],
    `Produis exactement ${sceneCount} scènes.`,
    "RÈGLE N°1 — LE HOOK : la SCÈNE 1 est toujours un hook très fort, pensé pour TikTok. Elle affirme une chose intrigante, étrange ou dérangeante en 1 ou 2 phrases maximum (moins de 25 mots), et ouvre une boucle de curiosité que la vidéo ne referme qu'à la fin.",
    "Le hook NE CONTIENT AUCUN CHIFFRE, aucune date, aucune statistique, aucun « saviez-vous que », aucune question rhétorique molle, aucun mot d'intro type « aujourd'hui », « voici », « dans cette vidéo ».",
    "Modèles de hooks qui marchent : « Le cyclope de l'Odyssée a vraiment existé, et les Grecs avaient des preuves. », « Pendant des siècles, personne n'a osé ouvrir cette porte. » — affirmation choc, mystère immédiat, zéro préambule.",
    "Le champ hook reprend exactement la première phrase de la scène 1.",
    `RÈGLE N°2 — LONGUEUR STRICTE : chaque scène correspond à UN plan vidéo de 8 secondes maximum. La narration d'une scène fait entre ${lo} et ${hi} MOTS, jamais plus. Une scène plus longue est une erreur.`,
    "Compte réellement les mots de chaque narration avant de répondre. Si c'est trop long, coupe.",
    "Rétention : chaque scène se termine sur une micro-tension (un détail inexpliqué, une contradiction, un « sauf que… ») qui oblige à regarder la suivante. La révélation principale n'arrive jamais avant la dernière scène.",
    "Le script doit être un vrai texte suivi et cohérent : chaque scène enchaîne logiquement sur la précédente, sans répétition, avec des transitions naturelles.",
    "VOCABULAIRE SIMPLE : écris pour quelqu'un de 15 ans. Mots du quotidien uniquement, phrases courtes, zéro jargon, zéro mot savant.",
    "Reste sur des faits simples à comprendre : une seule idée par scène.",
    "Ton : oral, naturel, direct, tutoiement, phrases courtes et rythmées. Zéro emoji.",
    "À partir de la scène 2, donne des détails concrets (lieux, noms, époques). Les chiffres sont autorisés seulement s'ils sont spectaculaires et jamais dans le hook.",
    "Le champ overlay est le texte incrusté à l'écran : 3 à 6 mots, percutant.",
    "",
    "RÈGLE N°3 — COHÉRENCE VISUELLE (très importante) :",
    "Avant d'écrire les scènes, définis une BIBLE VISUELLE dans le champ characters : chaque personnage, animal ou objet qui revient dans plusieurs scènes reçoit une description physique FIXE et très précise en anglais (âge, silhouette, coiffure/barbe, vêtements, COULEURS exactes, accessoires). Exemple : « Odysseus: bearded man, deep red tunic and red cape, dark curly hair and beard, bronze sandals, cream skin tone ».",
    "Le champ palette décrit en anglais la palette de couleurs commune à TOUTE la vidéo (4 à 5 couleurs), et les décors récurrents.",
    "Dans CHAQUE imagePrompt et videoPrompt, tu recopies mot pour mot la description complète du personnage concerné, telle qu'écrite dans characters. Jamais « the same man » : toujours la description entière, identique. Un personnage garde exactement les mêmes couleurs de vêtements du début à la fin.",
    "imagePrompt et videoPrompt DOIVENT être en anglais, très visuels, sans aucun texte dans l'image.",
    "imagePrompt décrit UNE composition simple et lisible : 1 à 3 éléments maximum, une silhouette claire au premier plan, un décor minimal.",
    "N'utilise JAMAIS de noms propres d'œuvres, films, jeux, marques, artistes ou personnages protégés dans imagePrompt et videoPrompt : décris ce qu'on voit.",
    "videoPrompt décrit un mouvement de caméra et une action de 8 secondes maximum.",
    CTA_BRIEF,
    "Le champ cta contient ce CTA Sophia adapté au sujet (texte prêt à être lu à voix haute).",
    'Réponds uniquement en JSON: {"title":string,"hook":string,"characters":[{"name":string,"description":string}],"palette":string,"scenes":[{"index":number,"narration":string,"overlay":string,"imagePrompt":string,"videoPrompt":string}],"cta":string,"hashtags":string[]}',
  ].join("\n");
}

export function scriptUserPrompt(kind: VideoKind, topic: string) {
  const base = topic.trim() || "un fait fascinant surprenant au choix";
  return kind === "pub"
    ? `Sujet : ${base}. Glisse une mention naturelle de l'application Sophia au milieu du script, puis termine par l'outro imposée.`
    : `Sujet : ${base}.`;
}

const SQUARE_FRAME =
  "Framing: the whole scene is composed inside a perfect centered square (1:1) with softly rounded corners, touching the left and right edges; above and below that square the frame is pure solid black, completely empty, like a rounded square clip letterboxed in a vertical canvas. Nothing of the scene spills into the black bands or past the rounded corners.";

export type PromptOverrides = {
  visualBrief?: string | undefined;
  quality?: string | undefined;
  motion?: string | undefined;
  /** Bible visuelle (personnages + palette) à répéter sur chaque plan. */
  bible?: string | undefined;
  /** Contexte narratif : plans précédents et plan suivant. */
  story?: string | undefined;
};

function bibleLine(bible?: string) {
  return bible?.trim()
    ? ` Consistent series bible (identical in every shot of this video): ${bible.trim()}.`
    : "";
}

function storyLine(story?: string) {
  return story?.trim()
    ? ` STORY CONTEXT (this shot is one chapter of a single continuous illustrated story, keep the same world, same characters, same costumes, same palette and a logical visual progression): ${story.trim()}.`
    : "";
}


export function coverPrompt(
  imagePrompt: string,
  visual: VisualStyle = "papercraft",
  square = false,
  o: PromptOverrides = {},
) {
  const brief = o.visualBrief?.trim() || DEFAULT_VISUAL_BRIEF[visual];
  const quality = o.quality?.trim() || DEFAULT_QUALITY[visual];
  return `Vertical 9:16 key frame. ${brief}. ${quality}.${bibleLine(o.bible)} ${
    square ? SQUARE_FRAME + " " : ""
  }Absolutely no text, no letters, no watermark, no logo. Scene: ${imagePrompt}`;
}

export function motionPrompt(
  videoPrompt: string,
  visual: VisualStyle = "papercraft",
  square = false,
  o: PromptOverrides = {},
) {
  const brief = o.visualBrief?.trim() || DEFAULT_VISUAL_BRIEF[visual];
  const quality = o.quality?.trim() || DEFAULT_QUALITY[visual];
  const motion = o.motion?.trim() || DEFAULT_MOTION[visual];
  return `${videoPrompt}. Vertical short-form video. ${brief}. ${quality}.${bibleLine(o.bible)} ${
    square ? SQUARE_FRAME + " The black bands stay perfectly static. " : ""
  }${motion} Consistent art direction, same characters and same colors as the reference image, no on-screen text, no subtitles, no watermark.`;
}

export const TOPIC_BRIEF: Record<NarrationStyle, string> = {
  question:
    "Le sujet doit être une GRANDE QUESTION que beaucoup de gens se sont déjà posée sans jamais avoir la réponse (pourquoi la mer est salée, pourquoi on rêve, pourquoi l'empire romain est tombé…). Formule le sujet comme une question simple.",
  revelation:
    "Le sujet doit être une croyance très répandue ou une histoire connue qui cache un retournement : ce que les gens croient est faux, ou l'explication réelle est bien plus étrange.",
  storytelling:
    "Le sujet doit être une histoire vraie avec des personnages, un lieu et un moment précis, qu'on peut raconter comme une scène vécue.",
  listicle:
    "Le sujet doit être un thème simple qui permet d'enchaîner plusieurs faits surprenants indépendants (le corps humain, l'espace, les animaux, le Moyen Âge…).",
};
