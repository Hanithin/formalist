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

/**
 * « Jeudi 20 août 2026 à 10h00 » : la date et l'heure d'un rendez-vous.
 *
 * Intl écrit l'heure « 10:00 ». Les deux points sont la notation anglaise ; en
 * français l'heure s'écrit avec un h, et c'est ce que faisait fmtDateLong.
 */
export function dateHeureLongue(quand: Date): string {
  const jour = dateEnTete(quand);
  const heure = new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(quand)
    .replace(":", "h");

  return jour + " à " + heure;
}

/** « 10h00 » seul, pour une liste de créneaux d'une même journée. */
export function heureCourte(quand: Date): string {
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" })
    .format(quand)
    .replace(":", "h");
}
