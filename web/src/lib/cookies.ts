/**
 * Nom du cookie de session.
 *
 * Défini ici, dans lib, et non dans l'infrastructure : le filtre de requêtes en a
 * besoin, or il s'exécute dans un environnement restreint où importer la couche
 * base entraînerait Prisma avec elle.
 */
export const NOM_COOKIE = "formalist_session";
