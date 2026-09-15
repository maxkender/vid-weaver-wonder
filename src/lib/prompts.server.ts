import {
  DEFAULT_HOOK_BRIEF,
  DEFAULT_LANGUAGE_BRIEF,
  DEFAULT_MOTION,
  DEFAULT_QUALITY,
  DEFAULT_STYLE_BRIEF,
  DEFAULT_VISUAL_BRIEF,
} from "./style-presets";

export type VideoKind = "faits" | "culture" | "pub";

/** Ton / structure narrative du script. */
export type NarrationStyle =
  | "question"
  | "revelation"
  | "storytelling"
  | "listicle"
  | "mecanique";

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
  /** Les trois accroches proposées par l'IA (la retenue devient le plan 1). */
  hookOptions?: string[];
  /** Justification en une ligne du choix d'accroche, affichée dans le studio. */
  hookChoice?: string;
  scenes: Scene[];
  /** Message clair quand la longueur reste hors cible après les 3 passes. */
  lengthNote?: string;
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


/** Trois exemples verbatim de scripts qui fonctionnent : modèles de ton et de rythme. */
const REFERENCE_EXAMPLES = [
  "EXEMPLES DE RÉFÉRENCE (modèles de TON et de RYTHME à imiter, jamais à recopier ni à réutiliser comme sujet) :",
  "EXEMPLE 1 — « Le Spider Sense de Spider-Man n'a pas été inventé. Il a été copié sur les vraies araignées. Et dans la nature, il fonctionne encore mieux que dans le film. Leurs pattes sont couvertes de poils sensoriels ultra-fins, les trichobothries. Ils ne détectent pas le contact, ils détectent l'air. Le moindre déplacement d'air autour d'elle fait vibrer ses poils. Un insecte qui approche ? Une main qui descend ? La sensibilité est telle qu'ils réagissent à des mouvements d'air 1000 fois plus faibles que ce que ton oreille peut percevoir. Résultat : une araignée sait qu'on arrive avant de nous voir. Elle sent le danger arriver dans le vide. Un système d'alerte de proximité câblé dans 8 pattes. »",
  "EXEMPLE 2 — « Le Cyclope de l'Odyssée a une origine bien réelle. Les Grecs avaient des preuves : de vrais crânes géants percés d'un trou unique. Dans des grottes de Sicile, ils déterraient des crânes énormes, 2 fois plus gros qu'un crâne humain. Et en plein centre du front, un seul trou, immense, rond, un œil unique. Pour eux, aucun doute : des géants vivaient sur cette île. Le Cyclope était né. Et ce n'est pas un hasard si l'Odyssée place les Cyclopes précisément en Sicile. Sauf que des siècles plus tard, les scientifiques ont identifié ces crânes. Des éléphants nains, hauts comme un mouton, qui vivaient sur l'île il y a des milliers d'années. Et le trou au milieu du front ? Pas un œil. La cavité de leur trompe. Le monstre le plus célèbre de la mythologie est une erreur de paléontologie commise 2 500 ans avant son invention. »",
  "EXEMPLE 3 — « Les personnes qui vivent plus de 110 ans semblent partager une particularité biologique étonnante. Elles se cachent dans leur sang et elles pourraient être l'une des clés de leur longévité. Chez les personnes de 70 à 99 ans, un certain type de cellules immunitaires représente environ 4 % des lymphocytes T. Mais chez les plus de 110 ans, cette proportion grimpe jusqu'à près de 18 %. Ces cellules sont capables de détruire des cellules anormales, notamment certaines cellules tumorales. Les chercheurs pensent donc qu'elles pourraient aider ces personnes à rester en bonne santé exceptionnellement longtemps. Mais pour l'instant, personne ne sait si elles expliquent leur longévité ou si elles en sont simplement une conséquence. »",
].join("\n");

