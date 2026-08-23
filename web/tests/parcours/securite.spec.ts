import { test, expect } from "@playwright/test";

/**
 * En-têtes de sécurité et anciennes adresses.
 *
 * Le serveur d'origine devait autoriser les scripts en ligne : tout son
 * JavaScript était écrit dans les pages. Ces vérifications empêchent d'y revenir.
 */

test.describe("politique de sécurité de contenu", () => {
  test("les pages d'application n'autorisent aucun script en ligne", async ({ page }) => {
    const reponse = await page.goto("/tableau-de-bord");
    const politique = reponse!.headers()["content-security-policy"];

    const scripts = politique.match(/script-src ([^;]*)/)![1];
    expect(scripts).not.toContain("unsafe-inline");
    // React réclame eval() en développement ; la tolérance ne doit pas suivre
    // jusqu'en production, où ces parcours s'exécutent.
    expect(scripts).not.toContain("unsafe-eval");
    expect(scripts).toContain("nonce-");
    expect(scripts).toContain("strict-dynamic");
  });

  test("chaque page reçoit un jeton différent", async ({ page }) => {
    const premier = (await page.goto("/tableau-de-bord"))!.headers()["content-security-policy"];
    const second = (await page.goto("/documents"))!.headers()["content-security-policy"];

    const jeton = (p: string) => p.match(/nonce-([a-f0-9]+)/)![1];
    expect(jeton(premier)).not.toBe(jeton(second));
  });

  test("les scripts de la page portent le jeton", async ({ page }) => {
    await page.goto("/tableau-de-bord");
    const sansJeton = await page.locator("script:not([nonce]):not([src])").count();
    expect(sansJeton).toBe(0);
  });

  test("les en-têtes de protection sont présents", async ({ page }) => {
    const entetes = (await page.goto("/tableau-de-bord"))!.headers();
    expect(entetes["x-content-type-options"]).toBe("nosniff");
    expect(entetes["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(entetes["x-frame-options"]).toBe("SAMEORIGIN");
  });

  test("la politique interdit les objets et fixe la base", async ({ page }) => {
    const politique = (await page.goto("/tableau-de-bord"))!.headers()[
      "content-security-policy"
    ];
    expect(politique).toContain("object-src 'none'");
    expect(politique).toContain("base-uri 'self'");
    expect(politique).toContain("form-action 'self'");
  });
});

test.describe("anciennes adresses", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("une page en .html redirige de façon permanente", async ({ request }) => {
    const reponse = await request.get("/dashboard.html", { maxRedirects: 0 });
    expect(reponse.status()).toBe(308);
    expect(reponse.headers()["location"]).toContain("/tableau-de-bord");
  });

  test("l'identifiant de dossier suit le changement de nom", async ({ request }) => {
    // Les liens reçus par email portent ?id= : ils doivent ouvrir le bon dossier.
    const reponse = await request.get("/creation.html?id=42", { maxRedirects: 0 });
    expect(reponse.headers()["location"]).toContain("/creation?dossier=42");
  });

  test("l'ancienne vitrine mène à la connexion", async ({ request }) => {
    const reponse = await request.get("/index.html", { maxRedirects: 0 });
    expect(reponse.status()).toBe(308);
    // L'en-tête peut être relatif ou absolu selon le cadre : on compare le chemin.
    const destination = reponse.headers()["location"];
    const chemin = destination.startsWith("http") ? new URL(destination).pathname : destination;
    expect(chemin).toBe("/connexion");
  });

  test("une adresse en .html inconnue n'est pas redirigée au hasard", async ({ request }) => {
    const reponse = await request.get("/page-inventee.html", { maxRedirects: 0 });
    expect(reponse.status()).not.toBe(308);
  });
});
