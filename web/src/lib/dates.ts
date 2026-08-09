/** Formatage de date en français, sans dépendance. */
export function formaterDate(d: Date): string {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(d);
}
