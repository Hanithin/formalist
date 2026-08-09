import { listerArticles } from "@/infrastructure/contenu/blog";
import { adresseAbsolue, ADRESSE_SITE } from "@/lib/site";

/**
 * Flux RSS du blog.
 *
 * Servi en dynamique plutôt qu'écrit à la main : un flux tenu à la main finit
 * toujours par retarder d'un article sur le site.
 */

function echapper(texte: string): string {
  return texte
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function GET() {
  const articles = await listerArticles();

  const entrees = articles
    .map(
      (a) => `    <item>
      <title>${echapper(a.titre)}</title>
      <link>${adresseAbsolue("/blog/" + a.identifiant)}</link>
      <guid isPermaLink="true">${adresseAbsolue("/blog/" + a.identifiant)}</guid>
      <pubDate>${a.publieLe.toUTCString()}</pubDate>
      <description>${echapper(a.resume)}</description>
    </item>`
    )
    .join("\n");

  const flux = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Formalist - le blog</title>
    <link>${ADRESSE_SITE}</link>
    <description>Création et modification de sociétés, expliquées simplement.</description>
    <language>fr-FR</language>
${entrees}
  </channel>
</rss>`;

  return new Response(flux, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
