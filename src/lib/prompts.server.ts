import {
  DEFAULT_AUDIT_BRIEF,
  DEFAULT_HOOK_BRIEF,
  DEFAULT_LANGUAGE_BRIEF,
  DEFAULT_STRUCTURE_BRIEF,
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
  /** Note des trois accroches sur les six conditions, une ligne par candidate. */
  hookScores?: string[];
  /**
   * Relecture finale « spectateur qui scrolle » : plan le plus faible désigné,
   * ce qu'on a appris, et la raison. Le plan désigné est réécrit une fois.
   */
  audit?: { weakest: number; reason: string; learned: string };
  scenes: Scene[];
  /** Message clair quand la longueur reste hors cible après les 3 passes. */
  lengthNote?: string;
  /** Faits corrigés par la vérification plan par plan. */
  factNote?: string;

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
  "EXEMPLES DE RÉFÉRENCE (modèles de TON et de RYTHME à imiter, jamais à recopier ni à réutiliser comme sujet). Ce sont les scripts validés par le client : ILS PRIMENT SUR TOUTE AUTRE CONSIGNE DE TON. Relis-les AVANT d'écrire.",
  "LES NEUF ACCROCHES VALIDÉES, mot pour mot — écris une accroche de la MÊME FAMILLE : deux phrases, 20 à 30 mots, affirmation nette puis amorce de la preuve, ancrage sur du familier puis renversement :",
  "1. « Le Spider Sense de Spider-Man n\'a pas été inventé. Il a été copié sur les vraies araignées. Et dans la nature, il fonctionne encore mieux que dans le film. »",
  "2. « De tous les pouvoirs de Spider-Man, un seul est vraiment impossible : grimper au mur. »",
  "3. « Un incendie assez grand ne subit plus la météo, il fabrique la sienne. »",
  "4. « Plus tu grandis, plus le temps passe vite. Il y a une vraie raison à ça et il existe même un moyen de le ralentir. »",
  "5. « La ville de Troie a vraiment existé. Tout le monde la croyait inventée, jusqu\'à ce qu\'un marchand allemand, obsédé par Homère, creuse en suivant le texte comme une carte et la trouve. »",
  "6. « La scène où Spider-Man arrête un train est peut-être le moment le plus scientifiquement correct du cinéma de super-héros. »",
  "7. « Le Cyclope de l\'Odyssée a une origine bien réelle. Les Grecs avaient des preuves : de vrais crânes géants percés d\'un trou unique. »",
  "8. « Cette tornade qui vient de frapper la France pourrait être un avant-goût de ce qui nous attend dans les prochaines années. »",
  "9. « Les personnes qui vivent plus de 110 ans semblent partager une particularité biologique étonnante. Elles se cachent dans leur sang. »",
  "CHUTES VALIDÉES (le niveau exigé pour la dernière phrase : un angle neuf, un chiffre ou un paradoxe, citable telle quelle) : « Un système d\'alerte de proximité câblé dans 8 pattes. » · « Une araignée peut grimper. Une araignée de 70 kilos, non. » · « La légende disait vrai. Il fallait juste creuser. » · « Une araignée de quelques millimètres fabrique en silence ce que nos meilleures usines ne savent pas copier. »",
  "L\'EXEMPLE 2 ci-dessous est l\'ÉTALON : preuve donnée dès la deuxième phrase, chiffres toujours comparés à du familier (« 2 fois plus gros qu\'un crâne humain », « hauts comme un mouton »), retournement marqué par « Sauf que » aux deux tiers, relances en questions courtes suivies de réponses nominales sèches, chute qui recontextualise tout avec un chiffre.",
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
  /** Fonction de chaque plan, information nouvelle et densité (Paramètres). */
  structureBrief?: string,
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
    "L'accroche est une AFFIRMATION FACTUELLE, énoncée comme un fait. Jamais une question.",
    "L'accroche s'appuie sur quelque chose que TOUT LE MONDE connaît déjà : un film, un personnage célèbre, un animal, un objet du quotidien, un mythe, une actualité. Puis elle dit que ce n'est pas ce qu'on croit.",
    "TEST DES 2 SECONDES : l'accroche doit être comprise SANS la moindre connaissance préalable. Interdits absolus : un nom propre inconnu du grand public, un lieu obscur, un pronom sans référent (« il », « ce », « cette »), une formule vague (« ce jour-là », « cet objet »). Si on doit attendre la scène 2 pour comprendre de QUOI on parle, l'accroche est ratée : réécris-la.",
    "L'accroche PEUT annoncer la conclusion (« Le Cyclope de l'Odyssée a une origine bien réelle », « La ville de Troie a vraiment existé ») : la tension porte alors sur le COMMENT, et la vidéo explique le mécanisme. Ce n'est PAS une faute.",
    "Le champ hook reprend exactement la ou les phrases de la scène 1 (deux phrases, 20 à 30 mots).",

    "",
    `RÈGLE N°1 TER — STRUCTURE, INFORMATION ET DENSITÉ (aussi importante que l'accroche) :\n${structureBrief?.trim() || DEFAULT_STRUCTURE_BRIEF}`,

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
    "CHIFFRES : DEUX À QUATRE chiffres précis et vérifiables dans toute la vidéo, jamais plus — au-delà on fait un cours. Chacun est comparé à quelque chose de familier. Ils sont le cœur de la crédibilité, et ils sont interdits dans l'accroche sauf s'ils y créent la contradiction (« Il mesurait un mètre. »).",
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
    chars && chars.perScene >= 110
      ? `CE QUE TU FAIS DE CETTE LONGUEUR : ${chars.perScene} caractères, c'est presque DEUX phrases par plan. Cette place sert à apporter de la MATIÈRE — un chiffre comparé à quelque chose de familier, un lieu précis, un geste concret, une conséquence — jamais du remplissage, jamais des adjectifs empilés, jamais une reformulation. La règle reste : une information nouvelle par plan, aucun plan supprimable sans perte.`
      : "",
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
    "hookOptions contient TROIS accroches candidates (douze mots maximum chacune). hookScores contient TROIS lignes, une par candidate, qui la notent sur les six conditions (conditions remplies / conditions manquées). hook contient celle que tu retiens, recopiée telle quelle dans la narration de la scène 1. hookChoice explique ton choix en UNE ligne.",
    socialCopyBrief(langName),
    'Réponds uniquement en JSON: {"title":string,"hook":string,"hookOptions":string[],"hookScores":string[],"hookChoice":string,"characters":[{"name":string,"description":string}],"palette":string,"scenes":[{"index":number,"narration":string,"overlay":string,"imagePrompt":string,"videoPrompt":string}],"cta":string,"caption":string,"hashtags":string[]}',
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
 * LÉGENDE ET HASHTAGS de publication, demandés DANS le même appel de texte que
 * le script ou la traduction : aucun appel payant supplémentaire.
 */
export function socialCopyBrief(langName: string) {
  return [
    `LÉGENDE ET HASHTAGS DE PUBLICATION, écrits en ${langName} comme un natif les écrirait (jamais du mot à mot).`,
    "caption : 2 à 3 phrases MAXIMUM, assez courtes pour tenir sans « voir plus » sur Instagram. Elle raconte le fait surprenant ET pourquoi il est surprenant : une information vraie par phrase, zéro remplissage, vocabulaire simple, aucun emoji.",
    "caption ne recopie JAMAIS l'accroche de la vidéo mot pour mot : quelqu'un qui a vu la vidéo doit y trouver quelque chose en plus.",
    "caption se termine EXACTEMENT par cette phrase, sans rien y changer : « Télécharge Sophia pour en apprendre plus. » traduite dans la langue de sortie (en : « Download Sophia to learn more. » · es : « Descarga Sophia para aprender más. » · de : « Lade Sophia herunter, um mehr zu erfahren. » · it : « Scarica Sophia per saperne di più. »).",
    "hashtags : exactement « culture » et « sophia » en premier (identiques dans toutes les langues), puis 3 à 5 hashtags propres au sujet DANS LA LANGUE DE SORTIE. Minuscules, sans accent, sans espace, sans ponctuation, sans le caractère #.",
  ].join("\n");
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
    sceneDeltas?: { index: number; chars: number; target: number }[];
    /** Sens de la correction : le texte actuel est trop long, trop court, ou bon. */
    mode?: "ok" | "shorten" | "lengthen";
  },
  /** Niveau de langue imposé : une traduction ne remonte jamais d'un cran. */
  languageBrief?: string,
  /** Demande en plus la légende et les hashtags de publication (aucun appel de plus). */
  withSocial = false,
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
          `CONTRÔLE PLAN PAR PLAN — chaque narration vise ${chars.perScene} caractères et doit rester à ±15 %. ${
            chars.sceneDeltas?.length
              ? `État actuel : ${chars.sceneDeltas
                  .map((s) => `plan ${s.index + 1} = ${s.chars} caractères, cible ${s.target}`)
                  .join(" · ")}.`
              : ""
          }`,
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
    withSocial ? socialCopyBrief(langName) : "",
    withSocial
      ? 'Réponds uniquement en JSON: {"title":string,"hook":string,"cta":string,"caption":string,"hashtags":string[],"scenes":[{"index":number,"narration":string,"overlay":string}]}'
      : 'Réponds uniquement en JSON: {"title":string,"hook":string,"cta":string,"scenes":[{"index":number,"narration":string,"overlay":string}]}',
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
  const isOpening = Boolean(o.opening?.trim());
  const motion = o.opening?.trim() || o.motion?.trim() || DEFAULT_MOTION[visual];
  // Plan 1 UNIQUEMENT : le mouvement doit être déjà lancé sur la toute première
  // image. Veo a tendance à poser un temps mort de 0,5 à 1 s au démarrage, or
  // c'est exactement la seconde où le spectateur décide de scroller.
  const openingMotion = isOpening
    ? " CRITICAL: the motion is ALREADY IN PROGRESS on the very first frame. No hold, no static establishing beat, no slow ramp-up, no fade-in, no easing from stillness: frame 1 already shows elements mid-movement, at full speed, as if the clip started a second earlier."
    : "";
  return `${videoPrompt}. Vertical short-form video. ${brief}. ${quality}.${bibleLine(o.bible)}${storyLine(o.story)} ${
    square
      ? SQUARE_FRAME +
        " The frame is locked: the centered square never moves, never changes size and is never re-framed. The black bands above and below the square must stay perfectly pure black, completely static and empty for the whole clip. No element, character, particle, shadow or effect may leave the square, cross into the black bands or overlap them. No camera movement, no pan, no tilt, no dolly, no zoom in or out, no push in: absolutely all motion happens strictly inside the square. "
      : ""
  }${motion}${openingMotion} Consistent art direction, same characters and same colors as the reference image, no on-screen text, no subtitles, no watermark.`;
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
  "RÈGLE DE SUJET VALIDÉE PAR LE CLIENT — ELLE PRIME SUR TOUT LE RESTE ET ELLE EST ÉLIMINATOIRE.",
  "Les sujets ne sont NI des anecdotes historiques, NI des faits obscurs. Ce sont des QUESTIONS QUE TOUT LE MONDE S'EST DÉJÀ POSÉES, dont tout le monde croit connaître la réponse, et dont la réponse commune est FAUSSE ou INCOMPLÈTE.",
  "TROIS FAMILLES, ET RIEN D'AUTRE :",
  "1. LES QUESTIONS DU QUOTIDIEN : pourquoi y a-t-il des saisons, pourquoi les feuilles changent de couleur, pourquoi bâille-t-on, pourquoi a-t-on des frissons, pourquoi dort-on, qu'est-ce que l'effet de serre, pourquoi les abeilles sont vitales.",
  "2. LES GRANDS ÉPISODES D'HISTOIRE QUE TOUT LE MONDE A ENTENDUS SANS JAMAIS COMPRENDRE : Waterloo, Tchernobyl, la peste noire, la chute de Rome, la guerre du Vietnam.",
  "3. LES MYTHES ET FICTIONS CONNUS DE TOUS, EXPLIQUÉS OU DÉMONTÉS : le talon d'Achille, Sisyphe, le Cyclope, Spider-Man qui arrête un train.",
  "CRITÈRE ABSOLU : le spectateur doit comprendre le sujet SANS AUCUNE CONNAISSANCE PRÉALABLE, et doit avoir DÉJÀ EU LA QUESTION EN TÊTE au moins une fois dans sa vie. Un sujet qu'il faut expliquer avant de pouvoir le poser est un MAUVAIS SUJET : remplace-le.",
  "TEST DE VALIDATION, à appliquer avant de répondre : quelle réponse le spectateur a-t-il déjà dans la tête ? Si tu ne peux pas nommer cette réponse commune, et dire en quoi elle est fausse ou incomplète, le sujet est refusé.",
  "TEST DE SIMPLICITÉ : le sujet doit pouvoir être expliqué à un enfant de 12 ans sans aucune notion technique, sans formule et sans vocabulaire de cours de sciences.",
].join("\n");


