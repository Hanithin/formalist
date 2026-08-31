import { defineConfig } from "vitest/config";
import path from "path";

/**
 * Les vérifications que l'on lance à la main, contre un service réel.
 *
 * Elles ne peuvent pas rejoindre la suite : elles appellent l'INPI, et un test qui
 * dépend d'un tiers échoue les jours où ce tiers est indisponible. Un rouge qui ne
 * dit rien du code apprend à ignorer les rouges.
 *
 * Elles vivent donc dans leur propre dossier, hors du `include` de vitest.config.ts,
 * et se lancent par leur commande : `npm run guichet:ping`.
 */
export default defineConfig({
  test: {
    include: ["tests/manuel/**/*.test.ts"],
    /* Ces vérifications lisent `process.env` comme le fait l'application. */
    setupFiles: ["./tests/manuel/environnement.ts"],
    environment: "node",
    fileParallelism: false,
    /* Un service distant répond plus lentement qu'une fonction pure. */
    testTimeout: 30_000,
  },
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
});