export function scriptSystemPrompt(
  kind: VideoKind,
  sceneCount: number,
  style: NarrationStyle,
  wordsPerScene = 18,
  styleBriefOverride?: string,
  totalWords?: number,
  langName = "français de France",
  includeCta = true,
  /** Faits établis par l'étape de vérification : seule source autorisée. */
  verifiedFacts: string[] = [],
  /**
   * BUDGET DE CARACTÈRES du script source, calculé sur le débit réel de la voix
   * (caractères par seconde). Quand il est fourni, il remplace toute consigne
   * en MOTS : deux unités concurrentes font dériver la durée.
   */
  chars?: { min: number; target: number; max: number; perScene: number },
  /** Niveau de langue imposé (modifiable depuis la page Paramètres). */
  languageBrief?: string,
  /** Règles propres à l'accroche (modifiables depuis la page Paramètres). */
  hookBrief?: string,
) {
  // Fourchette resserrée : la borne basse ne doit jamais autoriser un plan de 3 s.
  const lo = Math.max(14, Math.round(wordsPerScene - 2));
  const hi = Math.max(lo + 4, Math.round(wordsPerScene + 2));
  return [
    `Tu es un scénariste de vidéos courtes verticales (TikTok / Reels), spécialisé en culture générale.`,
    `LANGUE DE SORTIE (règle absolue) : tous les textes lus ou affichés (title, hook, narration, overlay, cta, hashtags) sont écrits en ${langName}, dans une langue naturelle et idiomatique — jamais une traduction mot à mot. Seuls imagePrompt et videoPrompt restent en anglais.`,
    KIND_BRIEF[kind],
    styleBriefOverride?.trim() || DEFAULT_STYLE_BRIEF[style],
    `Produis exactement ${sceneCount} scènes.`,
    chars
      ? `RÈGLE N°0 — DURÉE, EN CARACTÈRES (unique mesure de longueur, calculée sur le débit réel de la voix) : la somme de toutes les narrations${includeCta ? " (CTA exclu, il est ajouté après)" : ""} doit faire ${chars.target} CARACTÈRES espaces compris, avec une marge de ±5 % — jamais moins de ${chars.min}, jamais plus de ${chars.max}. Soit environ ${chars.perScene} caractères par scène. Compte réellement les caractères avant de répondre et complète si tu es en dessous : un script plus court rend la vidéo deux fois trop courte.`
      : totalWords
        ? `RÈGLE N°0 — DURÉE : le script complet${includeCta ? " (scènes + CTA)" : ""} doit faire environ ${totalWords} mots au total, avec une marge de 5 % maximum. C'est une contrainte de durée : un script plus court rend la vidéo trop courte. Compte les mots avant de répondre et complète si tu es en dessous.`
        : "",

    "",
    `RÈGLE N°1 — L'ACCROCHE (scène 1, la partie la plus importante) :\n${hookBrief?.trim() || DEFAULT_HOOK_BRIEF}`,
    "L'accroche est une AFFIRMATION FACTUELLE brute et surprenante. Jamais une question.",
    "L'accroche s'appuie sur quelque chose que TOUT LE MONDE connaît déjà : un film, un personnage célèbre, un animal, un objet du quotidien, un mythe. On doit pouvoir se représenter la scène instantanément, sans explication.",
    "TEST DES 2 SECONDES : l'accroche doit être comprise SANS la moindre connaissance préalable. Interdits absolus : un nom propre inconnu du grand public, un lieu obscur, un pronom sans référent (« il », « ce », « cette »), une formule vague (« ce jour-là », « cet objet »). Si on doit attendre la scène 2 pour comprendre de QUOI on parle, l'accroche est ratée : réécris-la.",
    "PREMIÈRE PHRASE — ELLE DÉCRIT UN ÉVÉNEMENT OU UNE IMAGE CONCRÈTE ET FRAPPANTE, quelque chose qui se voit : un geste, un choc, un objet, une scène précise. Jamais une mise en contexte, jamais une présentation de sujet, jamais un cadre général (« à telle époque, en tel lieu, on pensait que… »). Si la première phrase ne peut pas être dessinée telle quelle, réécris-la.",
    "Le champ hook reprend exactement la ou les phrases de la scène 1.",

    "",
    `RÈGLE N°1 BIS — NIVEAU DE LANGUE (règle éliminatoire, elle prime sur le style) :\n${languageBrief?.trim() || DEFAULT_LANGUAGE_BRIEF}`,

    "",
    "RÈGLE N°2 — FORME DU RÉCIT : trois formes sont autorisées, choisis librement celle qui convient au sujet, sans en privilégier aucune.",
    "• LE MÉCANISME : on part d'un fait connu et on explique comment ça marche vraiment, étape par étape, jusqu'à une conséquence qu'on n'attendait pas.",
    "• LA DÉMONSTRATION : on pose une question concrète et on la résout par le raisonnement et les chiffres, jusqu'à une conclusion nette.",
    "• L'ENQUÊTE : on raconte une croyance, puis ce que les faits disent réellement, et on referme.",
    "N'impose AUCUN retournement : beaucoup de très bons scripts n'en ont pas. N'impose AUCUN connecteur imposé en début de scène : les scènes s'enchaînent naturellement.",

    "",
    "RÈGLE N°3 — ÉCRITURE : phrases très courtes. Les phrases nominales et les fragments sont encouragés (« Un système d'alerte de proximité câblé dans 8 pattes. », « Le Cyclope était né. », « Une araignée de 70 kilos, non. »). Une idée par phrase. Tutoiement. Ton oral, direct, jamais publicitaire. Vocabulaire du quotidien, écrit pour quelqu'un de 15 ans.",
    "CHIFFRES : au moins TROIS chiffres précis et vérifiables par script (proportions, dates, distances, tailles, pourcentages). Ils sont le cœur de la crédibilité. Ils sont interdits uniquement dans l'accroche.",
    "MOT TECHNIQUE : tu as le droit à UN seul terme technique précis par script (trichobothries, pyrocumulonimbus, lymphocytes T), une seule fois, et immédiatement expliqué en mots du quotidien juste après.",
    "RELANCES : des micro-questions très courtes à l'intérieur du texte pour relancer l'attention (« Comment c'est possible ? », « Le remède ? », « Un insecte qui approche ? »). Jamais en ouverture, jamais plus de deux par script.",
    "CHUTE : la dernière phrase recadre tout d'un coup ; elle est courte et frappante. Jamais une morale, jamais un appel à l'action, jamais un résumé. Bonnes formes : « Le monstre le plus célèbre de la mythologie est une erreur de paléontologie commise 2 500 ans avant son invention. » / « À ce stade, ce n'est plus un incendie qu'on combat. C'est un système météo. »",
    "HONNÊTETÉ : si le fait est incertain ou débattu, dis-le franchement à la fin plutôt que de trancher (« On ne sait pas encore si… », « personne ne sait si elles expliquent leur longévité ou si elles en sont une conséquence. »). Ça renforce la crédibilité.",
    "INTERDITS ABSOLUS : « saviez-vous », « incroyable mais vrai », « accrochez-vous », « vous n'allez pas me croire », « dans cette vidéo », les emojis, les points d'exclamation, les superlatifs creux (« absolument fou », « complètement dingue »), et toute annonce de ce qui va arriver.",

    "",
    "RÈGLE N°3 BIS — SIMPLICITÉ (la plus importante après l'accroche) :",
    "UNE SEULE NOTION NOUVELLE par vidéo. Interdit d'enchaîner plusieurs concepts abstraits : si tu dois expliquer deux mécanismes pour que le récit tienne, choisis-en un et coupe l'autre.",
    "INTERDITS ABSOLUS : les ratios, les proportions abstraites, les rapports entre grandeurs (« rapport surface/volume », « proportionnel à »), et tout vocabulaire de cours de physique, de chimie ou de biologie (vitesse terminale, frottements de l'air, énergie cinétique, pression osmotique, densité, inertie…). Si une explication demande une formule ou une notion de niveau lycée, remplace-la par une IMAGE CONCRÈTE que tout le monde a déjà vue.",
    "CHIFFRES PALPABLES : chaque chiffre est immédiatement rendu concret par une comparaison du quotidien (« gros comme un grain de riz », « la hauteur de six étages », « le poids d'une pomme »). Jamais un chiffre brut laissé seul.",
    "MOT TECHNIQUE : un seul par vidéo, et ce doit être un NOM DE CHOSE (un animal, un objet, un phénomène qui porte un nom), jamais une notion abstraite ni un nom de loi physique.",
    "TEST DE SIMPLICITÉ, à appliquer sur chaque phrase AVANT de répondre : un enfant de 12 ans doit pouvoir réexpliquer toute la vidéo à quelqu'un d'autre après une seule écoute. Si une phrase ne passe pas ce test, réécris-la plus simplement.",

    "",
    "RÈGLE N°4 — CONTINUITÉ : écris d'abord la narration comme UN SEUL TEXTE SUIVI qui se lit d'une traite, puis découpe-le en scènes aux frontières naturelles. Le découpage en plans est VISUEL, pas narratif : une scène n'est pas un paragraphe autonome, c'est un plan qui illustre un morceau du texte continu. C'est ce qui donne la fluidité.",
    "CLARTÉ : on doit comprendre même sans les images. Nomme explicitement de qui et de quoi on parle (jamais « il », « ça », « cette chose » sans que le nom ait été dit juste avant). Le lieu, l'époque et les protagonistes sont nommés dès qu'ils entrent dans le récit.",
    chars
      ? `LONGUEUR PAR SCÈNE : chaque scène correspond à UN plan vidéo qui dure entre 6 et 8 SECONDES de parole, jamais moins. La narration d'une scène fait environ ${chars.perScene} CARACTÈRES espaces compris (entre ${Math.round(chars.perScene * 0.8)} et ${Math.round(chars.perScene * 1.2)}). Une scène trop COURTE est une erreur aussi grave qu'une scène trop longue : elle produit une coupe toutes les 4 secondes et hache la vidéo. Compte réellement les caractères de chaque scène avant de répondre et rallonge celles qui sont sous ${Math.round(chars.perScene * 0.8)} caractères.`
      : `LONGUEUR PAR SCÈNE : chaque scène correspond à UN plan vidéo qui dure entre 6 et 8 SECONDES de parole, jamais moins. La narration d'une scène fait entre ${lo} et ${hi} MOTS. Une scène trop COURTE est une erreur aussi grave qu'une scène trop longue : elle produit une coupe toutes les 4 secondes et hache la vidéo. Compte réellement les mots de chaque scène avant de répondre et rallonge celles qui sont sous ${lo} mots.`,
    "PAS DE PLAN DE REMPLISSAGE : aucun plan ne se contente de définir un terme, de reformuler le plan précédent ou de faire une transition. Chaque plan apporte une information nouvelle et fait avancer l'explication. Si une idée tient en trois secondes, fusionne-la avec la scène suivante plutôt que d'en faire un plan à part.",
    "Le champ overlay est le texte incrusté à l'écran : 3 à 6 mots, percutant.",

    "",
    REFERENCE_EXAMPLES,

    "",
    "RÈGLE N°5 — COHÉRENCE VISUELLE (très importante) :",
    "Avant d'écrire les scènes, définis une BIBLE VISUELLE dans le champ characters : chaque personnage, animal ou objet qui revient dans plusieurs scènes reçoit une description physique FIXE et très précise en anglais (âge, silhouette, coiffure/barbe, vêtements, COULEURS exactes, accessoires). Exemple : « Odysseus: bearded man, deep red tunic and red cape, dark curly hair and beard, bronze sandals, cream skin tone ».",
    "Le champ palette décrit en anglais la palette de couleurs commune à TOUTE la vidéo (4 à 5 couleurs), et les décors récurrents.",
    "ACCENT ROUGE (fil visuel obligatoire) : le champ palette doit désigner explicitement, en anglais, QUEL objet récurrent porte un rouge vif et saturé dans cette vidéo (ex. « red accent: the explorer's red scarf, vivid saturated red, present in every shot »). Cet objet est toujours le même d'un plan à l'autre, comme un personnage, jamais un accident.",
    "Dans CHAQUE imagePrompt, tu nommes explicitement cet élément rouge et sa place dans la composition (au centre ou juste à côté du sujet principal). Un seul élément rouge par plan : c'est le point d'accroche quand le spectateur scrolle.",
    "Dans CHAQUE imagePrompt et videoPrompt, tu recopies mot pour mot la description complète du personnage concerné, telle qu'écrite dans characters. Jamais « the same man » : toujours la description entière, identique. Un personnage garde exactement les mêmes couleurs de vêtements du début à la fin.",
    "imagePrompt et videoPrompt DOIVENT être en anglais, très visuels, sans aucun texte dans l'image.",
    "imagePrompt décrit UNE composition simple et lisible : 1 à 3 éléments maximum, une silhouette claire au premier plan, un décor minimal.",
    "CORRESPONDANCE TEXTE–IMAGE : chaque imagePrompt doit illustrer LITTÉRALEMENT l'information prononcée dans la narration de cette scène. Reprends les personnes, objets, lieu et action réellement cités ; n'ajoute aucun symbole abstrait ou décor sans rapport.",
    "PROGRESSION VISUELLE : traite les scènes comme un storyboard continu. Chaque plan montre la conséquence concrète du plan précédent et prépare le suivant. Change le cadrage, pas arbitrairement le lieu, l'époque, les costumes ou les personnages.",
    "N'utilise JAMAIS de noms propres d'œuvres, films, jeux, marques, artistes ou personnages protégés dans imagePrompt et videoPrompt : décris ce qu'on voit.",
    "videoPrompt anime uniquement les éléments visibles dans imagePrompt et décrit une action simple qui rend la narration immédiatement compréhensible, avec un mouvement de caméra discret, en 8 secondes maximum. Aucun nouvel objet, personnage ou événement.",

    "",
    verifiedFacts.length
      ? [
          "FAITS VÉRIFIÉS (source unique autorisée) : le script n'utilise AUCUN chiffre, AUCUNE date et AUCUNE affirmation qui ne figure pas dans cette liste. Tu peux reformuler, illustrer et simplifier, jamais ajouter un fait nouveau ni arrondir un chiffre dans l'autre sens. Si un détail te manque, tu l'omets.",
          ...verifiedFacts.map((f) => `- ${f}`),
        ].join("\n")
      : "",
    includeCta ? CTA_BRIEF : "",
    includeCta
      ? "UN SEUL CTA : le CTA Sophia est écrit UNIQUEMENT dans le champ cta (texte prêt à être lu à voix haute), adapté au sujet. Aucune scène du tableau scenes ne doit parler de l'appli, de téléchargement ou de cours gratuits. Le mot « Sophia » n'apparaît qu'une seule fois dans TOUT le script."
      : "AUCUNE PUBLICITÉ : le champ cta doit rester une chaîne VIDE. Le script ne mentionne JAMAIS Sophia, une application, un téléchargement, un abonnement ou un appel à l'action. Il se termine sur sa phrase de chute.",
    "hookOptions contient TROIS accroches différentes (douze mots maximum chacune). hook contient celle que tu retiens, recopiée telle quelle dans la narration de la scène 1. hookChoice explique ton choix en UNE ligne.",
    'Réponds uniquement en JSON: {"title":string,"hook":string,"hookOptions":string[],"hookChoice":string,"characters":[{"name":string,"description":string}],"palette":string,"scenes":[{"index":number,"narration":string,"overlay":string,"imagePrompt":string,"videoPrompt":string}],"cta":string,"hashtags":string[]}',
  ].join("\n");
}

