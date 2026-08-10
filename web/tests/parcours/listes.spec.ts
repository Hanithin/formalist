import { test, expect } from "@playwright/test";

/**
 * Les trois listes portées : formalités, documents, contrats.
 *
 * Le jeu de données est créé par preparer.ts : deux dossiers dont un terminé,
 * deux documents dont un rejeté, deux contrats à des états différents.
 */

// La session est ouverte par preparer.ts et reprise par la configuration.

test.describe("formalités", () => {
  test("la liste montre les deux dossiers avec leur étape", async ({ page }) => {
    await page.goto("/formalites");
    await expect(page.getByText("PARCOURS EN COURS")).toBeVisible();
    await expect(page.getByText("PARCOURS TERMINEE")).toBeVisible();

    // Le libellé vient de la phase, pas d'un texte figé. Les essais de création
    // ajoutent d'autres dossiers à la même étape : on vise celui-ci.
    await expect(
      page.locator("li", { hasText: "PARCOURS EN COURS" }).getByText("En attente de signature")
    ).toBeVisible();
  });

  test("le filtre restreint la liste et se lit dans l'adresse", async ({ page }) => {
    await page.goto("/formalites");
    await page.getByRole("link", { name: "Terminées" }).click();

    await expect(page).toHaveURL(/filtre=terminee/);
    await expect(page.getByText("PARCOURS TERMINEE")).toBeVisible();
    await expect(page.getByText("PARCOURS EN COURS")).toHaveCount(0);
  });

  test("le filtre survit à un rechargement, donc se partage", async ({ page }) => {
    await page.goto("/formalites?filtre=terminee");
    await expect(page.getByText("PARCOURS EN COURS")).toHaveCount(0);
  });

  test("un filtre inventé ne casse pas la page", async ({ page }) => {
    await page.goto("/formalites?filtre=n-importe-quoi");
    // Retombe sur « toutes » plutôt que sur une liste vide ou une erreur
    await expect(page.getByText("PARCOURS EN COURS")).toBeVisible();
    await expect(page.getByText("PARCOURS TERMINEE")).toBeVisible();
  });

  test("le compte s'accorde au singulier", async ({ page }) => {
    await page.goto("/formalites?filtre=terminee");
    await expect(page.getByText("1 formalité", { exact: true })).toBeVisible();
  });
});

test.describe("documents", () => {
  test("un document rejeté annonce ce qu'il faut faire, avec le motif", async ({ page }) => {
    await page.goto("/documents");
    await expect(page.getByText("À remplacer")).toBeVisible();
    await expect(page.getByText("Motif : Document illisible")).toBeVisible();
  });

  test("les statuts techniques sont traduits", async ({ page }) => {
    await page.goto("/documents");
    // Les essais de génération ajoutent d'autres documents : on vise le premier.
    await expect(page.getByText("Généré").first()).toBeVisible();
    await expect(page.getByText("generated")).toHaveCount(0);
  });
});

test.describe("contrats", () => {
  test("la liste montre les deux contrats", async ({ page }) => {
    await page.goto("/contrats");
    await expect(page.getByText("Accord de confidentialité")).toBeVisible();
    await expect(page.getByText("Conditions générales de vente")).toBeVisible();
  });

  test("le filtre des signés ne garde que celui qui l'est", async ({ page }) => {
    await page.goto("/contrats?filtre=signe");
    await expect(page.getByText("Conditions générales de vente")).toBeVisible();
    await expect(page.getByText("Accord de confidentialité")).toHaveCount(0);
  });

  test("une liste vide invite à agir plutôt que de constater", async ({ page }) => {
    await page.goto("/contrats?filtre=en_validation");
    await expect(page.getByText("Aucun contrat dans ce filtre")).toBeVisible();
  });
});

test.describe("accès aux fichiers", () => {
  test("un fichier inconnu renvoie 404, sans dire s'il existe", async ({ request }) => {
    const reponse = await request.get("/api/fichier?nom=fichier-invente.pdf");
    expect(reponse.status()).toBe(404);
  });

  test("la traversée de répertoire est refusée", async ({ request }) => {
    const reponse = await request.get("/api/fichier?nom=" + encodeURIComponent("../../db.js"));
    expect(reponse.status()).toBe(404);
  });

  test("sans session, l'accès est refusé avant toute lecture", async ({ browser }) => {
    const anonyme = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const reponse = await anonyme.request.get("/api/fichier?nom=quelconque.pdf");
    expect(reponse.status()).toBe(401);
    await anonyme.close();
  });
});
