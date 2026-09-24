import { test, expect } from "@playwright/test";
import { choisir } from "./liste";
import { retirerDossiers } from "./nettoyage";

/**
 * Le cessionnaire se saisit en civilité, prénom et nom.
 *
 * Une seule case libre les réunissait, et l'on y tapait ce qu'on voulait dans l'ordre
 * qu'on voulait. L'acte de cession part à l'enregistrement au service des impôts, qui
 * attend le prénom et le nom séparément : la découpe se faisait après coup, sur les
 * capitales, et « monsieur jean dupont » lui échappait.
 */

const semes: number[] = [];

test.afterAll(async () => {
  await retirerDossiers(semes);
});

async function dossier(
  request: import("@playwright/test").APIRequestContext,
  cessions?: unknown[]
) {
  const ouverture = await request.post("/api/formalites/modification", {
    data: { codes: ["cession_parts"] },
  });
  expect(ouverture.status()).toBe(201);
  const identifiant = (await ouverture.json()).dossier as number;
  semes.push(identifiant);

  await request.put("/api/formalites/modification", {
    data: {
      dossier: identifiant,
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
      ...(cessions ? { cessions } : {}),
    },
  });

  return identifiant;
}

test("les trois champs s'enregistrent et reviennent", async ({ page, request }) => {
  const identifiant = await dossier(request);
  await page.goto("/modification?dossier=" + identifiant + "&etape=3");

  await choisir(page.locator("#cession-cedant-0"), "Jean DUPONT · 2000 parts");
  await page.locator("#cession-parts-0").fill("500");
  await page.getByText("un tiers, qui entre au capital").click();
  await choisir(page.locator("#cession-civilite-0"), "Madame");
  await page.locator("#cession-prenom-0").fill("Claire");
  await page.locator("#cession-nom-0").fill("MARTIN");

  await page.waitForTimeout(2500);
  await page.reload();

  await expect(page.locator("#cession-civilite-0")).toHaveText("Madame");
  await expect(page.locator("#cession-prenom-0")).toHaveValue("Claire");
  await expect(page.locator("#cession-nom-0")).toHaveValue("MARTIN");
});

test("un dossier saisi sur une seule ligne retrouve ses trois champs", async ({
  page,
  request,
}) => {
  const identifiant = await dossier(request, [
    {
      cedant: 0,
      parts: 500,
      prix: 10000,
      date: "2026-09-04",
      vers: "tiers",
      cessionnaire: null,
      nature: "physique",
      /* Ce que portent les dossiers d'avant : l'identité entière dans le nom. */
      nom: "Madame Claire MARTIN",
    },
  ]);

  await page.goto("/modification?dossier=" + identifiant + "&etape=3");

  await expect(page.locator("#cession-civilite-0")).toHaveText("Madame");
  await expect(page.locator("#cession-prenom-0")).toHaveValue("Claire");
  await expect(page.locator("#cession-nom-0")).toHaveValue("MARTIN");
});

test("l'identité entière tapée dans une case se range d'elle-même", async ({ page, request }) => {
  const identifiant = await dossier(request);
  await page.goto("/modification?dossier=" + identifiant + "&etape=3");

  await page.getByText("un tiers, qui entre au capital").click();

  /* L'habitude de la case unique survit au formulaire : on répartit plutôt que de
     reprocher, et l'écran montre où chaque morceau est allé. */
  await page.locator("#cession-prenom-0").fill("Monsieur Paul DURAND");
  await page.locator("#cession-nom-0").click();

  await expect(page.locator("#cession-civilite-0")).toHaveText("Monsieur");
  await expect(page.locator("#cession-prenom-0")).toHaveValue("Paul");
  await expect(page.locator("#cession-nom-0")).toHaveValue("DURAND");
});

test("l'étape ne se franchit pas sur une identité à moitié donnée", async ({ page, request }) => {
  const identifiant = await dossier(request);
  await page.goto("/modification?dossier=" + identifiant + "&etape=3");

  await choisir(page.locator("#cession-cedant-0"), "Jean DUPONT · 2000 parts");
  await page.locator("#cession-parts-0").fill("500");
  await page.getByText("un tiers, qui entre au capital").click();
  await page.locator("#cession-prenom-0").fill("Paul");
  await page.locator("#cession-prix-0").fill("10000");

  await page.getByRole("button", { name: "Continuer" }).click();

  await expect(page.getByText("Choisissez la civilité du cessionnaire").first()).toBeVisible();
  await expect(page.getByText("Indiquez le nom du cessionnaire").first()).toBeVisible();
});

test("le panneau d'après la cession se lit sur toute la largeur", async ({ page, request }) => {
  /*
   * Deux classes « repartition » vivaient dans la même feuille - celle de ce panneau et
   * celle du dépôt des comptes, qui l'importe. La dernière écrite l'emportait : le
   * titre partait à gauche, la liste se tassait à droite sur deux cents pixels.
   */
  const identifiant = await dossier(request, [
    {
      cedant: 0,
      parts: 500,
      prix: 10000,
      date: "2026-09-04",
      vers: "tiers",
      cessionnaire: null,
      nature: "physique",
      civilite: "Madame",
      prenom: "Claire",
      nom: "MARTIN",
    },
  ]);

  await page.goto("/modification?dossier=" + identifiant + "&etape=3");

  const panneau = page.locator("section[class*='apresCession']");
  const liste = panneau.locator("ul");
  const cadre = await panneau.boundingBox();
  const cadreListe = await liste.boundingBox();

  /* La liste occupe le panneau, au lieu d'une colonne serrée contre le bord droit. */
  expect(cadreListe!.width).toBeGreaterThan(cadre!.width * 0.8);
  /* Et elle est sous le titre, non à côté. */
  const titre = await panneau.locator("h4").boundingBox();
  expect(cadreListe!.y).toBeGreaterThan(titre!.y + titre!.height);
});

test("l'acquéreur pas encore nommé garde sa place dans le compte", async ({ page, request }) => {
  const identifiant = await dossier(request, [
    {
      cedant: 0,
      parts: 2000,
      prix: 10000,
      date: "2026-09-04",
      vers: "tiers",
      cessionnaire: null,
      nature: "physique",
    },
  ]);

  await page.goto("/modification?dossier=" + identifiant + "&etape=3");

  const panneau = page.locator("section[class*='apresCession']");
  await expect(panneau.getByText("Le cessionnaire")).toBeVisible();
  /* Le compte ne dément plus la phrase qui le suit. */
  await expect(panneau.getByText(/Total après cession : 2000 sur 2000 parts/)).toBeVisible();
});

test("le tiers se dit personne ou société d'une pastille", async ({ page, request }) => {
  const identifiant = await dossier(request);
  await page.goto("/modification?dossier=" + identifiant + "&etape=3");

  await page.getByText("un tiers, qui entre au capital").click();
  await expect(page.getByText("Ce tiers est")).toBeVisible();

  await page.getByRole("radio", { name: "une société" }).check();
  await expect(page.locator("#cession-siren-0")).toBeVisible();
  await expect(page.locator("#cession-prenom-0")).toHaveCount(0);

  await page.getByRole("radio", { name: "une personne" }).check();
  await expect(page.locator("#cession-prenom-0")).toBeVisible();
});
