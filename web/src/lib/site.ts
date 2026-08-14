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
 * Elle a sa propre variable, et c'est nécessaire : ADRESSE_SITE désigne le site
 * vitrine, celui qu'annoncent le plan du site et les adresses canoniques, alors que
 * l'application vit sur un autre domaine. S'en servir ici renverrait le client de
 * Stripe sur la vitrine, où la route de retour n'existe pas.
 *
 * Sans déclaration, on prend l'adresse de la requête en cours. C'est le cas en
 * développement, où le port varie, et c'est aussi ce qui évite qu'une session de
 * paiement ouverte depuis un poste de travail renvoie le client en production.
 */
export function adresseDeRetour(requete: Request, chemin: string): string {
  const declaree = process.env.ADRESSE_APPLICATION?.replace(/\/+$/, "");
  const base = declaree ?? new URL(requete.url).origin;
  return base + (chemin.startsWith("/") ? chemin : "/" + chemin);
}
