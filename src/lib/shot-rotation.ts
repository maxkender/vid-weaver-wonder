/**
 * ROTATION DES TYPES DE PLAN.
 *
 * La signature de la chaîne (papier découpé, palette, lumière, unique élément
 * rouge) ne bouge JAMAIS. Ce qui change à chaque plan, c'est le sujet,
 * l'échelle et le cadrage : sans cette rotation, les huit plans finissent tous
 * dans la même grotte avec le même personnage à la même distance.
 *
 * Module pur : aucune dépendance navigateur ni serveur.
 */

import { SHOT_TYPES, type ShotTypeId } from "./style-presets";

export type ShotType = (typeof SHOT_TYPES)[number];

export function shotById(id: ShotTypeId): ShotType {
  return SHOT_TYPES.find((s) => s.id === id) ?? SHOT_TYPES[0];
}

export function shotLabel(id: ShotTypeId): string {
  return shotById(id).label;
}

/** Consigne de cadrage envoyée au générateur d'images pour ce type de plan. */
export function shotPrompt(id: ShotTypeId): string {
  return `${shotById(id).prompt}. The art direction, the palette, the paper style, the lighting and the single vivid red accent element stay exactly the same as the other shots: only the subject, the scale and the framing change.`;
}

function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Affinité d'un type de plan avec ce que raconte le texte du plan. */
function affinity(shot: ShotType, text: string) {
  const t = normalize(text);
  return shot.keywords.reduce((n, k) => (t.includes(normalize(k)) ? n + 1 : n), 0);
}

/**
 * Attribue un type de plan à chaque scène : le type colle à ce que dit le
 * texte, et deux plans VOISINS ne partagent jamais le même type.
 */
export function assignShotTypes(texts: string[]): ShotTypeId[] {
  const out: ShotTypeId[] = [];
  const used = new Map<ShotTypeId, number>();
  texts.forEach((text, i) => {
    const previous = out[i - 1];
    const ranked = SHOT_TYPES.filter((s) => s.id !== previous)
      .map((s, order) => ({
        id: s.id as ShotTypeId,
        // Pertinence d'abord, puis variété : un type déjà beaucoup utilisé
        // recule, à affinité égale on suit l'ordre de la liste.
        score: affinity(s, text) * 10 - (used.get(s.id as ShotTypeId) ?? 0) * 3 - order * 0.1,
      }))
      .sort((a, b) => b.score - a.score);
    const picked = ranked[0]?.id ?? SHOT_TYPES[0].id;
    used.set(picked, (used.get(picked) ?? 0) + 1);
    out.push(picked);
  });
  return out;
}

/**
 * Type de REMPLACEMENT quand deux images voisines se ressemblent trop : on
 * change franchement d'échelle, sans jamais reprendre le type d'un voisin.
 */
export function alternativeShot(current: ShotTypeId, neighbours: (ShotTypeId | undefined)[]) {
  const banned = new Set<ShotTypeId>([current, ...neighbours.filter(Boolean) as ShotTypeId[]]);
  // On s'éloigne le plus possible du type actuel dans la liste (échelles
  // opposées : un très gros plan devient une carte, un plan large un objet seul).
  const order = SHOT_TYPES.map((s) => s.id as ShotTypeId);
  const from = order.indexOf(current);
  for (let step = Math.floor(order.length / 2); step > 0; step--) {
    const candidate = order[(from + step) % order.length]!;
    if (!banned.has(candidate)) return candidate;
  }
  return order.find((id) => !banned.has(id)) ?? current;
}
