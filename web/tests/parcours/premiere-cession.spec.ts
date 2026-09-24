import { test, expect } from "@playwright/test";
import { choisir } from "./liste";
import { retirerDossiers } from "./nettoyage";

/**
 * La première cession n'existe pas encore, et se remplit quand même.
 *
 * L'écran dessine toujours une ligne : « un formulaire, pas une liste à peupler ». Elle
 * ne figure pas dans le dossier tant qu'on n'y a rien écrit, et l'écriture doit donc
 * repartir de la liste que l'écran affiche, non de celle que la base porte.
 *
 * Une écriture bâtie sur le tableau du dossier - vide - ne trouvait aucun rang à
 * modifier : choisir un cédant ne posait rien, et le champ restait sur « Choisir » sans
 * que rien ne le dise. Plus aucune cession ne pouvait être commencée.
 */

const semes: number[] = [];

test.afterAll(async () => {
  await retirerDossiers(semes);
});

test("choisir le cédant sur une cession qui n'existe pas encore l'inscrit", async ({
  page,
  request,
}) => {
  const ouverture = await request.post("/api/formalites/modification", {
    data: { codes: ["cession_parts"] },
  });
  expect(ouverture.status()).toBe(201);
  const dossier = (await ouverture.json()).dossier as number;
  semes.push(dossier);

  await request.put("/api/formalites/modification", {
    data: {
      dossier,
      etape: 3,
      codes: ["cession_parts"],
      societe: {
        denomination: "LE GREMLIN",
        forme: "SARL",
        siren: "552100554",
        adresse: "12 rue de la Paix",
        codePostal: "75002",
        ville: "Paris",
        capital: 2000,
      },
      assemblee: {
        date: "2026-09-04",
        totalParts: 2000,
        associes: [
          { nature: "physique", civilite: "Monsieur", prenom: "Jean", nom: "DUPONT", parts: 2000 },
        ],
      },
      /* Aucune cession : celle de l'écran est la ligne que le formulaire dessine seul. */
    },
  });

  await page.goto("/modification?dossier=" + dossier + "&etape=3");

  await choisir(page.locator("#cession-cedant-0"), "Jean DUPONT · 2000 parts");
  await expect(page.locator("#cession-cedant-0")).toHaveText("Jean DUPONT · 2000 parts");

  /* Et ce qui suit s'écrit aussi : la cession existe désormais pour de bon. */
  await page.locator("#cession-parts-0").fill("500");
  await expect(page.getByText("sur 2000 détenues")).toBeVisible();

  /* Elle survit au rechargement, donc elle est bien partie au serveur. */
  await page.waitForTimeout(2500);
  await page.reload();
  await expect(page.locator("#cession-cedant-0")).toHaveText("Jean DUPONT · 2000 parts");
  await expect(page.locator("#cession-parts-0")).toHaveValue("500");
});
