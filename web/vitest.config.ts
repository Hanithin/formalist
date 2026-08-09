import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    // Le domaine se teste sans base ni serveur : c'est tout l'intérêt de l'isoler.
    include: ["tests/unite/**/*.test.ts", "tests/integration/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
});
