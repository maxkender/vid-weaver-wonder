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

export type Script = {
  title: string;
  hook: string;
  scenes: Scene[];
  cta: string;
  hashtags: string[];
};

/** Outro imposée, identique sur toutes les vidéos. */
export const SOPHIA_OUTRO =
  "Ce fait est tiré de l'application Sophia, qui améliore ta culture générale gratuitement avec des cours simples et intéressants. Check l'appli si tu veux un parcours personnalisé et pas te perdre dans un océan de culture.";

const KIND_BRIEF: Record<VideoKind, string> = {
  faits:
    "Sujet : un fait fascinant, surprenant et vérifiable, raconté comme une petite enquête.",
  culture:
    "Sujet : culture générale par thème (histoire, science, mythologie, espace…), pédagogique mais captivant.",
  pub: "Sujet : un fait fascinant, avec en plus une mention naturelle de l'application Sophia glissée au milieu du script (une phrase, jamais agressive) en plus de l'outro finale.",
};

const STYLE_BRIEF: Record<NarrationStyle, string> = {
  question:
    "Style « grande question » : ouvre sur un événement connu puis retourne-le en question (« mais savez-vous vraiment… ? »), puis déroule les causes/explications une par une, de façon claire et argumentée.",
  revelation:
    "Style « révélation » : phrases courtes, sèches, percutantes. On avance indice par indice, chaque scène ajoute un détail troublant, et la fin retourne complètement la première impression (« sauf que des siècles plus tard… »).",
  storytelling:
    "Style « récit » : on raconte une scène vécue, avec des personnages, des lieux, des sensations. Présent de narration, immersif, cinématographique.",
  listicle:
    "Style « énumération » : une idée forte et surprenante par scène, enchaînées à un rythme rapide, avec une montée en intensité vers la plus dingue.",
};

const VISUAL_BRIEF: Record<VisualStyle, string> = {
  papercraft:
    "handmade layered paper cut-out diorama photographed head-on, flat frontal composition, stacked planes of matte construction paper with torn deckled edges and visible paper grain, simple bold silhouettes with no fine detail, characters and objects built from flat cut shapes with slight relief, soft diffused studio light casting gentle drop shadows between paper layers, a cohesive limited palette of 4 to 5 flat matte paper colors chosen to fit the mood of this specific scene (warm, cold, earthy, nocturnal… vary freely from scene to scene), no gradients, no realistic textures, no 3D render look, stop-motion paper animation aesthetic, calm and graphic, quiet minimal background of layered paper shapes",
  cinematique:
    "photorealistic cinematic still, anamorphic lens, dramatic volumetric lighting, shallow depth of field, rich film grain, teal and amber grade",
  documentaire:
    "documentary photography look, natural light, realistic textures, muted colors, archival feel, 35mm",
  retro: "retro 1970s film still, faded kodachrome colors, soft grain, slight halation, vintage",
};

