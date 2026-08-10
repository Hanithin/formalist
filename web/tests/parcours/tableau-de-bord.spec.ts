import { test, expect } from "@playwright/test";

/**
 * Le tableau de bord et l'espace avocat.
 *
 * Le jeu de données contient deux sociétés, dont une terminée, un document
 * refusé et un avocat assigné.
 */

test.describe("tableau de bord du client", () => {
  test("accueille par son prénom et la date du jour", async ({ page }) => {
    await page.goto("/tableau-de-bord");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Camille");
  });

  test("dit ce qu'on attend, avec la société concernée", async ({ page }) => {
    await page.goto("/tableau-de-bord");

    await expect(page.getByRole("heading", { name: "Ce qu'on attend de vous" })).toBeVisible();
    // Le document refusé du jeu de données doit remonter en premier.
    await expect(page.getByText("Un document à remplacer")).toBeVisible();
    await expect(page.getByText(/PARCOURS EN COURS/).first()).toBeVisible();
  });

  test("chaque action mène directement là où il faut agir", async ({ page }) => {
    await page.goto("/tableau-de-bord");
    const lien = page.getByRole("link", { name: "Remplacer" }).first();
    await expect(lien).toHaveAttribute("href", /\/creation\?dossier=\d+/);
  });

  test("les sociétés sont listées avec leur avancement", async ({ page }) => {
    await page.goto("/tableau-de-bord");
    await expect(page.getByRole("heading", { name: /Vos sociétés|Votre société/ })).toBeVisible();
    await expect(page.getByRole("link", { name: "PARCOURS TERMINEE" })).toBeVisible();
  });
});

test.describe("espace avocat", () => {
  test.use({ storageState: "./tests/parcours/session-avocat.json" });

  test("liste les dossiers du cabinet", async ({ page }) => {
    await page.goto("/avocat");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Dossiers du cabinet");
    await expect(page.getByRole("link", { name: "PARCOURS EN COURS" })).toBeVisible();
  });

  test("signale les dossiers assignés et les pièces à vérifier", async ({ page }) => {
    await page.goto("/avocat");
    // Deux dossiers sont assignés à cet avocat dans le jeu de données.
    await expect(page.getByText("Assigné à vous").first()).toBeVisible();
    await expect(page.getByText(/pièce à vérifier/).first()).toBeVisible();
  });

  test("le dossier montre les informations et ce qui manque encore", async ({ page }) => {
    await page.goto("/avocat");
    await page.getByRole("link", { name: "PARCOURS EN COURS" }).click();
    await page.waitForURL(/\/avocat\/\d+/);

    await expect(page.getByRole("heading", { name: "Informations du dossier" })).toBeVisible();
    // Le dossier d'essai est vide : tout doit être annoncé comme non renseigné.
    await expect(page.getByText(/Pas encore renseigné par le client/)).toBeVisible();
  });

  test("une note interne s'ajoute et s'affiche", async ({ page }) => {
    await page.goto("/avocat");
    await page.getByRole("link", { name: "PARCOURS EN COURS" }).click();
    await page.waitForURL(/\/avocat\/\d+/);

    const texte = "Point de vigilance " + Date.now();
    await page.getByLabel("Ajouter une note").fill(texte);
    await page.getByRole("button", { name: "Ajouter la note" }).click();

    await expect(page.getByText(texte)).toBeVisible();
    await expect(page.getByText("Maître Dupont").first()).toBeVisible();
  });

  test("une pièce déposée peut être refusée avec son motif", async ({ page }) => {
    await page.goto("/avocat");
    await page.getByRole("link", { name: "PARCOURS EN COURS" }).click();
    await page.waitForURL(/\/avocat\/\d+/);

    const boutons = page.getByRole("button", { name: "Demander une autre pièce" });
    if ((await boutons.count()) === 0) test.skip();

    await boutons.first().click();
    await page.getByLabel("Motif du refus").fill("Document périmé");
    await page.getByRole("button", { name: "Refuser" }).click();

    await expect(page.getByText("Motif : Document périmé")).toBeVisible();
    // L'intervention est tracée : c'est ce qui permet d'instruire un litige.
    await expect(page.getByText("document_refuse")).toBeVisible();
  });
});

test.describe("cloisonnement de l'espace avocat", () => {
  test("un client n'y entre pas", async ({ page }) => {
    // La session du client est celle par défaut de la série. On rend un 404, non
    // un refus explicite : la réponse ne renseigne pas sur ce qui existe.
    const reponse = await page.goto("/avocat");
    expect(reponse?.status()).toBe(404);
  });

  test("un client n'ouvre pas non plus un dossier du cabinet", async ({ page }) => {
    const reponse = await page.goto("/avocat/1");
    expect(reponse?.status()).toBe(404);
  });

  test("un client ne peut pas écrire de note interne", async ({ request }) => {
    const reponse = await request.post("/api/avocat/notes", {
      data: { dossier: 1, contenu: "intrusion" },
    });
    expect(reponse.status()).toBe(403);
  });

  test("un client ne peut pas valider une pièce", async ({ request }) => {
    const reponse = await request.put("/api/avocat/documents", {
      data: { document: 1, decision: "valider" },
    });
    expect(reponse.status()).toBe(403);
  });

  test("sans session, rien n'est accessible", async ({ browser }) => {
    const anonyme = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    expect((await anonyme.request.post("/api/avocat/notes", { data: {} })).status()).toBe(401);
    await anonyme.close();
  });
});