/**
 * PASSE DE RELECTURE : dernière étape de l'écriture. On ne touche ni au sens,
 * ni à la longueur, ni à l'ordre : on remplace uniquement les mots rares par
 * des mots du quotidien et on casse les tournures compliquées.
 */
export function simplifySystemPrompt(
  langName: string,
  sceneCount: number,
  languageBrief?: string,
) {
  return [
    `Tu relis un script de vidéo courte écrit en ${langName}, destiné à des gens de 15 à 25 ans qui scrollent. Ton seul travail : la SIMPLICITÉ DES MOTS.`,
    languageBrief?.trim() || DEFAULT_LANGUAGE_BRIEF,
    "MÉTHODE : parcours chaque phrase, repère les mots rares, savants, littéraires ou administratifs, et remplace-les par le mot du quotidien équivalent. Casse les tournures passives et les phrases à rallonge en phrases courtes.",
    "ANTI-REDONDANCE : en simplifiant, tu SUPPRIMES les adjectifs de remplissage et les répétitions. Un seul qualificatif par idée. « un immense trou géant, tout rond et complètement unique » → « un trou rond au milieu du front ». Tu ne remplaces JAMAIS un mot savant par une périphrase enfantine (« la place de l'œil ») : tu prends le mot courant exact.",
    "TU NE CHANGES RIEN D'AUTRE : même sens, même ton, mêmes chiffres, mêmes noms, même ordre, et surtout MÊME LONGUEUR (±3 % de caractères par scène). Tu n'ajoutes aucune information, tu n'en retires aucune. Si retirer une redondance raccourcit la phrase, tu compenses avec une INFORMATION concrète déjà présente dans le script (chiffre, lieu, geste), jamais avec un adjectif.",
    `Tu renvoies EXACTEMENT ${sceneCount} scènes, avec les MÊMES index. Si une scène est déjà parfaitement simple, tu la recopies à l'identique.`,
    'Réponds uniquement en JSON: {"scenes":[{"index":number,"narration":string}]}',
  ].join("\n");
}

