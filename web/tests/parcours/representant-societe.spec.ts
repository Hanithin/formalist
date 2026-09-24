import { test, expect } from "@playwright/test";
import { retirerDossiers } from "./nettoyage";

/**
 * Le choix « Une société » n'est offert que là où la loi l'admet.
 *
 * Il l'était partout, et un client l'a pris sur une SARL - qui « est gérée par une ou
 * plusieurs personnes physiques » (L. 223-18). Il s'est ensuite vu proposer « gérant »
 * pour la société qu'il venait de saisir, parce que le champ suit la forme de la société
 * modifiée et non celle du représentant.
 */

const semes: number[] = [];

test.afterAll(async () => {
  await retirerDossiers(semes);
});

async function dossier(
  request: import("@playwright/test").APIRequestContext,
  forme: string,
  valeurs: Record<string, string> = {}
) {
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
        denomination: "LE GREMLIN",
        forme,
        siren: "552100554",
        adresse: "12 rue de la Paix",
        codePostal: "75002",
        ville: "Paris",
        capital: 3000,
      },
      valeurs,
    },
  });

  return identifiant;
}

const NATURES = "[class*='natures'] label";

test("une SAS peut être présidée par une société", async ({ page, request }) => {
  const identifiant = await dossier(request, "SAS");
  await page.goto("/modification?dossier=" + identifiant + "&etape=1");

  await expect(page.locator(NATURES)).toHaveCount(2);
  await expect(page.getByText(/ne peut pas être une société/)).toHaveCount(0);
});

test("une SARL ne se voit pas proposer un gérant personne morale", async ({ page, request }) => {
  const identifiant = await dossier(request, "SARL");
  await page.goto("/modification?dossier=" + identifiant + "&etape=1");

  /* Le choix disparaît - et le motif prend sa place, faute de quoi on chercherait
     ce qu'on a mal fait. */
  await expect(page.locator(NATURES)).toHaveCount(1);
  await expect(page.locator(NATURES)).toHaveText("Une personne");
  await expect(page.getByText(/article L\. 223-18/).first()).toBeVisible();
});

test("un dossier qui l'a déjà pris garde sa saisie, et se voit refusé", async ({
  page,
  request,
}) => {
  const identifiant = await dossier(request, "SARL", {
    signataireNature: "morale",
    signataireSocieteDenomination: "FIF",
    signataireSocieteForme: "SAS",
    signataireSocieteSiren: "483033163",
    signataireSocieteSiege: "11 rue Montauban, 72000 Le Mans",
  });
  await page.goto("/modification?dossier=" + identifiant + "&etape=1");

  /*
   * La bascule reste, et la saisie avec.
   *
   * La faire disparaître emporterait ce qui a été tapé sans un mot ; le refus nommé vaut
   * mieux qu'un écran qui se rétracte.
   */
  await expect(page.locator(NATURES)).toHaveCount(2);
  await expect(page.locator("#signataire-societe-denomination")).toHaveValue("FIF");

  /* Le libellé nomme la société, il ne dit plus « la vôtre » entre deux sociétés. */
  await expect(page.locator("label[for='signataire-qualite']")).toHaveText(
    "Sa qualité dans LE GREMLIN"
  );

  /* Et l'étape ne se franchit pas. */
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.getByText("Étape 1 sur 7")).toBeVisible();
  await expect(page.locator("[class*='manques']").first()).toContainText("L. 223-18");
});