export function scriptSystemPrompt(
  kind: VideoKind,
  sceneCount: number,
  style: NarrationStyle,
) {
  return [
    "Tu es un scénariste de vidéos courtes verticales (TikTok / Reels) en français, spécialisé en culture générale.",
    KIND_BRIEF[kind],
    STYLE_BRIEF[style],
    `Produis exactement ${sceneCount} scènes.`,
    "RÈGLE N°1 — LE HOOK : la SCÈNE 1 est toujours un hook très fort, pensé pour TikTok. Elle affirme une chose intrigante, étrange ou dérangeante en 1 ou 2 phrases maximum (moins de 25 mots), et ouvre une boucle de curiosité que la vidéo ne referme qu'à la fin.",
    "Le hook NE CONTIENT AUCUN CHIFFRE, aucune date, aucune statistique, aucun « saviez-vous que », aucune question rhétorique molle, aucun mot d'intro type « aujourd'hui », « voici », « dans cette vidéo ».",
    "Modèles de hooks qui marchent : « Le cyclope de l'Odyssée a vraiment existé, et les Grecs avaient des preuves. », « Pendant des siècles, personne n'a osé ouvrir cette porte. », « Ce tableau cache un détail que son peintre a supplié d'effacer. » — affirmation choc, mystère immédiat, zéro préambule.",
    "Le champ hook reprend exactement la première phrase de la scène 1.",
    "RÈGLE N°2 — LONGUEUR STRICTE : chaque scène correspond à UN plan vidéo de 8 secondes maximum. La narration d'une scène fait donc entre 12 et 22 MOTS (1 à 2 phrases courtes), jamais plus. Une scène de plus de 22 mots est une erreur.",
    "Compte réellement les mots de chaque narration avant de répondre. Si c'est trop long, coupe.",
    "Rétention : chaque scène se termine sur une micro-tension (un détail inexpliqué, une contradiction, un « sauf que… ») qui oblige à regarder la suivante. La révélation principale n'arrive jamais avant la dernière scène.",
    "Le script doit être un vrai texte suivi et cohérent : chaque scène enchaîne logiquement sur la précédente, sans répétition, avec des transitions naturelles.",
    "Ton : oral, naturel, direct, tutoiement, phrases courtes et rythmées. Pas de langue de bois, pas de formules d'IA, pas de « dans cet article ». Zéro emoji.",
    "À partir de la scène 2, donne des détails concrets (lieux, noms, époques). Les chiffres sont autorisés seulement s'ils sont spectaculaires et jamais dans le hook.",
    "Le champ overlay est le texte incrusté à l'écran : 3 à 6 mots, percutant, qui résume le choc de la scène.",
    "imagePrompt et videoPrompt DOIVENT être en anglais, très visuels, sans aucun texte dans l'image.",
    "imagePrompt décrit UNE composition simple et lisible : 1 à 3 éléments maximum, une silhouette claire au premier plan, un décor minimal (collines, ciel, mur uni). Pas de foule, pas de détails minuscules, pas de perspective compliquée.",
    "N'utilise JAMAIS de noms propres d'œuvres, films, jeux, marques, artistes ou personnages protégés dans imagePrompt et videoPrompt : décris ce qu'on voit (« a one-eyed giant figure », « a warrior in red armor holding a spear ») plutôt que de le nommer.",
    "videoPrompt décrit un mouvement de caméra et une action de 8 secondes maximum.",
    `Le champ cta doit être EXACTEMENT ce texte, mot pour mot : "${SOPHIA_OUTRO}"`,
    'Réponds uniquement en JSON: {"title":string,"hook":string,"scenes":[{"index":number,"narration":string,"overlay":string,"imagePrompt":string,"videoPrompt":string}],"cta":string,"hashtags":string[]}',
  ].join("\n");
}

export function scriptUserPrompt(kind: VideoKind, topic: string) {
  const base = topic.trim() || "un fait fascinant surprenant au choix";
  return kind === "pub"
    ? `Sujet : ${base}. Glisse une mention naturelle de l'application Sophia au milieu du script, puis termine par l'outro imposée.`
    : `Sujet : ${base}.`;
}

const QUALITY: Record<VisualStyle, string> = {
  papercraft:
    "shot straight on like a real photograph of a physical paper set, shallow relief depth, crisp paper edges, no digital illustration look, no cartoon outlines, no glossy plastic, no clay",
  cinematique: "ultra detailed, high fidelity",
  documentaire: "ultra detailed, realistic",
  retro: "detailed, analog film look",
};

const SQUARE_FRAME =
  "Framing: the whole scene is composed inside a perfect centered square (1:1) that touches the left and right edges; above and below that square the frame is pure solid black, completely empty, like a square clip letterboxed in a vertical canvas. Nothing of the scene spills into the black bands.";

export function coverPrompt(
  imagePrompt: string,
  visual: VisualStyle = "papercraft",
  square = false,
) {
  return `Vertical 9:16 key frame. ${VISUAL_BRIEF[visual]}. ${QUALITY[visual]}. ${
    square ? SQUARE_FRAME + " " : ""
  }Absolutely no text, no letters, no watermark, no logo. Scene: ${imagePrompt}`;
}

export function motionPrompt(
  videoPrompt: string,
  visual: VisualStyle = "papercraft",
  square = false,
) {
  return `${videoPrompt}. Vertical short-form video. ${VISUAL_BRIEF[visual]}. ${QUALITY[visual]}. ${
    square ? SQUARE_FRAME + " The black bands stay perfectly static. " : ""
  }${
    visual === "papercraft"
      ? "Stop-motion paper animation: the paper cut-outs move in small discrete steps, slight handmade jitter, layers sliding over each other, static or very slow push-in camera."
      : "Subtle smooth camera movement."
  } Consistent art direction, no on-screen text, no subtitles, no watermark.`;
}