export function scriptUserPrompt(kind: VideoKind, topic: string) {
  const base = topic.trim() || "un fait fascinant surprenant au choix";
  return kind === "pub"
    ? `Sujet : ${base}. Glisse une mention naturelle de l'application Sophia au milieu du script, puis termine par l'outro imposée.`
    : `Sujet : ${base}.`;
}

/**
 * MASTER MULTILINGUE : les visuels sont fabriqués une seule fois et ne
 * contiennent aucun texte. Seule la partie parlée est traduite, scène par
 * scène, avec un plafond de mots pour tenir dans le clip déjà commandé.
 */
export function translationSystemPrompt(
  langName: string,
  sceneCount: number,
  maxWordsPerScene: number,
  maxSeconds: number,
  total?: { minSeconds: number; maxSeconds: number; minWords: number; maxWords: number },
  /** Passe de correction : le texte est DÉJÀ dans la langue cible, on n'ajuste que sa longueur. */
  adjust = false,
  /**
   * BUDGET DE CARACTÈRES mesuré sur la voix réelle de cette langue : c'est la
   * contrainte la plus fiable, car le débit d'une voix ne se déduit pas du
   * nombre de mots (à caractères égaux, l'espagnol met 6 s de plus que l'allemand).
   */
  chars?: {
    min: number;
    target: number;
    max: number;
    perScene: number;
    /** Sens de la correction : le texte actuel est trop long, trop court, ou bon. */
    mode?: "ok" | "shorten" | "lengthen";
  },
  /** Niveau de langue imposé : une traduction ne remonte jamais d'un cran. */
  languageBrief?: string,
) {
  return [
    adjust
      ? `Tu es adaptateur de scripts de vidéos courtes. Le texte ci-dessous est DÉJÀ en ${langName} : tu ne le traduis pas, tu ajustes uniquement sa LONGUEUR pour qu'il tienne dans la durée cible, en gardant le même sens, le même ton et tous les chiffres.`
      : `Tu es traducteur-adaptateur de scripts de vidéos courtes. Tu traduis vers ${langName}.`,
    `TRADUCTION FIDÈLE : le script traduit contient EXACTEMENT ${sceneCount} scènes, avec les MÊMES index, dans le même ordre. Ne fusionne jamais deux scènes, n'en ajoute jamais, n'en supprime jamais. Chaque scène traduite dit exactement ce que dit la scène source : l'image de ce plan est déjà fabriquée et ne changera pas.`,
    "Ce n'est PAS du mot à mot : écris comme un natif écrirait, avec le rythme et les tournures naturelles de la langue.",
    "Tous les CHIFFRES, dates, proportions, unités et noms propres sont repris à l'identique.",
    "STYLE CONSERVÉ : phrases très courtes, phrases nominales et fragments autorisés, tutoiement (ou l'équivalent naturel et familier de la langue), ton oral et direct, jamais publicitaire. Aucun emoji, aucun point d'exclamation.",
    `NIVEAU DE LANGUE — RÈGLE ÉLIMINATOIRE : la traduction ne remonte JAMAIS d'un cran en niveau de langue. Un mot courant dans le texte source reste un mot courant dans la langue cible ; le mot savant, littéraire ou administratif qui « ferait mieux » est interdit. Les mêmes exigences qu'à l'écriture s'appliquent mot pour mot, transposées à ${langName} :\n${languageBrief?.trim() || DEFAULT_LANGUAGE_BRIEF}`,
    // Quand le budget de CARACTÈRES est fourni (débit réel de la voix), il
    // remplace toutes les consignes en MOTS : deux unités concurrentes dans le
    // même prompt, c'est la garantie d'un texte deux fois trop court.
    chars
      ? [
          `BUDGET DE CARACTÈRES — CONTRAINTE PRIORITAIRE ET UNIQUE MESURE DE LONGUEUR, calculée sur le débit réel de la voix de cette langue : le script complet (somme de toutes les narrations) doit faire ${chars.target} CARACTÈRES, espaces compris, avec une marge de ±5 %. Jamais moins de ${chars.min}, jamais plus de ${chars.max}. Soit environ ${chars.perScene} caractères par scène.`,
          "Compte réellement les caractères de l'ensemble AVANT de répondre. Un script trop COURT est une faute aussi grave qu'un script trop long : la vidéo dure alors deux fois moins que le format visé.",
          chars.mode === "lengthen"
            ? "LE TEXTE ACTUEL EST TROP COURT : tu dois l'ALLONGER pour atteindre le budget. Tu étoffes avec du détail CONCRET déjà impliqué par le sens (date, lieu, nom, chiffre, conséquence matérielle, précision sensorielle). Tu n'inventes aucun fait, tu n'ajoutes ni morale, ni publicité, ni remplissage, ni répétition."
            : chars.mode === "shorten"
              ? "LE TEXTE ACTUEL EST TROP LONG : tu dois le CONDENSER pour revenir dans le budget. Tu coupes les redondances, les adverbes, les reformulations et les mots de liaison. Tu gardes le sens, le ton, tous les chiffres et toute l'information."
              : "Ajuste dans les deux sens si besoin : condense ce qui dépasse, étoffe ce qui est trop court.",
        ].join("\n")
      : `CONTRAINTE DE DURÉE PAR PLAN : chaque narration traduite doit pouvoir être lue à voix haute en moins de ${maxSeconds} secondes, soit ${maxWordsPerScene} MOTS MAXIMUM par scène. Compte les mots. Si la traduction naturelle dépasse, CONDENSE : supprime les redondances et les mots de liaison, garde TOUS les chiffres et toute l'information.`,
    !chars && total
      ? `CIBLE DE DURÉE TOTALE (aussi importante que le plafond par plan) : lue à voix haute en ${langName}, la somme de toutes les narrations doit durer entre ${total.minSeconds} et ${total.maxSeconds} secondes, soit entre ${total.minWords} et ${total.maxWords} mots au total. Compte les mots de l'ensemble avant de répondre. Si tu es en dessous, ÉTOFFE légèrement les scènes (précisions concrètes déjà présentes dans le sens du texte) ; si tu es au-dessus, CONDENSE. Dans les deux cas : même nombre de scènes, mêmes index, tous les chiffres conservés.`
      : "",
    "Le mot « Sophia » reste « Sophia » dans toutes les langues.",
    "Traduis uniquement narration, overlay, title, hook et cta. Si cta est vide, laisse-le vide.",
    "overlay reste un texte incrusté très court : 3 à 6 mots.",
    'Réponds uniquement en JSON: {"title":string,"hook":string,"cta":string,"scenes":[{"index":number,"narration":string,"overlay":string}]}',
  ].join("\n");
}

