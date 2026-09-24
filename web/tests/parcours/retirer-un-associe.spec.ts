import { test, expect } from "@playwright/test";
import { retirerDossiers } from "./nettoyage";

/**
 * Retirer un associé, sans que le bouton se lise comme une consigne.
 *
 * Le geste tenait une ligne à lui au bas de la liste : « Supprimer l'associé 3 », en
 * ambre, sans bordure ni fond, entre le message qui valide la répartition et
 * « Continuer ». À cet endroit et sous cette forme, ce n'était plus un bouton mais une
 * phrase à l'impératif. Un client l'a signalé comme un blocage : ses trois associés
 * détenaient bien les trois mille parts, l'écran le confirmait en vert, et il a cherché
 * ce qu'il avait mal rempli.
 *
 * Il ne retirait d'ailleurs que le dernier : pour ôter le deuxième sur trois, il fallait
 * supprimer le troisième, puis le deuxième, puis le retaper.
 */

const semes: number[] = [];

test.afterAll(async () => {
  await retirerDossiers(semes);
});

const TROIS = [
  { nature: "physique", civilite: "Monsieur", prenom: "Valentin", nom: "TULLIO", parts: 1000 },
  { nature: "physique", civilite: "Monsieur", prenom: "Valentin", nom: "MARIE", parts: 1000 },
  { nature: "physique", civilite: "Monsieur", prenom: "Mehdi", nom: "HORMAT", parts: 1000 },
];

async function assemblee(request: import("@playwright/test").APIRequestContext) {
  const ouverture = await request.post("/api/formalites/modification", {
    data: { codes: ["transfert_siege"] },
  });
  expect(ouverture.status()).toBe(201);
  const dossier = (await ouverture.json()).dossier as number;
  semes.push(dossier);

  await request.put("/api/formalites/modification", {
    data: {
      dossier,
      etape: 4,
      codes: ["transfert_siege"],
      societe: {
        denomination: "ESSAI ASSOCIES",
        forme: "SARL",
        siren: "552100554",
        adresse: "12 rue de la Paix",
        codePostal: "75002",
        ville: "Paris",
        capital: 3000,
      },
      valeurs: {
        nouvelleAdresse: "5 rue Neuve",
        nouveauCodePostal: "75003",
        nouvelleVille: "Paris",
      },
      assemblee: { date: "2026-09-04", totalParts: 3000, associes: TROIS },
    },
  });

  return dossier;
}

test("une répartition juste ne demande rien, et ne propose pas d'en retirer un", async ({
  page,
  request,
}) => {
  const dossier = await assemblee(request);
  await page.goto("/modification?dossier=" + dossier + "&etape=4");

  await expect(page.getByText("Les 3000 parts sociales de la société sont réparties.")).toBeVisible();

  /*
   * Plus aucune phrase à l'impératif entre la validation et « Continuer ».
   *
   * C'est elle qu'on lisait comme une consigne : le retrait n'a plus de ligne à lui.
   */
  await expect(page.getByRole("button", { name: /^Supprimer l'associé/ })).toHaveCount(0);

  /* Et rien ne bloque : l'étape se franchit. */
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.getByText("Étape 5 sur 7")).toBeVisible();
});

test("le retrait appartient à la carte de l'associé, et vise n'importe lequel", async ({
  page,
  request,
}) => {
  const dossier = await assemblee(request);
  await page.goto("/modification?dossier=" + dossier + "&etape=4");

  /* Une croix par associé, nommée pour qui ne voit pas l'écran. */
  await expect(page.getByRole("button", { name: /^Retirer l'associé/ })).toHaveCount(3);

  /*
   * Le deuxième sur trois : c'est précisément ce qui était impossible.
   *
   * Le rang suit la position, non l'identité : après le retrait, Mehdi HORMAT devient
   * l'associé 2, et c'est ce rang-là que le procès-verbal écrira.
   */
  await page.getByRole("button", { name: "Retirer l'associé 2 - Valentin MARIE" }).click();

  const legendes = page.locator("fieldset legend");
  await expect(legendes).toHaveCount(2);
  await expect(legendes.nth(0)).toHaveText("Associé 1 - Valentin TULLIO");
  await expect(legendes.nth(1)).toHaveText("Associé 2 - Mehdi HORMAT");

  /* Le compte suit : deux mille parts pour un capital qui en compte trois mille. */
  await expect(page.getByText(/2000 parts sociales réparties sur 3000/)).toBeVisible();
});

test("le dernier associé ne se retire pas : une assemblée sans associé n'existe pas", async ({
  page,
  request,
}) => {
  const dossier = await assemblee(request);
  await page.goto("/modification?dossier=" + dossier + "&etape=4");

  await page.getByRole("button", { name: /^Retirer l'associé 3/ }).click();
  await page.getByRole("button", { name: /^Retirer l'associé 2/ }).click();

  await expect(page.locator("fieldset legend")).toHaveCount(1);
  await expect(page.getByRole("button", { name: /^Retirer l'associé/ })).toHaveCount(0);
});