/**
 * MATIÈRE À DÉROULER + LES TROIS FAMILLES VALIDÉES. Un sujet hors de ces trois
 * familles, ou dont le fait tient entier dans sa phrase d'accroche, est rejeté.
 */

export const TOPIC_VIRAL = [
  "RÈGLE ABSOLUE — IL FAUT DE LA MATIÈRE À DÉROULER (critère éliminatoire, à vérifier AVANT tout le reste) : le sujet doit contenir quelque chose qui se DÉROULE sur soixante secondes, c'est-à-dire soit un MÉCANISME qui s'explique en plusieurs étapes, soit une ENQUÊTE dont la vérité se découvre progressivement.",
  "TEST DE REJET : si le fait est entièrement dit dans la phrase d'accroche et qu'il ne reste plus qu'à le répéter ou à broder autour, le sujet est REFUSÉ. C'est une anecdote, pas une histoire. Exemples refusés : « il existe plus de flamants roses en plastique que de vrais », « il y a cent Lego par humain », « Oxford est plus vieille que l'empire aztèque » — le fait tient entier dans la première phrase, il ne reste rien à raconter.",
  "Les vidéos qui marchent ont toutes quelque chose à dérouler : les poils sensoriels de l'araignée expliqués un par un, la colonne d'air qui fabrique un nuage d'orage étape par étape, les crânes de Sicile qu'on identifie peu à peu comme des éléphants nains, les cellules immunitaires des super-centenaires qu'on découvre en enquêtant.",
  "",
  "LE SUJET APPARTIENT OBLIGATOIREMENT À L'UNE DES TROIS FAMILLES VALIDÉES (questions du quotidien · grands épisodes d'histoire connus de tous · mythes et fictions connus de tous). Aucun sujet hors de ces trois familles.",
  "Dans les trois familles, on part TOUJOURS de la réponse commune que le spectateur a déjà en tête, et on montre qu'elle est fausse ou incomplète, puis on déroule le vrai mécanisme étape par étape.",
  "• QUESTION DU QUOTIDIEN : « pourquoi y a-t-il des saisons » — réponse commune : « la Terre est plus près du Soleil en été ». Faux. On déroule l'inclinaison.",
  "• ÉPISODE D'HISTOIRE : « Waterloo » — réponse commune : « Napoléon a perdu à cause des Anglais ». Incomplet. On déroule la boue et le retard.",
  "• MYTHE OU FICTION : « le talon d'Achille » — réponse commune : « Homère raconte qu'il était invulnérable sauf au talon ». Faux. On déroule d'où vient vraiment l'expression.",
  "UN SUJET PUREMENT EXPLICATIF EST DÉSORMAIS BIENVENU, à une condition : il doit exister une réponse commune fausse ou incomplète à retirer au spectateur. Sans croyance à retirer, pas de sujet.",
  "À REJETER SYSTÉMATIQUEMENT :",
  "- L'ANECDOTE SANS DÉROULÉ : un fait isolé, aussi étonnant soit-il, qui se dit en une phrase et n'a aucune suite à expliquer.",
  "- LE FAIT OBSCUR et L'HISTOIRE OBSCURE : tout sujet — lieu, personne, œuvre, événement — que le grand public ne reconnaît pas immédiatement (un peintre oublié, un village perdu, une bataille secondaire, un roman confidentiel). Si le spectateur doit se demander « c'est quoi ça ? », il passe.",
  "- TOUT SUJET QU'IL FAUT EXPLIQUER AVANT DE POUVOIR LE POSER.",
  "- LE SON ET LE BRUITAGE : tout sujet sur la fabrication d'un cri, d'un rugissement, d'une musique ou d'un bruitage de film. Sans extrait sonore, une vidéo ne peut pas le démontrer.",
  "- LE CHIFFRE SIDÉRANT SEUL : un chiffre qu'on refuse de croire reste bienvenu, mais toujours À L'INTÉRIEUR d'un sujet qui a une croyance à renverser.",
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
export function factCheckSystemPrompt(langName: string, languageBrief?: string) {
  return [
    `Tu es vérificateur de faits pour une chaîne de vulgarisation. Tu écris en ${langName}.`,
    "TON RÔLE EST DE CORRIGER CE QUI EST FAUX, PAS DE REMONTER LE NIVEAU DE LANGUE. Si le fait est exact, tu recopies la formulation d'origine TELLE QUELLE, mot pour mot.",
    "Tous tes textes (correctedTopic, facts, note) respectent la même contrainte de langue que le script :",
    languageBrief?.trim() || DEFAULT_LANGUAGE_BRIEF,
    "INTERDIT ABSOLU dans tes réponses : « hypothèse géomythologique », « cavité nasale », « orbite oculaire », « aurait été inspiré par », et tout mot du même registre. On dit « le trou du nez », « l'œil », « vient de ».",
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

/**
 * CONTRÔLE FINAL — le modèle relit son propre script comme un spectateur qui
 * scrolle : il désigne le plan le plus faible, dit ce qu'on a appris, et
 * réécrit CE SEUL plan. Une passe, jamais de boucle.
 */
export function auditSystemPrompt(
  langName: string,
  sceneCount: number,
  auditBrief?: string,
  languageBrief?: string,
) {
  return [
    `Tu relis un script de vidéo courte écrit en ${langName}. Il compte ${sceneCount} plans, numérotés à partir de 0.`,
    auditBrief?.trim() || DEFAULT_AUDIT_BRIEF,
    `NIVEAU DE LANGUE du plan réécrit (inchangé) :\n${languageBrief?.trim() || DEFAULT_LANGUAGE_BRIEF}`,
    "TEST DE SUPPRESSION : pour chaque plan, demande-toi ce que le spectateur perdrait si on le coupait. Le plan dont la perte est la plus faible est le plan le plus faible.",
    "Tu ne renvoies QU'UN SEUL plan réécrit : celui que tu as désigné. Tu gardes son index et sa longueur (±10 % de caractères).",
    'Réponds uniquement en JSON: {"weakest":number,"reason":string,"learned":string,"narration":string}',
  ].join("\n");
}

/**
 * VÉRIFICATION DES FAITS, PLAN PAR PLAN. Le sujet seul ne suffit pas : une
 * phrase inventée au milieu du script passait sans contrôle (« des défenses
 * d'éléphant font penser à des dents de carnivore »). Cette passe corrige ou
 * supprime chaque affirmation non étayée, SANS remonter le niveau de langue.
 */
export function sceneFactCheckSystemPrompt(
  langName: string,
  sceneCount: number,
  languageBrief?: string,
) {
  return [
    `Tu vérifies, phrase par phrase, un script de vidéo courte écrit en ${langName}. Il compte ${sceneCount} plans, numérotés à partir de 0.`,
    "Tu examines CHAQUE affirmation factuelle et CHAQUE chiffre de CHAQUE plan.",
    "• Affirmation exacte → tu recopies le plan TEL QUEL, mot pour mot.",
    "• Affirmation fausse, exagérée, contestée ou inventée → tu la réécris avec ce qui est réellement établi, ou tu la SUPPRIMES et tu la remplaces par une information vraie de même nature.",
    "• Chiffre douteux → tu le recalcules ou tu donnes l'ordre de grandeur.",
    "TU NE REMONTES JAMAIS LE NIVEAU DE LANGUE. C'est la même contrainte de vocabulaire que le reste du script :",
    languageBrief?.trim() || DEFAULT_LANGUAGE_BRIEF,
    "Tu gardes la longueur de chaque plan corrigé (±10 % de caractères) : la durée de la vidéo est déjà calée.",
    "Tu ne touches ni à l'ordre des plans, ni à leur fonction, ni aux plans exacts.",
    'Réponds uniquement en JSON: {"scenes":[{"index":number,"narration":string,"fixed":boolean,"reason":string}]}',
  ].join("\n");
}
