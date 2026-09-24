import { test, expect } from "@playwright/test";
import { retirerDossiers } from "./nettoyage";

/**
 * La coquille de l'application ne glisse pas sous le contenu.
 *
 * Les contrôles masqués - un radio, une entrée de fichier - se posent en absolu et
 * s'échappent jusqu'à la coquille quand rien ne les retient. Elle les découpe, mais
 * `overflow: hidden` ne retire pas le défilement : il cache seulement la barre. Le
 * navigateur faisait donc glisser toute l'application pour montrer un radio invisible
 * posé des centaines de pixels sous l'écran, et rien ne pouvait la remettre en place.
 *
 * Ce qu'on voyait : on déclarait le représentant légal « Une société », et la colonne
 * du récapitulatif se retrouvait coupée en haut - son intitulé et son bord disparus.
 *
 * Deux garde-fous se vérifient ici : le radio reste dans sa pastille, et la coquille
 * n'est pas défilante du tout.
 */

const semes: number[] = [];

test.afterAll(async () => {
  await retirerDossiers(semes);
});

const COQUILLE = "[class*='layout-module'][class*='page']";
const RECAPITULATIF = "aside[aria-label='Récapitulatif de votre modification']";

/** Ce que la coquille peut faire glisser, et où en est la colonne. */
async function mesurer(page: import("@playwright/test").Page) {
  return page.evaluate(
    ([coquilleSel, recapSel]) => {
      const coquille = document.querySelector(coquilleSel)!;
      const aside = document.querySelector(recapSel);
      return {
        deborde: coquille.scrollHeight - coquille.clientHeight,
        glisse: Math.round(coquille.scrollTop),
        hautDeLaColonne: aside ? Math.round(aside.getBoundingClientRect().top) : null,
      };
    },
    [COQUILLE, RECAPITULATIF] as const
  );
}

test("déclarer le dirigeant « Une société » ne fait pas glisser l'application", async ({
  page,
  request,
}) => {
  const ouverture = await request.post("/api/formalites/modification", {
    data: { codes: ["apport_titres"] },
  });
  expect(ouverture.status()).toBe(201);
  const dossier = (await ouverture.json()).dossier as number;
  semes.push(dossier);

  await request.put("/api/formalites/modification", {
    data: {
      dossier,
      etape: 1,
      codes: ["apport_titres"],
      societe: {
        denomination: "ESSAI COQUILLE",
        forme: "SARL",
        siren: "552100554",
        adresse: "12 rue de la Paix",
        codePostal: "75002",
        ville: "Paris",
        capital: 7551,
      },
    },
  });

  /* Une fenêtre courte : c'est là que le glissement se voyait le mieux. */
  await page.setViewportSize({ width: 1512, height: 700 });
  await page.goto("/modification?dossier=" + dossier);
  await page.waitForSelector(RECAPITULATIF);

  const avant = await mesurer(page);
  expect(avant.deborde).toBe(0);

  await page.getByText("Une société", { exact: true }).click();
  /* Le bloc de la société apparaît : c'est le rendu après lequel on mesure. */
  await expect(page.locator("#signataire-societe-denomination")).toBeVisible();

  const apres = await mesurer(page);

  /*
   * Le radio reste dans sa pastille : la coquille n'a rien à faire glisser.
   *
   * C'est ce zéro qui compte. Sans lui, la coquille portait trois cent quatre-vingt-cinq
   * pixels de débordement, et le clic suivant les lui faisait parcourir.
   */
  expect(apres.deborde).toBe(0);
  expect(apres.glisse).toBe(0);

  /* Et la colonne est toujours entière, collée à vingt-quatre pixels du haut. */
  expect(apres.hautDeLaColonne).toBeGreaterThanOrEqual(0);
});
