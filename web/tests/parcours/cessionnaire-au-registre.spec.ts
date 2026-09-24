import { test, expect } from "@playwright/test";
import { choisir } from "./liste";
import { retirerDossiers } from "./nettoyage";

/**
 * La société qui entre au capital se cherche, elle ne se tape pas.
 *
 * C'était le seul endroit du parcours où l'on saisissait une identité de société
 * entièrement à la main : dénomination, forme, capital, SIREN, ville du RCS et siège,
 * six champs de mémoire ou depuis un extrait, dans un acte qui part ensuite à
 * l'enregistrement au service des impôts. L'associé personne morale de l'assemblée, la
 * société apportée et les trois autres parcours ont cette recherche depuis longtemps.
 *
 * Le test n'interroge pas l'annuaire public : une série qui dépend d'un service extérieur
 * échoue les jours où il est lent. Il vérifie que le champ est là, au bon moment, et que
 * l'écriture de plusieurs champs d'affilée ne s'efface pas elle-même - c'est ce défaut-là
 * qui ne laissait que la dernière valeur écrite.
 */

const semes: number[] = [];

test.afterAll(async () => {
  await retirerDossiers(semes);
});

async function cession(request: import("@playwright/test").APIRequestContext) {
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
        denomination: "ESSAI CESSION",
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
          { nature: "physique", civilite: "Monsieur", prenom: "Valentin", nom: "TULLIO", parts: 1000 },
          { nature: "physique", civilite: "Monsieur", prenom: "Valentin", nom: "MARIE", parts: 1000 },
        ],
      },
      cessions: [
        {
          cedant: 1,
          parts: 1000,
          prix: 35000,
          date: "2026-09-04",
          vers: "tiers",
          cessionnaire: null,
          nom: "",
        },
      ],
    },
  });

  return dossier;
}

test("la recherche au registre paraît avec le cessionnaire personne morale", async ({
  page,
  request,
}) => {
  const dossier = await cession(request);
  await page.goto("/modification?dossier=" + dossier + "&etape=3");

  /* Une personne physique n'a rien à chercher au registre. */
  await expect(page.locator("#cession-recherche-0")).toHaveCount(0);

  await choisir(page.locator("#cession-nature-0"), "Une société");
  await expect(page.locator("#cession-recherche-0")).toBeVisible();

  /* Et les champs qu'elle remplira sont bien ceux de l'acte. */
  for (const champ of [
    "cession-nom-0",
    "cession-forme-0",
    "cession-capital-0",
    "cession-siren-0",
    "cession-rcs-0",
    "cession-adresse-0",
  ]) {
    await expect(page.locator("#" + champ)).toBeVisible();
  }
});

test("deux écritures de suite sur la même cession ne s'effacent pas", async ({ page, request }) => {
  const dossier = await cession(request);
  await page.goto("/modification?dossier=" + dossier + "&etape=3");
  await choisir(page.locator("#cession-nature-0"), "Une société");

  /*
   * Le défaut que la recherche a révélé.
   *
   * Elle écrit quatre champs d'un coup, puis le capital qui arrive du relais, puis le
   * greffe. Chaque écriture repartait du tableau capturé au rendu : les secondes
   * effaçaient les premières, et il ne restait que la dernière valeur posée.
   */
  await page.locator("#cession-nom-0").fill("SUPERNOVA INT");
  await page.locator("#cession-forme-0").fill("SAS");
  await page.locator("#cession-siren-0").fill("790023329");
  await page.locator("#cession-capital-0").fill("500");

  await expect(page.locator("#cession-nom-0")).toHaveValue("SUPERNOVA INT");
  await expect(page.locator("#cession-forme-0")).toHaveValue("SAS");
  await expect(page.locator("#cession-siren-0")).toHaveValue("790023329");
  await expect(page.locator("#cession-capital-0")).toHaveValue("500");
});
