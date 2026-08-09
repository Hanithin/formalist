import type { MetadataRoute } from "next";
import { listerArticles } from "@/infrastructure/contenu/blog";
import { adresseAbsolue } from "@/lib/site";

/**
 * Plan du site, construit depuis le catalogue.
 *
 * Le site n'en avait aucun jusqu'ici : chaque article devait être découvert par
 * exploration. Les pages de l'application n'y figurent pas, elles exigent une
 * session et n'ont rien à faire dans un index.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const articles = await listerArticles();

  const pages: MetadataRoute.Sitemap = [
    { url: adresseAbsolue("/"), changeFrequency: "weekly", priority: 1 },
    { url: adresseAbsolue("/blog"), changeFrequency: "weekly", priority: 0.8 },
    { url: adresseAbsolue("/contact"), changeFrequency: "yearly", priority: 0.5 },
  ];

  return pages.concat(
    articles.map((a) => ({
      url: adresseAbsolue("/blog/" + a.identifiant),
      lastModified: a.publieLe,
      changeFrequency: "yearly" as const,
      priority: 0.6,
    }))
  );
}
