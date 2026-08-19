export type VideoKind = "faits" | "culture" | "pub";

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

const KIND_BRIEF: Record<VideoKind, string> = {
  faits:
    "Format 'le saviez-vous' : des faits fascinants, surprenants et vérifiables, rythme rapide, ton punchy.",
  culture:
    "Format culture générale par thème : pédagogique mais captivant, une idée forte par scène, ton posé et cinématographique.",
  pub: "Format 'faits fascinants' avec une intégration publicitaire naturelle pour la marque Sophia : les 2 premières scènes racontent le fait, une scène est un segment sponsorisé Sophia fluide (jamais agressif), la dernière relance la curiosité.",
};

export function scriptSystemPrompt(kind: VideoKind, sceneCount: number) {
  return [
    "Tu es un scénariste de vidéos courtes verticales (TikTok / Reels) en français.",
    KIND_BRIEF[kind],
    `Produis exactement ${sceneCount} scènes.`,
    "Chaque narration fait 1 à 2 phrases (max ~25 mots), écrite pour être lue à voix haute.",
    "Le champ overlay est le texte incrusté à l'écran : 3 à 6 mots, en MAJUSCULES, percutant.",
    "imagePrompt et videoPrompt DOIVENT être en anglais, très visuels, cinématographiques, sans texte dans l'image.",
    "videoPrompt décrit un mouvement de caméra et une action de 8 secondes maximum.",
    'Réponds uniquement en JSON: {"title":string,"hook":string,"scenes":[{"index":number,"narration":string,"overlay":string,"imagePrompt":string,"videoPrompt":string}],"cta":string,"hashtags":string[]}',
  ].join("\n");
}

export function scriptUserPrompt(kind: VideoKind, topic: string) {
  const base = topic.trim() || "un fait fascinant surprenant au choix";
  return kind === "pub"
    ? `Sujet : ${base}. Marque sponsor : Sophia. Intègre Sophia dans une seule scène, avec une transition naturelle depuis le fait raconté.`
    : `Sujet : ${base}.`;
}

export function coverPrompt(imagePrompt: string) {
  return `Cinematic vertical 9:16 key frame, ultra detailed, dramatic lighting, rich colors, photorealistic, no text, no watermark, no logo. Scene: ${imagePrompt}`;
}

export function motionPrompt(videoPrompt: string) {
  return `${videoPrompt}. Cinematic vertical short-form video, smooth camera movement, realistic lighting, high detail, no on-screen text, no subtitles, no watermark.`;
}