const SQUARE_FRAME =
  "Framing: the whole scene is composed inside a perfect centered square (1:1) with softly rounded corners, touching the left and right edges; above and below that square the frame is pure solid black, completely empty, like a rounded square clip letterboxed in a vertical canvas. Nothing of the scene spills into the black bands or past the rounded corners.";

export type PromptOverrides = {
  visualBrief?: string | undefined;
  quality?: string | undefined;
  motion?: string | undefined;
  /**
   * Consigne propre au PLAN 1 (accroche). Pour l'image elle s'ajoute au brief,
   * pour l'animation elle REMPLACE la consigne de mouvement des autres plans.
   */
  opening?: string | undefined;
  /** Bible visuelle (personnages + palette) à répéter sur chaque plan. */
  bible?: string | undefined;
  /** Contexte narratif : plans précédents et plan suivant. */
  story?: string | undefined;
  /**
   * TYPE DE PLAN imposé (échelle et cadrage). Il change à chaque plan, alors
   * que la direction artistique, elle, ne bouge jamais.
   */
  shot?: string | undefined;
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
  const opening = o.opening?.trim() ? ` ${o.opening.trim()}` : "";
  const shot = o.shot?.trim() ? ` ${o.shot.trim()}.` : "";
  return `Vertical 9:16 key frame. ${brief}. ${quality}.${opening}${shot}${bibleLine(o.bible)}${storyLine(o.story)} ${
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
  // Plan 1 : consigne de mouvement propre, qui remplace celle des autres plans.
  const motion = o.opening?.trim() || o.motion?.trim() || DEFAULT_MOTION[visual];
  return `${videoPrompt}. Vertical short-form video. ${brief}. ${quality}.${bibleLine(o.bible)}${storyLine(o.story)} ${
    square
      ? SQUARE_FRAME +
        " The frame is locked: the centered square never moves, never changes size and is never re-framed. The black bands above and below the square must stay perfectly pure black, completely static and empty for the whole clip. No element, character, particle, shadow or effect may leave the square, cross into the black bands or overlap them. No camera movement, no pan, no tilt, no dolly, no zoom in or out, no push in: absolutely all motion happens strictly inside the square. "
      : ""
  }${motion} Consistent art direction, same characters and same colors as the reference image, no on-screen text, no subtitles, no watermark.`;
}

export const TOPIC_BRIEF: Record<NarrationStyle, string> = {
  question:
    "Le sujet doit être une GRANDE QUESTION que beaucoup de gens se sont déjà posée sans jamais avoir la réponse (pourquoi la mer est salée, pourquoi on rêve, pourquoi l'empire romain est tombé…). Formule le sujet comme une question simple. La réponse doit se DÉROULER en plusieurs étapes : une question dont la réponse tient en une phrase ne fait pas une vidéo.",
  revelation:
    "Le sujet doit être une croyance très répandue ou une histoire connue qui cache un retournement : ce que les gens croient est faux, ou l'explication réelle est bien plus étrange. Le retournement doit se DÉMONTRER indice par indice, comme une enquête — jamais s'énoncer d'un bloc en une phrase.",
  storytelling:
    "Le sujet doit être une histoire vraie avec des personnages, un lieu et un moment précis, qu'on peut raconter comme une scène vécue, et qui AVANCE : chaque étape du récit apporte un fait nouveau jusqu'à la conséquence finale.",
  listicle:
    "Le sujet doit être un thème simple qui permet d'enchaîner plusieurs faits surprenants qui se répondent et montent en intensité (le corps humain, l'espace, les animaux, le Moyen Âge…). Les faits doivent construire une même démonstration, jamais être une simple liste d'anecdotes sans lien.",
  mecanique:
    "Le sujet doit être une chose connue de tous dont on peut expliquer le fonctionnement réel, étape par étape (comment une araignée sent le danger, comment un incendie crée son propre orage, comment le GPS sait où tu es). On part du fait connu et on va jusqu'à une conséquence inattendue. Il faut au moins trois étapes de mécanisme, chacune apportant une information nouvelle.",
};

/**
 * Critère d'INTRIGUE commun à tous les styles : un sujet purement explicatif
 * ne suffit pas, il faut la promesse d'une révélation.
 */
export const TOPIC_INTRIGUE = [
  "EXIGENCE D'INTRIGUE (critère éliminatoire) : le sujet doit donner l'impression que quelque chose d'IMPOSSIBLE, de CACHÉ ou de CONTRAIRE AU BON SENS va être révélé.",
  "Il faut une tension, un secret, une croyance renversée, ou un détail que personne ne remarque. Un sujet purement explicatif (« pourquoi tel phénomène se produit ») n'est PAS assez accrocheur : reformule-le jusqu'à ce qu'il promette une révélation.",
  "TEST DE VALIDATION DU SUJET, à appliquer avant de répondre : en lisant le sujet seul, est-ce qu'on a envie de connaître la suite parce qu'on sent qu'on va apprendre quelque chose qui contredit ce qu'on croyait ? Si la réponse est non, propose un autre sujet.",
  "TEST DE SIMPLICITÉ : le sujet doit pouvoir être expliqué à un enfant de 12 ans sans aucune notion technique, sans formule et sans vocabulaire de cours de sciences.",
].join("\n");

/**
 * LEVIERS VIRAUX : les 9 vidéos de référence qui marchent ont toutes de la
 * matière à DÉROULER (mécanisme ou enquête) et activent au moins un de ces
 * leviers. Un sujet qui n'en active aucun, ou qui tient entier dans sa phrase
 * d'accroche, est rejeté.
 */
export const TOPIC_VIRAL = [
  "RÈGLE ABSOLUE — IL FAUT DE LA MATIÈRE À DÉROULER (critère éliminatoire, à vérifier AVANT tout le reste) : le sujet doit contenir quelque chose qui se DÉROULE sur soixante secondes, c'est-à-dire soit un MÉCANISME qui s'explique en plusieurs étapes, soit une ENQUÊTE dont la vérité se découvre progressivement.",
  "TEST DE REJET : si le fait est entièrement dit dans la phrase d'accroche et qu'il ne reste plus qu'à le répéter ou à broder autour, le sujet est REFUSÉ. C'est une anecdote, pas une histoire. Exemples refusés : « il existe plus de flamants roses en plastique que de vrais », « il y a cent Lego par humain », « Oxford est plus vieille que l'empire aztèque » — le fait tient entier dans la première phrase, il ne reste rien à raconter.",
  "Les vidéos qui marchent ont toutes quelque chose à dérouler : les poils sensoriels de l'araignée expliqués un par un, la colonne d'air qui fabrique un nuage d'orage étape par étape, les crânes de Sicile qu'on identifie peu à peu comme des éléphants nains, les cellules immunitaires des super-centenaires qu'on découvre en enquêtant.",
  "",
  "LEVIERS VIRAUX (critère éliminatoire) : le sujet DOIT activer au moins un de ces leviers. S'il n'en active aucun, recommence. Les trois premiers sont PRIORITAIRES : ce sont eux qui dominent les vidéos de référence.",
  "1. ORIGINE RÉELLE D'UNE FICTION (levier le plus efficace, à privilégier) : une fiction, un mythe, un héros ou un personnage célèbre dont la science ou l'archéologie révèle l'origine réelle, et on déroule l'enquête qui l'a établie. Exemples : « Le Spider Sense de Spider-Man a été copié sur les vraies araignées. », « Le Cyclope de l'Odyssée a une origine bien réelle. », « La ville de Troie a vraiment existé. » Le point de départ est connu de tous, la révélation se découvre par étapes.",
  "2. MÉCANIQUE D'UN PHÉNOMÈNE SPECTACULAIRE : un phénomène naturel impressionnant dont on explique la mécanique interne, étape par étape, jusqu'à une conséquence qui dépasse ce qu'on imaginait. Exemple : « Un méga feu peut créer son propre nuage d'orage. » Chaque étape ajoute un rouage, la dernière donne le vertige.",
  "3. EXPÉRIENCE VÉCUE PAR LE SPECTATEUR : une chose qu'il a déjà ressentie dans son corps ou dans sa tête, dont on explique le mécanisme réel, avec si possible quelque chose qu'il peut en faire. Exemple : « Plus tu grandis, plus le temps passe vite — et il existe un moyen de le ralentir. »",
  "4. CROYANCE RENVERSÉE : ce que tout le monde tient pour vrai est faux, ou l'inverse — à condition que la démonstration se déroule en plusieurs étapes. Exemple : « De tous les pouvoirs de Spider-Man, un seul est vraiment impossible. »",
  "5. ÉPISODE HISTORIQUE RACONTÉ VITE : un épisode marquant de l'Histoire, raconté tendu et rapide. Il déroule par nature, minute par minute. L'événement doit être connu DE NOM du grand public (Tchernobyl, Pompéi, le Titanic, le Hindenburg, Apollo 13, la peste noire, le mur de Berlin, Hiroshima, Fukushima, la mutinerie du Bounty, la Grande Peur) : si le spectateur n'a jamais entendu ce nom, le sujet est refusé. L'ANGLE, lui, est un détail précis et peu connu de cet événement — une heure, une décision, un homme, un objet — jamais « ce qui s'est passé à Tchernobyl ». On entre directement dans la scène, on avance minute par minute, on termine sur la conséquence qui donne le vertige. INTERDIT d'en faire un cours d'histoire : aucune date de contexte inutile, aucun nom de traité, aucune explication politique. Des faits, des gens, des conséquences.",
  "LE CHIFFRE SIDÉRANT N'EST PLUS UN LEVIER À LUI SEUL : un chiffre qu'on refuse de croire reste bienvenu, mais toujours À L'INTÉRIEUR d'un sujet qui a un mécanisme ou une enquête. Un chiffre seul ne fait jamais un sujet.",
  "À REJETER SYSTÉMATIQUEMENT :",
  "- L'ANECDOTE SANS DÉROULÉ : un fait isolé, aussi étonnant soit-il, qui se dit en une phrase et n'a aucune suite à expliquer.",
  "- LE SON ET LE BRUITAGE : tout sujet sur la fabrication d'un cri, d'un rugissement, d'une musique ou d'un bruitage de film (le cri de Godzilla, le sabre laser, le cri Wilhelm). Sans extrait sonore, une vidéo ne peut pas démontrer ce genre de sujet.",
  "- L'INCONNU : tout sujet dont le sujet principal — lieu, personne, œuvre ou événement — n'est pas reconnu immédiatement par le grand public (un peintre oublié, un village perdu, une bataille secondaire, un roman confidentiel). Si le spectateur doit se demander « c'est quoi ça ? », il passe.",
  "- Les sujets purement explicatifs du type « pourquoi tel phénomène se produit », sans tension ni révélation. Exemple raté : la chute des fourmis expliquée par la physique — rien à renverser, aucun héros, aucun enjeu pour le spectateur.",
  "- L'HISTOIRE OBSCURE : un événement, un lieu ou un personnage que le grand public ne connaît pas. Sans point d'accroche connu, le spectateur passe.",
  "- Tout sujet dont la démonstration exige plusieurs notions abstraites.",
  "TEST DU SCROLL, obligatoire avant de répondre : formule le sujet comme la PREMIÈRE PHRASE de la vidéo, puis demande-toi si quelqu'un qui scrolle s'arrêterait dessus. S'il faut une phrase de contexte avant que ça devienne intéressant, le sujet est mauvais : recommence.",
  "TEST DES TROIS ÉTAPES, dernier test avant de proposer un sujet : écris mentalement les trois étapes du déroulé de la vidéo. Si tu n'arrives pas à en écrire trois qui apportent CHACUNE une information nouvelle, le sujet n'a pas assez de matière — remplace-le par un autre.",
  "Le sujet doit tenir en UNE phrase compréhensible sans aucune connaissance préalable, et ne contenir aucun mot qu'un ado ne dirait pas.",
].join("\n");


/**
 * VÉRIFICATION DES FAITS : étape texte, avant toute dépense d'image ou de
 * vidéo. Le modèle corrige les chiffres faux, écarte le douteux et renvoie la
 * liste des faits établis dont le script aura le droit de se servir.
 */
export function factCheckSystemPrompt(langName: string) {
  return [
    `Tu es vérificateur de faits pour une chaîne de vulgarisation. Tu écris en ${langName}.`,
    "On te donne un sujet de vidéo courte et son angle. Tu vérifies CHAQUE affirmation et CHAQUE chiffre.",
    "MÉTHODE : recalcule toi-même toute grandeur dérivée (une quantité totale divisée par une population, une moyenne, un pourcentage) au lieu de reprendre le chiffre annoncé. Exemple : 20 millions de tonnes d'or pour 8 milliards d'humains font environ 2,5 kg par personne, pas 4 kg.",
    "Corrige ce qui est faux, arrondis honnêtement, et donne l'ordre de grandeur quand la valeur exacte est inconnue.",
    "ÉCARTE tout ce qui est contesté, invérifiable, issu d'une seule source douteuse ou d'une légende urbaine : ces points vont dans discarded, avec la raison en une phrase.",
    "facts : les faits ÉTABLIS que le script pourra utiliser, un par entrée, chacun autosuffisant et chiffré quand c'est possible. Entre 4 et 10 entrées. N'y mets rien dont tu n'es pas sûr.",
    "correctedTopic : le sujet reformulé en UNE phrase, exact, sans rien perdre de son intérêt. Si le sujet était déjà exact, recopie-le.",
    "verdict : « ok » si l'affirmation CENTRALE du sujet tient ; « revoir » si elle est fausse ou invérifiable — dans ce cas, explique pourquoi dans note et ne cherche pas à sauver le sujet.",
    "note : une phrase en clair sur ce qui a été rectifié.",
    'Réponds uniquement en JSON: {"correctedTopic":string,"verdict":"ok"|"revoir","note":string,"facts":string[],"discarded":string[]}',
  ].join("\n");
}
