/**
 * Les seules adresses accessibles sans être connecté.
 *
 * Tout le reste est protégé. C'est l'inverse du serveur d'origine, où une route
 * était ouverte tant qu'on n'avait pas pensé à la garder - c'est ainsi que
 * /api/file a servi des pièces d'identité sans authentification pendant des mois.
 *
 * Ajouter une entrée ici est une décision : elle se voit en revue, et le test
 * routes-publiques.test.ts oblige à la justifier.
 */

/** Pages et ressources servies à tout le monde. */
export const PAGES_PUBLIQUES = [
  "/",
  "/connexion",
  "/inscription",
  "/mot-de-passe-oublie",
  "/contact",
  "/blog",
] as const;

/** Points d'entrée ouverts, parce qu'ils servent justement à s'authentifier. */
export const API_PUBLIQUES = [
  "/api/auth/connexion",
  "/api/auth/inscription",
  "/api/auth/verifier",
  "/api/auth/renvoyer-verification",
  "/api/contact",
  // Les associés signent sans compte : leur jeton fait foi.
  "/api/signature/signer",
] as const;

/** Chemins techniques servis par le cadre, jamais porteurs de données. */
const PREFIXES_TECHNIQUES = [
  "/_next/",
  "/fonts/",
  "/images/",
  "/favicon",
  "/robots.txt",
  "/sitemap.xml",
  "/flux.xml",
];

export function estPublic(chemin: string): boolean {
  const propre = chemin.length > 1 ? chemin.replace(/\/+$/, "") : chemin;

  if ((PAGES_PUBLIQUES as readonly string[]).includes(propre)) return true;
  if ((API_PUBLIQUES as readonly string[]).includes(propre)) return true;

  // Le blog a des articles : /blog/mon-article est public comme /blog
  if (propre.startsWith("/blog/")) return true;

  // Page de signature : l'associé n'a pas de compte, son jeton est dans l'adresse.
  if (propre.startsWith("/signer/")) return true;

  return PREFIXES_TECHNIQUES.some((p) => propre.startsWith(p));
}
