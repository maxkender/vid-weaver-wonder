/**
 * Suivi du COÛT RÉEL d'une vidéo : quantités réellement commandées, poste par
 * poste. On n'invente aucun prix — les tarifs sont saisis par l'utilisateur
 * dans les Paramètres, et tant qu'ils sont vides seules les quantités
 * s'affichent.
 */

/** Consommation renvoyée par la passerelle IA, conservée telle quelle. */
export type TokenUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

export type UsageReport = {
  /** Plans animés commandés et total de secondes de vidéo IA. */
  clips: { count: number; seconds: number };
  /** Images générées (plans + reprises). */
  images: number;
  /** Caractères envoyés à ElevenLabs, par langue (1 crédit par caractère). */
  voiceChars: Record<string, number>;
  /** Appels de texte : écriture du script, vérification des faits, traductions. */
  textCalls: { script: number; factCheck: number; translation: number };
  /** Jetons rapportés par la passerelle, quand elle les renvoie. */
  tokens: TokenUsage;
};

export function emptyUsage(): UsageReport {
  return {
    clips: { count: 0, seconds: 0 },
    images: 0,
    voiceChars: {},
    textCalls: { script: 0, factCheck: 0, translation: 0 },
    tokens: {},
  };
}

export function addTokens(base: TokenUsage, extra?: TokenUsage | null): TokenUsage {
  if (!extra) return base;
  return {
    promptTokens: (base.promptTokens ?? 0) + (extra.promptTokens ?? 0),
    completionTokens: (base.completionTokens ?? 0) + (extra.completionTokens ?? 0),
    totalTokens: (base.totalTokens ?? 0) + (extra.totalTokens ?? 0),
  };
}

/** Total des caractères de voix off, toutes langues confondues. */
export function totalVoiceChars(u: UsageReport) {
  return Object.values(u.voiceChars).reduce((n, v) => n + v, 0);
}

/** Le rapport contient-il quelque chose à afficher ? */
export function hasUsage(u: UsageReport | null | undefined) {
  if (!u) return false;
  return (
    u.clips.count > 0 ||
    u.images > 0 ||
    totalVoiceChars(u) > 0 ||
    u.textCalls.script + u.textCalls.factCheck + u.textCalls.translation > 0
  );
}

/** Montant en euros, uniquement si l'utilisateur a renseigné ses tarifs. */
export function moneyTotal(
  u: UsageReport,
  prices: { perVideoSecond?: number | null; perImage?: number | null },
): number | null {
  const perSec = prices.perVideoSecond;
  const perImg = prices.perImage;
  if (!perSec && !perImg) return null;
  return (perSec ? u.clips.seconds * perSec : 0) + (perImg ? u.images * perImg : 0);
}

export function formatEuros(v: number) {
  return `${v.toFixed(2).replace(".", ",")} €`;
}
