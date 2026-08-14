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

/**
 * Adresse absolue vers laquelle un service extérieur nous renvoie.
 *
 * ADRESSE_SITE ne convient pas ici : sa valeur par défaut est le site public, et une
 * session de paiement ouverte depuis un poste de développement renverrait le client
 * en production. L'adresse de la requête en cours est donc préférée quand le site
 * n'est pas explicitement déclaré - c'est le cas en développement, où le port varie.
 */
export function adresseDeRetour(requete: Request, chemin: string): string {
  const declaree = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
  const base = declaree ?? new URL(requete.url).origin;
  return base + (chemin.startsWith("/") ? chemin : "/" + chemin);
}
