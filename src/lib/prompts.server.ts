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
    "handmade layered paper craft diorama, cut-paper collage, matte textured paper, torn paper edges, visible paper fibers, soft studio shadows, limited palette of deep navy blue, terracotta red, bone white and warm brown, stop-motion look",
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
    "IMPORTANT — longueur : chaque narration fait 3 à 5 phrases (40 à 70 mots). Le script complet doit tenir entre 45 et 90 secondes de lecture à voix haute.",
    "Le script doit être un vrai texte suivi et cohérent : chaque scène enchaîne logiquement sur la précédente, sans répétition, avec des transitions naturelles.",
    "Ton : oral, naturel, direct, tutoiement, phrases courtes et rythmées. Pas de langue de bois, pas de formules d'IA, pas de « dans cet article ». Zéro emoji.",
    "Donne des détails concrets : dates, lieux, noms, chiffres. Le spectateur doit apprendre quelque chose de précis.",
    "Le champ overlay est le texte incrusté à l'écran : 3 à 6 mots, percutant, qui résume le choc de la scène.",
    "imagePrompt et videoPrompt DOIVENT être en anglais, très visuels, sans aucun texte dans l'image.",
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

export function coverPrompt(imagePrompt: string, visual: VisualStyle = "papercraft") {
  return `Vertical 9:16 key frame, ${VISUAL_BRIEF[visual]}, ultra detailed, no text, no watermark, no logo. Scene: ${imagePrompt}`;
}

export function motionPrompt(videoPrompt: string, visual: VisualStyle = "papercraft") {
  return `${videoPrompt}. Vertical short-form video, ${VISUAL_BRIEF[visual]}, subtle smooth camera movement, consistent art direction, no on-screen text, no subtitles, no watermark.`;
}
