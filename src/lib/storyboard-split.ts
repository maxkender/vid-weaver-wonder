/**
 * Découpage d'une narration en plans (style papier v2).
 *
 * Fonction pure, sans appel réseau : le texte n'est JAMAIS réécrit, il est
 * seulement regroupé. La concaténation des plans reste identique au texte
 * d'origine (aux espaces de jonction près).
 */

/** Nombre de mots d'une phrase. */
function words(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Découpe brute aux fins de phrase, ponctuation conservée. */
function rawSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Regroupe les phrases en plans :
 * - une question très courte (moins de 5 mots) reste collée à sa réponse ;
 * - une phrase courte est rattachée à la phrase précédente ;
 * - au-delà de 18 plans, on fusionne les deux voisins les plus courts.
 */
export function splitIntoShots(narration: string, maxShots = 18): string[] {
  const sentences = rawSentences(narration);
  if (!sentences.length) return [];

  const shots: string[] = [];
  let pendingQuestion: string | null = null;

  for (const sentence of sentences) {
    if (pendingQuestion) {
      shots.push(`${pendingQuestion} ${sentence}`);
      pendingQuestion = null;
      continue;
    }
    if (sentence.endsWith("?") && words(sentence) < 5) {
      pendingQuestion = sentence;
      continue;
    }
    if (words(sentence) < 6 && shots.length) {
      shots[shots.length - 1] = `${shots[shots.length - 1]} ${sentence}`;
      continue;
    }
    shots.push(sentence);
  }
  if (pendingQuestion) {
    if (shots.length) shots[shots.length - 1] = `${shots[shots.length - 1]} ${pendingQuestion}`;
    else shots.push(pendingQuestion);
  }

  while (shots.length > maxShots) {
    let best = 0;
    let bestLen = Infinity;
    for (let i = 0; i < shots.length - 1; i++) {
      const len = words(shots[i]!) + words(shots[i + 1]!);
      if (len < bestLen) {
        bestLen = len;
        best = i;
      }
    }
    shots.splice(best, 2, `${shots[best]} ${shots[best + 1]}`);
  }

  return shots;
}
