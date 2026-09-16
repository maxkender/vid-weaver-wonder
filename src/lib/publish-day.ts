/**
 * Jour de diffusion : règles partagées entre le serveur et l'affichage.
 *
 * La diffusion est calée sur le fuseau de `distribution_settings.timezone`
 * (Europe/Paris par défaut) : entre minuit et 2 h du matin à Paris, la date UTC
 * est encore celle de la veille, ce qui décalerait la « vidéo du jour ».
 */
export const DEFAULT_TIMEZONE = "Europe/Paris";

/** Jour courant (AAAA-MM-JJ) dans le fuseau de diffusion. */
export function localDay(timeZone: string = DEFAULT_TIMEZONE, date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * Une vidéo n'est diffusable que si sa date est arrivée : une vidéo datée
 * demain ne doit jamais être listée ni signée, même pour son propre posteur.
 */
export function isReleased(publishDate: string, today: string): boolean {
  return publishDate <= today;
}

/** Une vidéo appartient à l'historique si sa date est strictement passée. */
export function isPast(publishDate: string, today: string): boolean {
  return publishDate < today;
}
