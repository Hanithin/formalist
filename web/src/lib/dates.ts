/** Formatage de date en français, sans dépendance. */
export function formaterDate(d: Date): string {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(d);
}

/**
 * La date du jour en toutes lettres, capitale initiale.
 *
 * Intl rend « jeudi 13 août 2026 » : correct en français au fil d'une phrase, mais
 * pas en tête de page. Les pages d'origine posaient donc la capitale à la main, et
 * cette règle vivait ici en deux copies - dont une seule capitalisait.
 */
export function dateEnTete(quand: Date = new Date()): string {
  const texte = new Intl.DateTimeFormat("fr-FR", { dateStyle: "full" }).format(quand);
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}
