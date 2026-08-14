import { test, expect } from "@playwright/test";

/**
 * La bibliothèque de documents.
 *
 * Ce qui compte ici est qu'on retrouve un document : il est rangé sous sa société, il
 * se cherche par le nom de l'une ou de l'autre, et ce qui attend une action se voit
 * avant le reste.
 */
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n");

test.describe("documents", () => {
  test("la page annonce ce qu'elle contient et range par société", async ({ page }) => {
    await page.goto("/documents");

    await expect(page.getByRole("heading", { level: 1 })).toContainText("Documents");
    await expect(page.getByText(/rangé par société/)).toBeVisible();

    // Les quatre filtres portent chacun leur décompte.
    for (const libelle of ["Tous", "Société", "Contrats", "Mes dépôts"]) {
      await expect(page.getByRole("button", { name: new RegExp("^" + libelle) })).toBeVisible();
    }
  });

  test("déposer un document le range sous la société choisie", async ({ page }) => {
    await page.goto("/documents");
    await page.getByRole("button", { name: /Déposer un document/ }).click();

    const fenetre = page.getByRole("dialog", { name: "Déposer un document" });
    await fenetre.getByLabel("Nom du document").waitFor();

    await page.setInputFiles("#fichier", {
      name: "bail-parcours.pdf",
      mimeType: "application/pdf",
      buffer: PDF,
    });

    // Le nom du fichier sert de titre par défaut : on n'a pas à retaper ce qu'on
    // vient de choisir.
    await expect(fenetre.getByLabel("Nom du document")).toHaveValue("bail-parcours");

    const nom = "Bail parcours " + Date.now();
    await fenetre.getByLabel("Nom du document").fill(nom);

    const societe = fenetre.getByLabel("Société concernée");
    const options = await societe.locator("option").allTextContents();
    const cible = options.find((o) => o.startsWith("PARCOURS"));
    if (cible) await societe.selectOption({ label: cible });

    await fenetre.getByRole("button", { name: "Déposer", exact: true }).click();

    await expect(page.getByText(nom)).toBeVisible();
    if (cible) {
      // Il est bien sous sa société, et non dans les dépôts personnels.
      const groupe = page.locator("section").filter({ hasText: cible }).first();
      await expect(groupe.getByText(nom)).toBeVisible();
    }
  });

  test("un dépôt sans société rejoint les dépôts personnels", async ({ page }) => {
    await page.goto("/documents");
    await page.getByRole("button", { name: /Déposer un document/ }).click();

    const fenetre = page.getByRole("dialog", { name: "Déposer un document" });
    await page.setInputFiles("#fichier", {
      name: "personnel.pdf",
      mimeType: "application/pdf",
      buffer: PDF,
    });

    const nom = "Document personnel " + Date.now();
    await fenetre.getByLabel("Nom du document").fill(nom);
    await fenetre.getByLabel("Société concernée").selectOption("");
    await fenetre.getByRole("button", { name: "Déposer", exact: true }).click();

    await expect(page.getByText(nom)).toBeVisible();
    const personnels = page.locator("section").filter({ hasText: "Mes dépôts" }).last();
    await expect(personnels.getByText(nom)).toBeVisible();
  });

  test("un filtre sans document le dit et offre une sortie", async ({ page }) => {
    await page.goto("/documents");
    await page.getByRole("button", { name: /^Contrats/ }).click();

    const contrats = await page.getByRole("button", { name: /^Contrats/ }).textContent();

    // Le compte-e n'a pas de contrat signé : le filtre doit rendre l'écran vide.
    if (contrats?.trim().endsWith("0")) {
      await expect(page.getByText(/Aucun document dans/)).toBeVisible();
      await page.getByRole("button", { name: /Voir tous les documents/ }).click();
      await expect(page.getByText(/Aucun document dans/)).toHaveCount(0);
    }
  });

  test("un fichier dont le contenu ne correspond pas est refusé, avec son motif", async ({
    page,
  }) => {
    await page.goto("/documents");
    await page.getByRole("button", { name: /Déposer un document/ }).click();

    const fenetre = page.getByRole("dialog", { name: "Déposer un document" });
    await page.setInputFiles("#fichier", {
      name: "faux.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("ceci est du texte, pas un PDF"),
    });
    await fenetre.getByLabel("Nom du document").fill("Faux document");
    await fenetre.getByRole("button", { name: "Déposer", exact: true }).click();

    await expect(fenetre.getByRole("alert")).toContainText("ne correspond pas");
  });

  test.describe("sans session", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("rien n'est accessible", async ({ request }) => {
      expect((await request.post("/api/documents")).status()).toBe(401);
    });
  });
});
