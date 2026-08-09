import type { MetadataRoute } from "next";
import { adresseAbsolue } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // L'application demande une session : l'explorer ne produirait que des
      // redirections vers la page de connexion.
      disallow: ["/api/", "/tableau-de-bord", "/formalites", "/documents", "/equipe", "/avocat", "/administration"],
    },
    sitemap: adresseAbsolue("/sitemap.xml"),
  };
}
