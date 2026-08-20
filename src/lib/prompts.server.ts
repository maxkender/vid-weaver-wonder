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
  "RÈGLE ABSOLUE : le mot « Sophia » apparaît EXACTEMENT UNE FOIS dans tout le script (CTA compris). Jamais deux fois. Dans le reste du CTA, dis « l'appli » ou « l'application », jamais à nouveau le nom.",
  "Exemple de forme (à ne pas recopier) : « Des histoires comme ça, Sophia t'en apprend une par jour, gratuitement, en cours de deux minutes. Télécharge l'appli, c'est cadeau. »",
  "Le CTA doit donner envie de télécharger : bénéfice concret, zéro ton publicitaire agressif, zéro emoji.",
].join("\n");

const KIND_BRIEF: Record<VideoKind, string> = {
  faits:
    "Sujet : un fait fascinant, surprenant et vérifiable, raconté comme une petite enquête.",
  culture:
    "Sujet : culture générale par thème (histoire, science, mythologie, espace…), pédagogique mais captivant.",
  pub: "Sujet : un fait fascinant. La marque Sophia n'est nommée qu'une seule fois dans toute la vidéo, dans l'outro finale.",
};


export function scriptSystemPrompt(
  kind: VideoKind,
  sceneCount: number,
  style: NarrationStyle,
  wordsPerScene = 18,
  styleBriefOverride?: string,
  totalWords?: number,
) {
  const lo = Math.max(8, Math.round(wordsPerScene - 3));
  const hi = Math.min(26, Math.round(wordsPerScene + 3));
  return [
    "Tu es un scénariste de vidéos courtes verticales (TikTok / Reels) en français, spécialisé en culture générale.",
    KIND_BRIEF[kind],
    styleBriefOverride?.trim() || DEFAULT_STYLE_BRIEF[style],
    `Produis exactement ${sceneCount} scènes.`,
    totalWords
      ? `RÈGLE N°0 — DURÉE : le script complet (scènes + CTA) doit faire environ ${totalWords} mots au total, avec une marge de 5 % maximum. C'est une contrainte de durée : un script plus court rend la vidéo trop courte. Compte les mots avant de répondre et complète si tu es en dessous.`
      : "",
    "RÈGLE N°1 — LE HOOK (la partie la plus importante) : la SCÈNE 1 est UNE SEULE phrase, 8 à 16 mots maximum, qui se lit en moins de 4 secondes.",
    "Le hook doit S'APPUYER SUR QUELQUE CHOSE QUE LE SPECTATEUR CONNAÎT DÉJÀ : un lieu, un monument, un animal, un objet du quotidien, un personnage ou une histoire célèbre. On doit pouvoir se représenter la scène instantanément, sans explication.",
    "Le hook est une affirmation choc, immédiatement compréhensible par TOUT LE MONDE (un ado, quelqu'un qui ne connaît rien au sujet) : zéro nom compliqué, zéro contexte préalable, zéro mot rare.",
    "Test de validation du hook : en l'entendant, on doit se dire « ah, ça je connais… mais ça, je ne savais pas ». Curiosité immédiate + envie de rester pour la réponse.",
    "Le hook NE CONTIENT AUCUN CHIFFRE, aucune date, aucune statistique, aucun « saviez-vous que », aucune question rhétorique molle, aucun mot d'intro type « aujourd'hui », « voici », « dans cette vidéo », « imagine ».",
    "Modèles de hooks qui marchent : « Pendant mille ans, personne n'a osé ouvrir cette porte. », « Ce monstre de légende a vraiment existé, et on a retrouvé son crâne. », « Cette ville a disparu en une nuit, et personne ne l'a vue partir. » — affirmation choc, mystère immédiat, zéro préambule.",
    "Le champ hook reprend exactement la phrase de la scène 1.",
    "TEST DU HOOK EN 2 SECONDES : le hook doit être compréhensible SANS la moindre connaissance préalable. Interdits absolus : un nom propre inconnu du grand public, un lieu obscur, un pronom sans référent (« il », « ce », « cette »), une formule vague (« ce jour-là », « cet objet », « cette armée »). Si on doit attendre la scène 2 pour comprendre de QUOI on parle, le hook est raté : réécris-le.",
    "SCÈNE 2 : elle plante le décor en une phrase (qui, où, quand) puis relance la tension (« sauf que… », « le problème, c'est que… »).",
    "RÈGLE D'ANCRAGE (obligatoire) : l'ÉPOQUE (année ou décennie explicite, ex. « en 1870 », « au Moyen Âge »), le LIEU (ville ou pays nommé) et les PROTAGONISTES (nom du peuple, du pays, de l'armée, de la personne) sont dits EXPLICITEMENT au plus tard à la scène 2, puis rappelés au moins une fois plus loin. Jamais « une armée », « un roi », « un pays » : toujours « l'armée prussienne », « Louis XIV », « la France ».",
    "DÉTAILS CONCRETS : chaque scène apporte au moins un détail précis et vérifiable (date, chiffre marquant, nom, durée, distance) qui rend l'histoire vivante. Un script sans dates ni noms est un mauvais script.",

    `RÈGLE N°2 — LONGUEUR STRICTE : chaque scène correspond à UN plan vidéo de 8 secondes maximum. La narration d'une scène fait entre ${lo} et ${hi} MOTS, jamais plus. Une scène plus longue est une erreur.`,
    "Compte réellement les mots de chaque narration avant de répondre. Si c'est trop long, coupe ; si c'est trop court, développe.",
    "CLARTÉ AVANT TOUT : on doit comprendre l'histoire même sans les images. Nomme explicitement de qui et de quoi on parle dans chaque scène (jamais « il », « ça », « cette chose » sans que le nom ait été dit juste avant). Le lieu et l'époque sont donnés dès la scène 2.",
    "STORYTELLING CLAIR ET CONCIS : une seule idée par scène, phrases de 6 à 12 mots, sujet-verbe-complément, aucune subordonnée compliquée, aucun adjectif décoratif. Chaque phrase apporte une information nouvelle : si on peut la supprimer sans rien perdre, supprime-la.",
    "FIL LOGIQUE : le script doit se lire comme un seul paragraphe suivi. Chaque scène répond à la question posée par la précédente et en pose une nouvelle. Avant-dernière scène = la révélation qui explique tout, sans rien laisser d'inexpliqué.",
    "TEST D'INTELLIGIBILITÉ (obligatoire avant de répondre) : relis le script d'une traite comme si tu l'entendais pour la première fois. Chaque nom, lieu, époque et enjeu doit être introduit avant d'être utilisé ; aucune ellipse, aucun saut de logique, aucune scène qui suppose une connaissance préalable. Si une phrase peut être mal comprise, réécris-la plus simplement.",
    "UN SEUL CTA : le CTA Sophia est écrit UNIQUEMENT dans le champ cta. Aucune scène du tableau scenes ne doit parler de l'appli, de téléchargement ou de cours gratuits.",

    "Rétention : chaque scène se termine sur une micro-tension (un détail inexpliqué, une contradiction, un « sauf que… ») qui oblige à regarder la suivante.",
    "Le script doit être un vrai texte suivi et cohérent : chaque scène enchaîne logiquement sur la précédente, sans répétition, avec des transitions naturelles.",
    "VOCABULAIRE SIMPLE : écris pour quelqu'un de 15 ans. Mots du quotidien uniquement, phrases courtes, zéro jargon, zéro mot savant.",
    "Reste sur des faits simples à comprendre : une seule idée par scène.",
    "Ton : oral, naturel, direct, tutoiement, phrases courtes et rythmées. Zéro emoji.",
    "À partir de la scène 2, donne des détails concrets (lieux, noms, époques). Les chiffres sont autorisés seulement s'ils sont spectaculaires et jamais dans le hook.",
    "Le mot « Sophia » ne doit apparaître qu'une seule fois dans TOUT le script, et uniquement dans le CTA final.",
    "Le champ overlay est le texte incrusté à l'écran : 3 à 6 mots, percutant.",

    "",
    "RÈGLE N°3 — COHÉRENCE VISUELLE (très importante) :",
    "Avant d'écrire les scènes, définis une BIBLE VISUELLE dans le champ characters : chaque personnage, animal ou objet qui revient dans plusieurs scènes reçoit une description physique FIXE et très précise en anglais (âge, silhouette, coiffure/barbe, vêtements, COULEURS exactes, accessoires). Exemple : « Odysseus: bearded man, deep red tunic and red cape, dark curly hair and beard, bronze sandals, cream skin tone ».",
    "Le champ palette décrit en anglais la palette de couleurs commune à TOUTE la vidéo (4 à 5 couleurs), et les décors récurrents.",
    "Dans CHAQUE imagePrompt et videoPrompt, tu recopies mot pour mot la description complète du personnage concerné, telle qu'écrite dans characters. Jamais « the same man » : toujours la description entière, identique. Un personnage garde exactement les mêmes couleurs de vêtements du début à la fin.",
    "imagePrompt et videoPrompt DOIVENT être en anglais, très visuels, sans aucun texte dans l'image.",
    "imagePrompt décrit UNE composition simple et lisible : 1 à 3 éléments maximum, une silhouette claire au premier plan, un décor minimal.",
    "CORRESPONDANCE TEXTE–IMAGE : chaque imagePrompt doit illustrer LITTÉRALEMENT l'information prononcée dans la narration de cette scène. Reprends les personnes, objets, lieu et action réellement cités ; n'ajoute aucun symbole abstrait ou décor sans rapport.",
    "PROGRESSION VISUELLE : traite les scènes comme un storyboard continu. Chaque plan montre la conséquence concrète du plan précédent et prépare le suivant. Change le cadrage, pas arbitrairement le lieu, l'époque, les costumes ou les personnages.",
    "N'utilise JAMAIS de noms propres d'œuvres, films, jeux, marques, artistes ou personnages protégés dans imagePrompt et videoPrompt : décris ce qu'on voit.",
    "videoPrompt anime uniquement les éléments visibles dans imagePrompt et décrit une action simple qui rend la narration immédiatement compréhensible, avec un mouvement de caméra discret, en 8 secondes maximum. Aucun nouvel objet, personnage ou événement.",
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
  return `Vertical 9:16 key frame. ${brief}. ${quality}.${bibleLine(o.bible)}${storyLine(o.story)} ${
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
  return `${videoPrompt}. Vertical short-form video. ${brief}. ${quality}.${bibleLine(o.bible)}${storyLine(o.story)} ${
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
