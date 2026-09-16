/**
 * Règle d'accès : un posteur suspendu perd l'usage de la plateforme.
 *
 * La suspension est le geste que l'on fait quand quelqu'un quitte l'équipe :
 * elle doit fermer l'accès côté SERVEUR (liste des vidéos, lien signé, toutes
 * les actions de l'espace), pas seulement changer une étiquette dans un
 * tableau. L'administrateur n'est jamais concerné par cette règle.
 */

export type AccessProfile = {
  role: "admin" | "poster" | string;
  status: string;
};

export const SUSPENDED_MESSAGE =
  "Ton accès à la plateforme a été suspendu. Contacte l'administrateur pour le rétablir.";

/** Vrai si ce profil doit être bloqué (posteur suspendu, jamais un admin). */
export function isAccessSuspended(profile: AccessProfile | null | undefined): boolean {
  if (!profile) return false;
  if (profile.role === "admin") return false;
  return profile.status === "suspended";
}

/** Lève une erreur lisible si le profil est suspendu. */
export function assertActiveAccess(profile: AccessProfile | null | undefined): void {
  if (isAccessSuspended(profile)) throw new Error(SUSPENDED_MESSAGE);
}
