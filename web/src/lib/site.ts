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
 * Adresse de l'application, distincte de celle du site.
 *
 * Le site vitrine et l'application vivent sur deux domaines : ADRESSE_SITE désigne
 * le premier, celui qu'annoncent le plan du site et les adresses canoniques, alors
 * que les liens envoyés par email et les retours de paiement doivent mener au second.
 * Les confondre envoie le destinataire sur une page qui n'existe pas.
 *
 * Une seule variable la porte, APP_URL. Il y en avait deux un moment, et deux
 * variables pour la même chose finissent toujours par diverger : celle qu'on oublie
 * de déclarer garde sa valeur par défaut, et les liens partent vers localhost sans
 * que personne s'en aperçoive avant qu'un client le signale.
 */
export function adresseApplication(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

/**
 * Adresse absolue vers laquelle un service extérieur nous renvoie.
 *
 * Sans APP_URL déclarée, on prend l'adresse de la requête en cours plutôt que la
 * valeur par défaut : en développement le port varie, et c'est aussi ce qui évite
 * qu'une session de paiement ouverte depuis un poste de travail renvoie le client en
 * production.
 */
export function adresseDeRetour(requete: Request, chemin: string): string {
  const declaree = process.env.APP_URL?.replace(/\/+$/, "");
  const base = declaree ?? new URL(requete.url).origin;
  return base + (chemin.startsWith("/") ? chemin : "/" + chemin);
}
