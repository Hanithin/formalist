import { test, expect } from "@playwright/test";
import { retirerDossiers } from "./nettoyage";

/**
 * L'apport de titres a deux côtés, et le parcours n'en montrait qu'un.
 *
 * La holding voyait son capital augmenter, ses actes se relire, son dossier partir au
 * guichet. De la société dont les titres sont apportés, rien : ni l'agrément que ses
 * associés doivent donner avant la signature, ni les registres ou les statuts qui
 * portent le changement d'associé. L'opération se refermait sur deux sociétés dont
 * l'une contredisait l'autre.
 */

const semes: number[] = [];

test.afterAll(async () => {
  await retirerDossiers(semes);
});

const BLOC = "section[aria-label*='apport appelle']";

/** Un dossier d'apport, prêt à l'étape des détails. */
async function apport(
  request: import("@playwright/test").APIRequestContext,
  formeApportee: string
) {
  const ouverture = await request.post("/api/formalites/modification", {
    data: { codes: ["apport_titres"] },
  });
  expect(ouverture.status()).toBe(201);
  const dossier = (await ouverture.json()).dossier as number;
  semes.push(dossier);

  await request.put("/api/formalites/modification", {
    data: {
      dossier,
      etape: 3,
      codes: ["apport_titres"],
      societe: {
        denomination: "HOLDING D'ESSAI",
        forme: "SAS",
        siren: "552100554",
        adresse: "12 rue de la Paix",
        codePostal: "75002",
        ville: "Paris",
        capital: 20000,
      },
      valeurs: {
        apporteeDenomination: "CIBLE D'ESSAI",
        apporteeForme: formeApportee,
        apporteeSiren: "885020883",
        apporteeCapital: 7551,
        apporteeNbTitres: 1000,
        apportNbTitres: 600,
        apportValeur: 400000,
        apportNominaleBeneficiaire: 20,
        apporteurCivilite: "Monsieur",
        apporteurPrenom: "Paul",
        apporteurNom: "DURAND",
      },
    },
  });

  return dossier;
}

test("le parcours dit ce que doit la société dont les titres sont apportés", async ({
  page,
  request,
}) => {
  const dossier = await apport(request, "SARL");

  await page.goto("/modification?dossier=" + dossier + "&etape=3");
  const bloc = page.locator(BLOC);
  await expect(bloc).toBeVisible();

  /*
   * L'agrément, et il est annoncé avant la signature.
   *
   * C'est le manque le plus coûteux : recueilli après, il ne répare rien, et l'apport
   * reste attaquable. Le ranger avec ce qui suit l'apport laisserait croire l'inverse.
   */
  await expect(bloc).toContainText("Avant de signer le traité");
  await expect(bloc).toContainText("Faire agréer la holding par les associés de CIBLE D'ESSAI");
  await expect(bloc).toContainText("L. 223-14");

  /* Les deux registres des bénéficiaires effectifs, que personne ne réclamait. */
  await expect(bloc).toContainText("Dans les trente jours");
  await expect(bloc).toContainText("Déclarer les bénéficiaires effectifs de CIBLE D'ESSAI");

  /* Et ce qui n'est pas dû, parce qu'on le vend ailleurs. */
  await expect(bloc).toContainText("Aucune annonce légale n'est due");
});

test("une société par actions se règle au registre, non aux statuts", async ({ page, request }) => {
  const dossier = await apport(request, "SAS");

  await page.goto("/modification?dossier=" + dossier + "&etape=3");
  const bloc = page.locator(BLOC);
  await expect(bloc).toBeVisible();

  /* L'inscription en compte est le transfert lui-même, non une formalité de plus. */
  await expect(bloc).toContainText("Inscrire le mouvement au registre des titres");
  await expect(bloc).toContainText("L. 228-1");

  /* Les actionnaires ne figurent pas aux statuts : rien à redéposer, et on le dit. */
  await expect(bloc).not.toContainText("Déposer les statuts");
  await expect(bloc).toContainText("ne changent pas");
});

test("le dossier de la société apportée s'ouvre une fois, et se reprend ensuite", async ({
  page,
  request,
}) => {
  const dossier = await apport(request, "SARL");

  await page.goto("/modification?dossier=" + dossier + "&etape=3");
  await expect(page.locator(BLOC)).toBeVisible();

  await page.getByRole("button", { name: "Ouvrir le dossier" }).click();
  await page.waitForURL((url) => url.searchParams.get("dossier") !== String(dossier));

  const lie = Number(new URL(page.url()).searchParams.get("dossier"));
  expect(lie).toBeGreaterThan(0);
  semes.push(lie);

  /* Il arrive rempli : c'est bien l'autre société, et la cession y est décrite. */
  await expect(page.getByRole("heading", { name: /La société/ })).toBeVisible();
  await expect(page.locator("input").first()).toHaveValue(/CIBLE D'ESSAI/);

  /*
   * Deux clics ne font pas deux dossiers.
   *
   * Le lien est retenu sur le dossier d'apport : on y revient au lieu d'en ouvrir un
   * second, qui laisserait deux formalités concurrentes sur la même société.
   */
  await page.goto("/modification?dossier=" + dossier + "&etape=3");
  await expect(page.getByRole("button", { name: "Reprendre le dossier" })).toBeVisible();
  await page.getByRole("button", { name: "Reprendre le dossier" }).click();
  await page.waitForURL((url) => url.searchParams.get("dossier") === String(lie));
});
