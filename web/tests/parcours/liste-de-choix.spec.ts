import { test, expect } from "@playwright/test";

/**
 * La liste de choix maison, au clavier comme à la souris.
 *
 * Le menu d'un `<select>` est dessiné par le système et rien ne l'habille : gris
 * ardoise et surlignage bleu sur macOS au milieu d'un formulaire clair. Il a donc été
 * remplacé - comme le calendrier natif avant lui, pour la même raison.
 *
 * Ce qui se perdait du champ natif devait être réécrit, sans quoi le remplacement
 * serait un recul : ouvrir, parcourir, choisir et refermer au clavier, sauter par la
 * première lettre, et refermer sans rien changer sur échappement. C'est ce que ce
 * parcours tient.
 */

const SOCIETE = {
  denomination: "ESSAI LISTE",
  forme: "SAS",
  siren: "552100554",
  adresse: "34 rue Laugier",
  codePostal: "75017",
  ville: "Paris",
  villeRcs: "Paris",
  capital: 20000,
};

async function dossierAvecUneConvention(request: import("@playwright/test").APIRequestContext) {
  const ouverture = await request.post("/api/formalites/comptes");
  expect(ouverture.status()).toBe(201);
  const dossier = (await ouverture.json()).dossier as number;

  /*
   * La convention se déclare depuis l'écran, non par l'API : le schéma refuse une
   * nature vide, et c'est justement une nature vide qu'il faut pour ouvrir la liste.
   */
  const mise = await request.put("/api/formalites/comptes", {
    data: { dossier, societe: SOCIETE },
  });
  expect(mise.ok(), await mise.text()).toBe(true);
  return dossier;
}

/** Ouvre l'étape des conventions et en déclare une, vide. */
async function surUneConventionVide(page: import("@playwright/test").Page, dossier: number) {
  await page.goto("/depot-des-comptes?dossier=" + dossier + "&etape=5");
  await page.getByRole("button", { name: /Déclarer une convention/i }).click();
  const champ = page.locator('[id^="conv-nature"]').first();
  await expect(champ).toBeVisible();
  return champ;
}

test("la liste de choix s'ouvre, se parcourt et se choisit au clavier", async ({
  page,
  request,
}) => {
  const dossier = await dossierAvecUneConvention(request);
  const champ = await surUneConventionVide(page, dossier);

  /* Rien de choisi : le champ le dit, et le menu est fermé. */
  await expect(champ).toHaveAttribute("aria-expanded", "false");
  await expect(champ).toContainText("Choisir");

  /* La flèche du bas ouvre, comme sur un champ natif. */
  await champ.focus();
  await page.keyboard.press("ArrowDown");
  await expect(champ).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("listbox")).toBeVisible();

  /*
   * L'ouverture vise déjà la première nature ; une flèche de plus atteint la seconde.
   */
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");

  await expect(champ).toHaveAttribute("aria-expanded", "false");
  await expect(champ).toContainText("Bail ou mise à disposition d'un bien");
});

test("la première lettre saute au bon endroit", async ({ page, request }) => {
  const dossier = await dossierAvecUneConvention(request);
  const champ = await surUneConventionVide(page, dossier);
  await champ.focus();
  await page.keyboard.press("Enter");

  /* Dans dix natures, « p » vaut mieux que six flèches. */
  await page.keyboard.press("p");
  await page.keyboard.press("Enter");
  await expect(champ).toContainText("Prestation de services");
});

test("échappement referme sans rien changer", async ({ page, request }) => {
  const dossier = await dossierAvecUneConvention(request);
  const champ = await surUneConventionVide(page, dossier);
  await champ.click();
  await expect(page.getByRole("listbox")).toBeVisible();

  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Escape");

  await expect(champ).toHaveAttribute("aria-expanded", "false");
  await expect(champ).toContainText("Choisir");
});

test("un clic dehors referme, le choix retenu reste", async ({ page, request }) => {
  const dossier = await dossierAvecUneConvention(request);
  const champ = await surUneConventionVide(page, dossier);
  await champ.click();
  await page.getByRole("option", { name: "Compte courant d'associé" }).click();
  await expect(champ).toContainText("Compte courant d'associé");

  await champ.click();
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.mouse.click(6, 6);

  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(champ).toContainText("Compte courant d'associé");
});
