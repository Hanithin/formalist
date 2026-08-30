import { test, expect } from "@playwright/test";

/**
 * Un formulaire refusé ne punit pas celui qui l'a rempli.
 *
 * React réinitialise un formulaire dont l'`action` est une fonction, dès que celle-ci
 * a rendu la main. C'est ce qu'il faut pour un champ qu'on vide après l'envoi - une
 * note, un message - et c'est un piège partout ailleurs : refusé pour un mot de passe
 * trop court, on retapait son prénom, son nom et son adresse avant de pouvoir corriger
 * la seule case en cause.
 *
 * Cinq formulaires en souffraient : l'inscription, la connexion, les deux étapes du
 * mot de passe oublié et le profil. Les essais tiennent les deux qu'un visiteur
 * rencontre en premier.
 */

test.use({ storageState: { cookies: [], origins: [] } });

test("l'inscription garde ce qui est saisi quand le mot de passe est refusé", async ({ page }) => {
  await page.goto("/inscription");

  await page.getByLabel("Prénom").fill("Camille");
  await page.getByLabel("Nom", { exact: true }).fill("DURAND");
  await page.getByLabel("Adresse email").fill("camille.essai@exemple.test");
  await page.getByLabel("Mot de passe").fill("1234567");
  await page.getByRole("button", { name: "Créer mon compte" }).click();

  /* Next pose son propre role="alert" pour annoncer les changements de route. */
  await expect(page.getByText("Le mot de passe doit faire au moins 8 caractères")).toBeVisible();

  /* Ce qui compte : la seule case à reprendre est celle qu'on a signalée. */
  await expect(page.getByLabel("Prénom")).toHaveValue("Camille");
  await expect(page.getByLabel("Nom", { exact: true })).toHaveValue("DURAND");
  await expect(page.getByLabel("Adresse email")).toHaveValue("camille.essai@exemple.test");
});

test("la connexion garde l'adresse quand le mot de passe est faux", async ({ page }) => {
  await page.goto("/connexion");

  await page.getByLabel("Email").fill("inconnu@exemple.test");
  await page.getByLabel("Mot de passe").fill("MauvaisMotDePasse2026!");
  await page.getByRole("button", { name: "Se connecter" }).click();

  await expect(page.locator('form [role="alert"]')).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveValue("inconnu@exemple.test");
});
