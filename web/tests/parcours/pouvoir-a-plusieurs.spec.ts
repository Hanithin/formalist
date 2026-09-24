import { test, expect } from "@playwright/test";
import { choisir } from "./liste";
import { retirerDossiers } from "./nettoyage";

/**
 * Le pouvoir signé par plusieurs gérants.
 *
 * À l'égard des tiers, chaque gérant engage seul la société : un pouvoir signé par un
 * seul est valable, et c'est le cas de presque tous les dossiers. Mais les statuts
 * peuvent répartir les pouvoirs entre gérants, et une banque ou un greffe réclame alors
 * deux signatures - devant trois cogérants, on cherchait où saisir les deux autres.
 */

const semes: number[] = [];

test.afterAll(async () => {
  await retirerDossiers(semes);
});

async function dossier(request: import("@playwright/test").APIRequestContext) {
  const ouverture = await request.post("/api/formalites/modification", {
    data: { codes: ["transfert_siege"] },
  });
  expect(ouverture.status()).toBe(201);
  const identifiant = (await ouverture.json()).dossier as number;
  semes.push(identifiant);

  await request.put("/api/formalites/modification", {
    data: {
      dossier: identifiant,
      etape: 1,
      codes: ["transfert_siege"],
      societe: {
        denomination: "ESSAI COSIGNATAIRES",
        forme: "SARL",
        siren: "552100554",
        adresse: "12 rue de la Paix",
        codePostal: "75002",
        ville: "Paris",
        capital: 3000,
      },
      valeurs: {
        signataireCivilite: "Monsieur",
        signatairePrenom: "Valentin",
        signataireNom: "TULLIO",
        signataireQualite: "cogérant",
        signataireNeLe: "1995-05-28",
        signataireNeA: "Paris 14e (75014)",
        signataireAdresse: "23 Rue de l'Avenir, 92160 Antony",
        nouvelleAdresse: "5 rue Neuve",
        nouveauCodePostal: "75003",
        nouvelleVille: "Paris",
      },
    },
  });

  return identifiant;
}

test("un cosignataire s'ajoute, se nomme et se retire", async ({ page, request }) => {
  const identifiant = await dossier(request);
  await page.goto("/modification?dossier=" + identifiant + "&etape=1");

  /* Replié tant qu'on ne le demande pas : la plupart des dossiers n'en ont pas. */
  await expect(page.locator("#cosignataire-nom-0")).toHaveCount(0);

  await page.getByRole("button", { name: "Ajouter un cosignataire" }).click();
  await page.locator("#cosignataire-prenom-0").fill("Valentin");
  await page.locator("#cosignataire-nom-0").fill("MARIE");

  /* La carte se nomme au fil de la saisie, comme celle d'un associé. */
  await expect(page.locator("fieldset legend").last()).toHaveText(
    "Cosignataire 1 - Valentin MARIE"
  );

  await page.getByRole("button", { name: "Retirer le cosignataire 1" }).click();
  await expect(page.locator("#cosignataire-nom-0")).toHaveCount(0);
});

test("un cosignataire à moitié saisi retient l'étape", async ({ page, request }) => {
  const identifiant = await dossier(request);
  await page.goto("/modification?dossier=" + identifiant + "&etape=1");

  await page.getByRole("button", { name: "Ajouter un cosignataire" }).click();
  await page.locator("#cosignataire-nom-0").fill("MARIE");

  /*
   * Le pouvoir identifie qui le signe comme le ferait un notaire.
   *
   * Un cosignataire à moitié rempli donnerait « MARIE, né le - à - » sur un document
   * que le guichet refuse, et qui ne se répare qu'en refaisant la formalité.
   */
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.getByText("Étape 1 sur 7")).toBeVisible();

  await choisir(page.locator("#cosignataire-civilite-0"), "Monsieur");
  await page.locator("#cosignataire-prenom-0").fill("Valentin");
  await page.locator("#cosignataire-ne-le-0").fill("11/02/1990");
  await page.locator("#cosignataire-ne-a-0").fill("Lyon 3e (69003)");
  await page.locator("#cosignataire-adresse-0").fill("8 rue Bellecour, 69002 Lyon");

  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.getByText("Étape 1 sur 7")).toHaveCount(0);
});

test("une ligne ajoutée puis laissée vide ne retient rien", async ({ page, request }) => {
  const identifiant = await dossier(request);
  await page.goto("/modification?dossier=" + identifiant + "&etape=1");

  // Elle se retire par sa croix, non par six reproches.
  await page.getByRole("button", { name: "Ajouter un cosignataire" }).click();
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.getByText("Étape 1 sur 7")).toHaveCount(0);
});
