import { test, expect } from "@playwright/test";

/**
 * La modification de société.
 *
 * Le jeu de données contient deux sociétés créées : PARCOURS EN COURS et
 * PARCOURS TERMINEE.
 */

test("la page propose les sociétés existantes et les changements possibles", async ({ page }) => {
  await page.goto("/modification");

  await expect(page.getByLabel("Société à modifier")).toBeVisible();
  await expect(page.getByRole("button", { name: /Transfert de siège social/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Changement de dénomination/ })).toBeVisible();
});

test("choisir un changement ouvre son formulaire", async ({ page }) => {
  await page.goto("/modification");
  await page.getByRole("button", { name: /Transfert de siège social/ }).click();

  await expect(page).toHaveURL(/dossier=\d+/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Transfert de siège social");
  await expect(page.getByLabel("Nouvelle adresse")).toBeVisible();
});

test("les champs demandés dépendent du changement choisi", async ({ page }) => {
  await page.goto("/modification");
  await page.getByRole("button", { name: /Changement de dénomination/ }).click();

  await expect(page.getByLabel("Nouveau nom")).toBeVisible();
  // Un changement de nom ne demande pas d'adresse
  await expect(page.getByLabel("Nouvelle adresse")).toHaveCount(0);
});

test("un dossier incomplet ne produit pas de document troué", async ({ page }) => {
  await page.goto("/modification");
  await page.getByRole("button", { name: /Transfert de siège social/ }).click();

  await page.getByRole("button", { name: /Générer les documents/ }).click();
  await expect(page.locator("form p[role=alert]")).toContainText("requis");
});

test("un code postal incomplet est signalé, comme à la création", async ({ page }) => {
  await page.goto("/modification");
  await page.getByRole("button", { name: /Transfert de siège social/ }).click();

  await page.getByLabel("Nouvelle adresse").fill("5 avenue des Tilleuls");
  await page.getByLabel("Nouveau code postal").fill("690");
  await page.getByLabel("Nouvelle ville").fill("Lyon");
  await page.getByRole("button", { name: /Générer les documents/ }).click();

  await expect(page.locator("form p[role=alert]")).toContainText("cinq chiffres");
});

test("un dossier complet produit son procès-verbal", async ({ page }) => {
  await page.goto("/modification");
  await page.getByRole("button", { name: /Transfert de siège social/ }).click();

  await page.getByLabel("Nouvelle adresse").fill("5 avenue des Tilleuls");
  await page.getByLabel("Nouveau code postal").fill("69003");
  await page.getByLabel("Nouvelle ville").fill("Lyon");
  await page.getByRole("button", { name: /Générer les documents/ }).click();

  await expect(page.getByRole("status")).toContainText("Documents produits");
  await expect(page.getByText(/Procès-verbal - Transfert de siège social/)).toBeVisible();
});

test("le brouillon est retrouvé après un rechargement", async ({ page }) => {
  await page.goto("/modification");
  await page.getByRole("button", { name: /Changement de dénomination/ }).click();
  // On attend la navigation avant de retenir l'adresse : la lire tout de suite
  // rendait celle de la page précédente.
  await page.waitForURL(/dossier=\d+/);
  const adresse = page.url();

  await page.getByLabel("Nouveau nom").fill("NOUVELLE ENSEIGNE");
  await page.getByRole("button", { name: /Générer les documents/ }).click();
  await expect(page.getByRole("status")).toContainText("Documents produits");

  await page.goto(adresse);
  await expect(page.getByLabel("Nouveau nom")).toHaveValue("NOUVELLE ENSEIGNE");
});

test.describe("accès", () => {
  test("sans session, la modification est refusée", async ({ browser }) => {
    const anonyme = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const reponse = await anonyme.request.post("/api/formalites/modification", {
      data: { societe: 1, typeModification: "denomination" },
    });
    expect(reponse.status()).toBe(401);
    await anonyme.close();
  });

  test("la société d'un autre client est refusée", async ({ request }) => {
    const reponse = await request.post("/api/formalites/modification", {
      data: { societe: 999999, typeModification: "denomination" },
    });
    expect(reponse.status()).toBe(403);
  });

  test("un type de modification inventé est refusé", async ({ page, request }) => {
    await page.goto("/modification");
    const societe = await page.getByLabel("Société à modifier").inputValue();

    const reponse = await request.post("/api/formalites/modification", {
      data: { societe: Number(societe), typeModification: "changement_de_couleur" },
    });
    expect(reponse.status()).toBe(400);
  });
});
