import type { MetadataRoute } from "next";

/**
 * Rien à indexer ici.
 *
 * La vitrine, seule partie destinée aux moteurs, est passée sur un autre site.
 * Ce domaine ne sert plus que l'application : chaque adresse exige une session,
 * et l'explorer ne produirait que des redirections vers la page de connexion.
 * Le plan du site a disparu avec les pages qu'il listait.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
  };
}
