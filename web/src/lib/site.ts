/**
 * Adresse publique du site.
 *
 * Les moteurs de recherche exigent des adresses absolues dans le plan du site, le
 * flux et les données structurées. Une adresse relative y est simplement ignorée.
 */
export const ADRESSE_SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://formalist.fr").replace(
  /\/+$/,
  ""
);

export function adresseAbsolue(chemin: string): string {
  return ADRESSE_SITE + (chemin.startsWith("/") ? chemin : "/" + chemin);
}
