import { test, expect } from "@playwright/test";

/**
 * Les trois premières pages de l'application portées, vues depuis un navigateur.
 *
 * Le compte d'essai est créé par tests/parcours/preparer.ts, exécuté une fois
 * avant la série.
 */

const COMPTE = { email: "parcours@exemple.test", motDePasse: "MotDePasseParcours2026!" };

async function seConnecter(page: import("@playwright/test").Page) {
  await page.goto("/connexion");
  await page.getByLabel("Adresse email").fill(COMPTE.email);
  await page.getByLabel("Mot de passe").fill(COMPTE.motDePasse);
  await page.getByRole("button", { name: /se connecter/i }).click();
  await page.waitForURL(/tableau-de-bord|aide|equipe|parametres/);
}

test.describe("parcours connecté", () => {
  test("la connexion mène au tableau de bord", async ({ page }) => {
    await seConnecter(page);
    await expect(page).toHaveURL(/\/tableau-de-bord/);
  });

  test("un mot de passe faux ne dit pas si le compte existe", async ({ page }) => {
    await page.goto("/connexion");
    await page.getByLabel("Adresse email").fill(COMPTE.email);
    await page.getByLabel("Mot de passe").fill("mauvais-mot-de-passe");
    await page.getByRole("button", { name: /se connecter/i }).click();

    // Next place un signaleur de navigation qui porte aussi role="alert" :
    // on vise le message du formulaire, pas lui.
    await expect(page.locator("form p[role=alert]")).toContainText(
      "Email ou mot de passe incorrect"
    );
    // Le même message qu'avec une adresse inconnue : voir la route de connexion.
  });

  test("la colonne de navigation est la même sur les trois pages", async ({ page }) => {
    await seConnecter(page);

    const entrees: string[][] = [];
    for (const chemin of ["/aide", "/parametres", "/equipe"]) {
      await page.goto(chemin);
      entrees.push(
        await page
          .getByRole("navigation", { name: "Navigation principale" })
          .getByRole("link")
          .allInnerTexts()
      );
    }

    // C'est tout l'objet de l'étape : une seule colonne, pas vingt et une copies.
    expect(entrees[1]).toEqual(entrees[0]);
    expect(entrees[2]).toEqual(entrees[0]);
  });

  test("la page courante est marquée dans la navigation", async ({ page }) => {
    await seConnecter(page);
    await page.goto("/aide");
    await expect(page.locator('[aria-current="page"]')).toHaveText("Aide & FAQ");
  });

  test("un client ne voit ni espace avocat ni administration", async ({ page }) => {
    await seConnecter(page);
    await page.goto("/aide");
    const liens = await page
      .getByRole("navigation", { name: "Navigation principale" })
      .getByRole("link")
      .allInnerTexts();
    expect(liens).not.toContain("Espace avocat");
    expect(liens).not.toContain("Administration");
  });

  test("l'aide filtre les questions", async ({ page }) => {
    await seConnecter(page);
    await page.goto("/aide");
    await expect(page.getByRole("status")).toContainText("10 questions");

    await page.getByLabel("Rechercher une question").fill("capital");
    await expect(page.getByRole("status")).not.toContainText("10 questions");

    // Sans accent doit trouver avec accent
    await page.getByLabel("Rechercher une question").fill("societe");
    await expect(page.getByRole("status")).not.toContainText("Aucune question");
  });

  test("les paramètres affichent le compte connecté", async ({ page }) => {
    await seConnecter(page);
    await page.goto("/parametres");
    await expect(page.getByLabel("Adresse email")).toHaveValue(COMPTE.email);
  });

  test("l'équipe est créée au premier accès, avec la personne dedans", async ({ page }) => {
    await seConnecter(page);
    await page.goto("/equipe");
    await expect(page.getByRole("heading", { level: 2, name: /membre/ })).toContainText("1 membre");
    await expect(page.getByText("Vous")).toBeVisible();
  });

  test("la déconnexion referme l'accès", async ({ page }) => {
    await seConnecter(page);
    await page.goto("/parametres");
    await page.getByRole("button", { name: /se déconnecter/i }).click();
    await page.waitForURL(/\/connexion/);

    await page.goto("/equipe");
    await expect(page).toHaveURL(/\/connexion/);
  });
});
