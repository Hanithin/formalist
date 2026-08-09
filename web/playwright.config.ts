import { defineConfig } from "@playwright/test";

/**
 * Parcours critiques : connexion, création de société, signature, dépôt de document.
 * Ce sont les seuls chemins dont une régression est inacceptable ; le reste est
 * couvert par les tests de domaine, plus rapides.
 */
export default defineConfig({
  testDir: "./tests/parcours",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run build && npm run start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
