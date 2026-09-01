import { test, expect } from "@playwright/test";
import { retirerDossiers } from "./nettoyage";

/**
 * La saisie se garde au fil de la frappe, sans attendre « Continuer ».
 *
 * Elle ne se gardait qu'à la validation d'une étape : le parcours vérifiait les règles
 * et sortait avant d'écrire quoi que ce soit. Quelqu'un qu'une règle bloquait - un objet
 * social qu'il croyait rempli, une banque qu'il n'avait pas vue - fermait l'onglet et
 * retrouvait un formulaire vide.
 */
const ouverts: number[] = [];

/* Un dossier laissé derrière remonte dans le registre des sociétés, et fait échouer
   les parcours qui y comptent leurs lignes. */
test.afterAll(async () => {
  if (ouverts.length > 0) await retirerDossiers(ouverts);
});

test("ce qui est écrit se retrouve, même sans passer l'étape", async ({ page }) => {
  await page.goto("/creation");

  await page.locator("#denomination").fill("ESSAI SAUVEGARDE CONTINUE");
  await page.locator("#adresse").fill("12 rue Vauban");
  await page.locator("#codePostal").fill("69006");
  await page.locator("#ville").fill("Lyon");

  /* Le dossier s'ouvre seul une fois la société nommée, et l'adresse le porte. */
  await expect(page).toHaveURL(/dossier=\d+/, { timeout: 10_000 });
  const adresse = page.url();

  /*
   * On repart sans avoir cliqué sur « Continuer » - et sans pouvoir le faire, la forme
   * juridique et la banque manquent encore.
   */
  await page.goto("/formalites");
  await page.goto(adresse);

  /* Le parcours rouvre ce qui était écrit, non une page vierge. */
  await expect(page.locator("#denomination")).toHaveValue("ESSAI SAUVEGARDE CONTINUE");
  await expect(page.locator("#adresse")).toHaveValue("12 rue Vauban");
  await expect(page.locator("#ville")).toHaveValue("Lyon");

  const dossier = Number(new URL(page.url()).searchParams.get("dossier"));
  if (Number.isFinite(dossier)) ouverts.push(dossier);
});

/*
 * Tant que la société n'a pas de nom, rien n'est écrit : un dossier ouvert à la
 * première frappe ferait une ligne en base pour chaque visiteur qui passe, et une
 * formalité sans nom en tête de la file de l'avocat.
 */
test("rien n'est ouvert tant que la société n'a pas de nom", async ({ page, request }) => {
  const avant = await request.get("/api/formalites");
  const listeAvant = await avant.json();

  await page.goto("/creation");
  await page.locator("#adresse").fill("5 rue de la Paix");
  await page.locator("#codePostal").fill("75002");
  await page.waitForTimeout(2500);

  const apres = await request.get("/api/formalites");
  const listeApres = await apres.json();

  expect(
    (listeApres.formalites ?? listeApres).length ?? 0
  ).toBe((listeAvant.formalites ?? listeAvant).length ?? 0);
});
