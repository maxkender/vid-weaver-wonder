/**
 * Garde-fou papier v2 : détection des métaphores mécaniques bannies.
 *
 * Fonction pure, sans dépendance réseau : la comparaison se fait sur des MOTS
 * ENTIERS, après suppression des accents, pour éviter les faux positifs
 * (« machinalement » ne doit pas matcher « machine »).
 */
import { V2_MOTS_BANNIS } from "./style-presets";

/** Minuscules, sans accents, ponctuation et apostrophes réduites à des espaces. */
function normalizeWords(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Les mots bannis trouvés dans `text` (mots entiers, singulier ou pluriel). */
export function findMechanicalWords(text: string, banned: string[] = V2_MOTS_BANNIS): string[] {
  const words = normalizeWords(text);
  const hay = ` ${words.join(" ")} `;
  const found: string[] = [];
  for (const term of banned) {
    const seq = normalizeWords(term).join(" ");
    if (!seq) continue;
    if (hay.includes(` ${seq} `) || hay.includes(` ${seq}s `)) found.push(term);
  }
  return found;
}

/** Vrai si le texte contient au moins une métaphore mécanique bannie. */
export function hasMechanicalMetaphor(text: string, banned?: string[]): boolean {
  return findMechanicalWords(text, banned).length > 0;
}
