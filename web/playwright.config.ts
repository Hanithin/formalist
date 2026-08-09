import { defineConfig } from "@playwright/test";

/**
 * Parcours critiques : connexion, création de société, signature, dépôt de document.
 * Ce sont les seuls chemins dont une régression est inacceptable ; le reste est
 * couvert par les tests de domaine, plus rapides.
 */
export default defineConfig({
  testDir: "./tests/parcours",
  // Crée le compte d'essai avant la série
  globalSetup: "./tests/parcours/preparer.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3100",
    trace: "on-first-retry",
  },
  webServer: {
    // Port distinct : le serveur d'origine occupe le 3000 pendant la migration,
    // et Playwright réutiliserait sa réponse en croyant tester Next.
    command: "npm run build && npm run start -- --port 3100",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
