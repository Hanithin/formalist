import { test, expect } from "@playwright/test";

/**
 * Le parcours de création.
 *
 * Le point vérifié en priorité : le brouillon vit sur le serveur. Dans la version
 * d'origine il était dans le navigateur, donc perdu en changeant d'appareil.
 */

test("ouvrir la création crée un dossier et le met dans l'adresse", async ({ page }) => {
  await page.goto("/creation");
  // Sans identifiant dans l'adresse, un rechargement créerait un dossier de plus.
  await expect(page).toHaveURL(/dossier=\d+/);
});

test("l'étape 1 refuse de passer tant qu'elle est incomplète", async ({ page }) => {
  await page.goto("/creation");
  await page.getByRole("button", { name: "Continuer" }).click();

  await expect(page.getByText("Choisissez une forme juridique")).toBeVisible();
  await expect(page.getByText("Indiquez le nom de la société")).toBeVisible();
  // On reste sur l'étape 1
  await expect(page.getByRole("heading", { level: 2 })).toContainText("Informations de la société");
});

test("un code postal incomplet est signalé", async ({ page }) => {
  await page.goto("/creation");
  await page.getByLabel("Code postal").fill("750");
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.getByText("Le code postal comporte cinq chiffres")).toBeVisible();
});

test("le brouillon est retrouvé après un rechargement complet", async ({ page }) => {
  await page.goto("/creation");
  const adresse = page.url();

  await page.getByLabel("Forme juridique").selectOption("SASU");
  await page.getByLabel("Nom de la société").fill("ESSAI PERSISTANCE");
  await page.getByLabel("Activité").fill("Conseil");
  await page.getByLabel("Adresse du siège").fill("1 rue de la Paix");
  await page.getByLabel("Code postal").fill("75002");
  await page.getByLabel("Ville").fill("Paris");
  await page.getByRole("button", { name: "Continuer" }).click();

  await expect(page.getByRole("heading", { level: 2 })).toContainText("Associés");

  // Rechargement complet : rien ne vient du navigateur.
  await page.goto(adresse);
  await expect(page.getByLabel("Nom de la société")).toHaveValue("ESSAI PERSISTANCE");
});

test("le mot employé pour le dirigeant suit la forme choisie", async ({ page }) => {
  await page.goto("/creation");
  await page.getByLabel("Forme juridique").selectOption("SARL");
  await page.getByLabel("Nom de la société").fill("ESSAI SARL");
  await page.getByLabel("Activité").fill("Commerce");
  await page.getByLabel("Adresse du siège").fill("2 rue Neuve");
  await page.getByLabel("Code postal").fill("69001");
  await page.getByLabel("Ville").fill("Lyon");
  await page.getByRole("button", { name: "Continuer" }).click();

  // Une SARL demande deux associés : un seul ne suffit pas à passer l'étape.
  await page.getByRole("button", { name: /Ajouter un associé/ }).click();
  await page.getByLabel("Prénom").fill("Camille");
  await page.getByLabel("Nom", { exact: true }).fill("Durand");
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.getByText(/au moins 2 associés/)).toBeVisible();

  await page.getByRole("button", { name: /Ajouter un associé/ }).click();
  await page.getByLabel("Prénom 2").fill("Alex");
  await page.getByLabel("Nom 2", { exact: true }).fill("Martin");
  await page.getByRole("button", { name: "Continuer" }).click();

  // Une SARL a un gérant, pas un président : le mot figure dans les actes.
  await expect(page.getByRole("button", { name: /Ajouter un gérant/ })).toBeVisible();
});

test("on ne saute pas par-dessus une étape incomplète", async ({ page }) => {
  await page.goto("/creation");
  const dossier = new URL(page.url()).searchParams.get("dossier");

  // Demander l'étape 4 directement dans l'adresse
  await page.goto("/creation?dossier=" + dossier + "&etape=4");
  await expect(page.getByRole("heading", { level: 2 })).toContainText("Informations de la société");
});

test.describe("accès au brouillon", () => {
  test("sans session, l'enregistrement est refusé", async ({ browser }) => {
    const anonyme = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const reponse = await anonyme.request.put("/api/formalites/brouillon", {
      data: { dossier: 1, modifications: { denomination: "intrusion" } },
    });
    expect(reponse.status()).toBe(401);
    await anonyme.close();
  });

  test("le brouillon d'un autre client est refusé", async ({ request }) => {
    const reponse = await request.put("/api/formalites/brouillon", {
      data: { dossier: 999999, modifications: { denomination: "intrusion" } },
    });
    expect(reponse.status()).toBe(403);
  });

  test("un champ hors gabarit est refusé avant enregistrement", async ({ request }) => {
    const reponse = await request.put("/api/formalites/brouillon", {
      data: { dossier: 1, modifications: { capital: -500 } },
    });
    expect([400, 403]).toContain(reponse.status());
  });
});
