import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Le dépôt contient deux package-lock.json (racine et web/).
    // On fixe la racine sur web/ pour que Turbopack ne se trompe pas de workspace.
    root: fileURLToPath(new URL(".", import.meta.url)),
  },
  /*
   * Ouvrir le serveur de développement au réseau local, pour un téléphone.
   *
   * Next 16 refuse les requêtes croisées vers ses ressources internes - `/_next`,
   * `/__nextjs` - et n'autorise que l'hôte avec lequel il a démarré. Depuis un
   * téléphone, la page s'affichait mais la connexion de rechargement à chaud était
   * renvoyée en 403 : on ne voyait pas ses modifications, sans savoir pourquoi.
   *
   * Le motif couvre le sous-réseau entier plutôt qu'une adresse : elle est distribuée
   * par la box et change d'un jour à l'autre. Il ne vaut qu'en développement, où le
   * cookie de session n'est pas non plus marqué `secure` - il n'ouvre donc rien en
   * production.
   */
  allowedDevOrigins: ["192.168.1.*", "192.168.0.*"],
};

export default nextConfig;
