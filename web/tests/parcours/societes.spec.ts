import { test, expect } from "@playwright/test";

/**
 * Le portefeuille de sociétés.
 *
 * Une société n'existe pas en base : elle se reconstitue à partir des dossiers. Ces
 * parcours vérifient que le regroupement tient de bout en bout - de la colonne à la
 * fiche - et surtout que la fiche ne redevient pas une troisième liste : chaque
 * section y renvoie vers la liste globale, filtrée sur la société.
 */
test.describe.configure({ mode: "serial" });

test("la colonne mène au portefeuille", async ({ page }) => {
  await page.goto("/tableau-de-bord");

  const entree = page.getByRole("link", { name: /Ma société|Mes sociétés/ });
  await expect(entree).toBeVisible();
  await entree.click();

  await page.waitForURL(/\/societes$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Ma société|Mes sociétés/);
});

test("le registre aligne ses colonnes, une ligne par société", async ({ page }) => {
  /*
   * En registre, non en galerie : à huit sociétés, on ne regarde plus des cartes, on
   * cherche - et l'on veut des colonnes alignées où l'œil descend un état sans relire
   * chaque bloc.
   */
  await page.goto("/societes");

  for (const colonne of ["Société", "SIREN", "État", "Formalités", "Prochaine échéance"]) {
    await expect(page.getByText(colonne, { exact: true }), colonne).toBeVisible();
  }

  const lignes = page.locator("a[href^='/societes/']");
  expect(await lignes.count(), "le jeu de données a des sociétés").toBeGreaterThan(0);
  await expect(lignes.first().getByText(/En création|Active|En fermeture|Radiée/)).toBeVisible();
});

test("la fiche rassemble ce qui concerne une seule société", async ({ page }) => {
  await page.goto("/societes");
  const premiere = page.locator("a[href^='/societes/']").first();
  const nom = (await premiere.locator("[class*='nom']").first().textContent())?.trim();

  await premiere.click();
  await page.waitForURL(/\/societes\/.+/);

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(nom!);
  await expect(page.getByRole("heading", { name: "Formalités", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Échéances" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Historique" })).toBeVisible();
});

test("la fiche renvoie aux listes globales plutôt que de les recopier", async ({ page }) => {
  /*
   * C'est ce qui la distingue d'un doublon : elle montre la société, et délègue la
   * recherche aux deux pages qui la font déjà - avec le nom déjà saisi, pour qu'on
   * n'ait pas à le retaper.
   */
  await page.goto("/societes");
  await page.locator("a[href^='/societes/']").first().click();
  await page.waitForURL(/\/societes\/.+/);

  const nom = (await page.getByRole("heading", { level: 1 }).textContent())!.trim();

  await expect(page.getByRole("link", { name: "Voir dans la liste" })).toHaveAttribute(
    "href",
    "/formalites?societe=" + encodeURIComponent(nom)
  );
  await expect(page.getByRole("link", { name: "Ouvrir la bibliothèque" })).toHaveAttribute(
    "href",
    "/documents?societe=" + encodeURIComponent(nom)
  );
});

test("le lien filtré arrive avec la recherche déjà faite", async ({ page }) => {
  await page.goto("/societes");
  await page.locator("a[href^='/societes/']").first().click();
  await page.waitForURL(/\/societes\/.+/);
  const nom = (await page.getByRole("heading", { level: 1 }).textContent())!.trim();

  await page.getByRole("link", { name: "Voir dans la liste" }).click();
  await page.waitForURL(/\/formalites/);

  // La recherche porte le nom : on n'a pas à le retaper.
  await expect(page.getByPlaceholder("Rechercher...")).toHaveValue(nom);
});

test("une société inconnue rend une page introuvable, non une page vide", async ({ request }) => {
  const reponse = await request.get("/societes/SOCIETEQUINEXISTEPAS");
  expect(reponse.status()).toBe(404);
});

test("la fiche porte les gestes possibles sur la société", async ({ page }) => {
  /*
   * Sans eux, on ne pouvait rien faire d'une société depuis sa fiche : il fallait
   * ressortir par le bouton de la colonne, choisir la formalité, puis rechercher la
   * société qu'on venait de quitter.
   */
  await page.goto("/societes");
  await page.locator("a[href^='/societes/']").first().click();
  await page.waitForURL(/\/societes\/.+/);

  for (const geste of ["Modifier la société", "Déposer les comptes", "Fermer la société"]) {
    await expect(page.getByRole("link", { name: geste }), geste).toBeVisible();
  }
});

test("les deux pages prennent toute la largeur", async ({ page }) => {
  /*
   * `globals.css` plafonne `main` à 980 pixels : une largeur de lecture, juste pour un
   * formulaire, absurde pour un registre à six colonnes. La table s'arrêtait aux deux
   * tiers de l'écran, et le tiers restant était vide.
   */
  await page.setViewportSize({ width: 1500, height: 900 });

  for (const adresse of ["/societes", "/societes/PARCOURSSIGNATURE"]) {
    await page.goto(adresse);
    await page.getByRole("heading", { level: 1 }).waitFor();

    const largeur = await page.locator("main").evaluate((e) => e.getBoundingClientRect().width);
    expect(largeur, adresse).toBeGreaterThan(1000);
  }
});
