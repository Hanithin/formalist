import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Le dépôt contient deux package-lock.json (racine et web/).
    // On fixe la racine sur web/ pour que Turbopack ne se trompe pas de workspace.
    root: fileURLToPath(new URL(".", import.meta.url)),
  },
};

export default nextConfig;
