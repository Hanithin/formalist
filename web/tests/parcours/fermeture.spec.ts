import { test, expect } from "@playwright/test";

/**
 * La fermeture d'une société.
 *
 * Trois choses s'y jouent, et chacune peut coûter cher au client :
 *
 *   - l'orientation. Une société qui ne peut plus payer ses dettes doit aller au
 *     tribunal, et lui vendre des actes de dissolution amiable la laisserait dépasser le
 *     délai de quarante-cinq jours qui engage son dirigeant personnellement ;
 *   - la durée. Le dossier vit des mois entre la dissolution et la clôture, et il doit
 *     rester ouvert et reprenable pendant tout ce temps ;
 *   - les deux attestations, sans lesquelles le greffe refuse la radiation.
 */
test.describe.configure({ mode: "serial" });

const SOCIETE = {
  denomination: "ESSAI FERMETURE",
  forme: "SARL",
  siren: "552100554",
  adresse: "12 rue de la Paix",
  codePostal: "75002",
  ville: "Paris",
  /* L'article des apports est écrit par dépositaire : sans banque, il sort vide. */
  banque: "Qonto",
  capital: 10000,
  villeRcs: "Paris",
};

const ASSOCIES = [
  { civilite: "Monsieur", prenom: "Jean", nom: "DUPONT", parts: 600 },
  { civilite: "Madame", prenom: "Claire", nom: "MARTIN", parts: 400 },
];

const DISSOLUTION = {
  dateDissolution: "2026-03-10",
  heureDecision: "11 heures",
  lieuDecision: "au siège social",
  motifDissolution: "Cessation de l'activité",
  liquidateurCivilite: "Madame",
  liquidateurPrenom: "Claire",
  liquidateurNom: "MARTIN",
  liquidateurNeLe: "1980-05-04",
  liquidateurNeA: "Lyon (69)",
  liquidateurNationalite: "française",
  liquidateurPere: "Paul MARTIN",
  liquidateurMere: "Anne BERGER",
  liquidateurAdresse: "8 avenue des Tilleuls, 75011 Paris",
  siegeDeLaLiquidation: "8 avenue des Tilleuls, 75011 Paris",
};

const CLOTURE = {
  dateCloture: "2026-11-20",
  dateArreteDesComptes: "2026-11-19",
  lieuCloture: "au siège de la liquidation",
  actifRealise: 60000,
  passifApure: 30000,
  fraisDeLiquidation: 2000,
};

type Requete = import("@playwright/test").APIRequestContext;

async function ouvrirUnDossier(request: Requete) {
  const reponse = await request.post("/api/formalites/fermeture");
  expect(reponse.status()).toBe(201);
  return (await reponse.json()).dossier as number;
}

async function ecrire(request: Requete, dossier: number, corps: Record<string, unknown>) {
  const reponse = await request.put("/api/formalites/fermeture", {
    data: { dossier, ...corps },
  });
  expect(reponse.ok(), await reponse.text()).toBe(true);
  return (await reponse.json()).fermeture;
}

/** Un dossier dont la dissolution est complète. */
async function dossierDissous(request: Requete, sur: Record<string, unknown> = {}) {
  const dossier = await ouvrirUnDossier(request);
  const fermeture = await ecrire(request, dossier, {
    situation: { dettesImpayables: false, associeUniquePersonneMorale: false },
    societe: SOCIETE,
    associes: ASSOCIES,
    valeurs: DISSOLUTION,
    ...sur,
  });
  return { dossier, fermeture };
}

test("la voie se déduit de la situation, et ne se pose pas depuis le navigateur", async ({
  request,
}) => {
  const dossier = await ouvrirUnDossier(request);

  const amiable = await ecrire(request, dossier, {
    situation: { dettesImpayables: false, associeUniquePersonneMorale: false },
  });
  expect(amiable.voie).toBe("liquidation-amiable");

  const tup = await ecrire(request, dossier, {
    situation: { dettesImpayables: false, associeUniquePersonneMorale: true },
  });
  expect(tup.voie).toBe("tup");

  const tribunal = await ecrire(request, dossier, {
    situation: { dettesImpayables: true, associeUniquePersonneMorale: false },
  });
  expect(tribunal.voie).toBe("liquidation-judiciaire");
});

test("une société endettée ne produit ni actes ni paiement", async ({ request }) => {
  /*
   * C'est le seul refus de vente de l'application, et il est délibéré : la dissolution
   * amiable d'une société en cessation des paiements laisse courir le délai de
   * l'article L. 631-4, qui engage le dirigeant sur son patrimoine.
   */
  const { dossier } = await dossierDissous(request, {
    situation: { dettesImpayables: true, associeUniquePersonneMorale: false },
  });

  const actes = await request.post("/api/formalites/fermeture/documents", { data: { dossier } });
  expect(actes.status()).toBe(400);
  expect(await actes.text()).toContain("tribunal");

  const paiement = await request.post("/api/formalites/fermeture/paiement", { data: { dossier } });
  expect(paiement.status()).toBe(400);
});

test("un dossier incomplet ne produit pas d'actes troués", async ({ request }) => {
  const dossier = await ouvrirUnDossier(request);
  await ecrire(request, dossier, {
    situation: { dettesImpayables: false, associeUniquePersonneMorale: false },
    societe: SOCIETE,
  });

  const production = await request.post("/api/formalites/fermeture/documents", {
    data: { dossier },
  });
  expect(production.status()).toBe(400);
  expect((await production.json()).manques.length).toBeGreaterThan(0);
});

test("la dissolution produit ses trois actes, la clôture les siens", async ({ request }) => {
  /* Deux productions d'actes de suite, converties en PDF : voir creation.spec.ts, même
     cause et même remède. */
  test.setTimeout(120_000);

  const { dossier } = await dossierDissous(request);

  const premiere = await request.post("/api/formalites/fermeture/documents", {
    data: { dossier },
  });
  expect(premiere.status()).toBe(201);
  const titres = (await premiere.json()).documents.map((d: { titre: string }) => d.titre);
  expect(titres).toContain("Procès-verbal d'assemblée générale extraordinaire - dissolution");
  expect(titres).toContain("Déclaration de non-condamnation et de filiation du liquidateur");
  // Le quitus ne se signe pas avant la première opération de liquidation.
  expect(titres.join(" ")).not.toContain("clôture");

  await request.patch("/api/formalites/fermeture", { data: { dossier } });
  await ecrire(request, dossier, { valeurs: CLOTURE });

  const seconde = await request.post("/api/formalites/fermeture/documents", { data: { dossier } });
  expect(seconde.status()).toBe(201);
  const apres = (await seconde.json()).documents.map((d: { titre: string }) => d.titre);
  expect(apres).toContain("Comptes définitifs de liquidation");
  expect(apres).toContain("Rapport du liquidateur");
});

test("une clôture datée après le mandat du liquidateur est refusée", async ({ request }) => {
  /*
   * Trois ans, article L. 237-21. Au-delà, la prorogation se demande au président du
   * tribunal - et une clôture décidée sans elle est irrégulière sans que rien dans le
   * dossier déposé ne le signale.
   */
  const { dossier } = await dossierDissous(request);
  await request.patch("/api/formalites/fermeture", { data: { dossier } });
  await ecrire(request, dossier, {
    valeurs: { ...CLOTURE, dateCloture: "2029-06-01", dateArreteDesComptes: "2029-05-31" },
  });

  const production = await request.post("/api/formalites/fermeture/documents", {
    data: { dossier },
  });
  expect(production.status()).toBe(400);
  expect(JSON.stringify(await production.json())).toContain("mandat du liquidateur a expiré");
});

test("une liquidation qui ne couvre pas son passif ne se clôture pas", async ({ request }) => {
  const { dossier } = await dossierDissous(request);
  await request.patch("/api/formalites/fermeture", { data: { dossier } });
  await ecrire(request, dossier, {
    valeurs: { ...CLOTURE, actifRealise: 10000, passifApure: 30000 },
  });

  const production = await request.post("/api/formalites/fermeture/documents", {
    data: { dossier },
  });
  expect(production.status()).toBe(400);
  expect(JSON.stringify(await production.json())).toContain("solde négatif");
});

test("une dissolution sans liquidation n'a pas de phase de clôture", async ({ request }) => {
  const { dossier } = await dossierDissous(request, {
    situation: { dettesImpayables: false, associeUniquePersonneMorale: true },
  });

  const passage = await request.patch("/api/formalites/fermeture", { data: { dossier } });
  expect(passage.status()).toBe(400);
});

test("l'écran d'entrée oriente, et refuse d'ouvrir quand il y a des dettes", async ({ page }) => {
  await page.goto("/fermeture");

  await expect(page.getByRole("heading", { name: "Fermer votre société" })).toBeVisible();

  // Première question : les dettes. « Non » ferme la voie amiable.
  const questions = page.locator("[class*='orientationChoix']");
  await questions.first().getByRole("button", { name: "Non", exact: true }).click();

  await expect(
    page.getByRole("heading", { name: "Votre société doit passer par le tribunal" })
  ).toBeVisible();
  await expect(page.getByText("quarante-cinq jours")).toBeVisible();
  await expect(page.getByRole("link", { name: "Prendre rendez-vous avec un avocat" })).toBeVisible();
  // Aucun dossier ne s'ouvre : le bouton de départ n'existe pas.
  await expect(page.getByRole("button", { name: "Commencer" })).toHaveCount(0);
});

test("le rendez-vous s'ouvre sur la bonne matière, sans repasser par le choix", async ({
  page,
}) => {
  /*
   * Un dirigeant qu'on vient d'arrêter ne doit pas retraverser l'écran des matières :
   * l'assistant s'ouvre à l'étape du créneau, la matière déjà retenue, et sa situation
   * portée dans le champ de demande - qui se lit à l'étape suivante.
   */
  await page.goto("/fermeture");
  const questions = page.locator("[class*='orientationChoix']");
  await questions.first().getByRole("button", { name: "Non", exact: true }).click();
  await page.getByRole("link", { name: "Prendre rendez-vous avec un avocat" }).click();

  await expect(page).toHaveURL(/matiere=droit_societes/);
  await expect(page.getByRole("dialog", { name: "Prendre rendez-vous" })).toBeVisible();
  // L'étape des matières est passée : on est déjà sur le choix de l'avocat.
  await expect(page.getByText("Avocat et créneau")).toBeVisible();
  await expect(page.getByText("Choisissez votre matière")).toHaveCount(0);
});

test("sans dettes et sans société associée, l'entrée mène au parcours amiable", async ({
  page,
}) => {
  await page.goto("/fermeture");
  const questions = page.locator("[class*='orientationChoix']");

  await questions.first().getByRole("button", { name: "Oui", exact: true }).click();
  await questions.nth(1).getByRole("button", { name: "Non", exact: true }).click();

  await expect(
    page.getByRole("heading", { name: "Dissolution puis liquidation amiable" })
  ).toBeVisible();
  // Les deux attestations sont annoncées avant même d'ouvrir le dossier.
  await expect(page.getByText("Attestation de vigilance de l'URSSAF")).toBeVisible();
  await expect(page.getByRole("button", { name: "Commencer" })).toBeVisible();
});

test("le parcours s'affiche à chacune de ses étapes", async ({ page, request }) => {
  const { dossier } = await dossierDissous(request);

  const titres = [
    "La société à fermer",
    "La décision et le liquidateur",
    "Vos actes et votre annonce",
    "Récapitulatif et règlement",
  ];

  for (const [rang, titre] of titres.entries()) {
    await page.goto("/fermeture?dossier=" + dossier + "&etape=" + (rang + 1));
    await expect(page.getByRole("heading", { name: titre, exact: true })).toBeVisible();
  }
});

test("la règle de majorité annoncée est celle de la forme", async ({ page, request }) => {
  const { dossier } = await dossierDissous(request);
  await page.goto("/fermeture?dossier=" + dossier + "&etape=2");
  await expect(page.getByText("L. 223-30")).toBeVisible();

  const { dossier: sas } = await dossierDissous(request, {
    societe: { ...SOCIETE, forme: "SAS" },
  });
  await page.goto("/fermeture?dossier=" + sas + "&etape=2");
  await expect(page.getByText("L. 227-9")).toBeVisible();
});

test("l'annonce légale est rédigée, et la TUP n'en a pas", async ({ page, request }) => {
  const { dossier } = await dossierDissous(request);
  await page.goto("/fermeture?dossier=" + dossier + "&etape=3");

  // Le texte prêt à copier, et non la simple mention du mot dans une explication.
  const avis = page.locator("pre[class*='avisTexte']");
  await expect(avis).toHaveCount(1);
  await expect(avis).toContainText("AVIS DE DISSOLUTION");
  await expect(avis).toContainText("Le siège de la liquidation est fixé");

  const { dossier: tup } = await dossierDissous(request, {
    situation: { dettesImpayables: false, associeUniquePersonneMorale: true },
  });
  await page.goto("/fermeture?dossier=" + tup + "&etape=3");
  await expect(page.locator("pre[class*='avisTexte']")).toHaveCount(0);
  await expect(page.getByText("BODACC", { exact: false }).first()).toBeVisible();
});

test("le devis distingue nos honoraires des frais réglementés", async ({ page, request }) => {
  const { dossier } = await dossierDissous(request);
  await page.goto("/fermeture?dossier=" + dossier + "&etape=4");

  await expect(page.getByText("Dissolution et liquidation amiable")).toBeVisible();
  await expect(page.getByText("500,00 €", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("Annonce légale de dissolution")).toBeVisible();
  await expect(page.getByText("Greffe - inscription de la dissolution")).toBeVisible();
  // La clôture est comprise : le client ne doit pas croire qu'il repaiera.
  await expect(page.getByText("vous ne repaierez rien")).toBeVisible();
});

test("le solde de la liquidation se calcule et s'explique", async ({ page, request }) => {
  const { dossier } = await dossierDissous(request);
  await request.patch("/api/formalites/fermeture", { data: { dossier } });
  await ecrire(request, dossier, { valeurs: CLOTURE });

  await page.goto("/fermeture?dossier=" + dossier + "&phase=cloture&etape=2");

  // 60 000 - 30 000 - 2 000 = 28 000 d'actif net, dont 10 000 de capital : 18 000 de boni.
  await expect(page.getByText("Boni de liquidation")).toBeVisible();
  await expect(page.getByText("18 000,00 €", { exact: false }).first()).toBeVisible();
  // 2,5 % de l'actif net partagé, non du seul boni.
  await expect(page.getByText("700,00 €", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("revenu distribué", { exact: false })).toBeVisible();
});

test("la colonne de droite dit la phase, le liquidateur et l'échéance", async ({
  page,
  request,
}) => {
  /*
   * La fermeture est le seul parcours en deux temps séparés par des mois : on rouvre
   * son dossier longtemps après l'avoir quitté, et rien ne disait où l'on en était.
   */
  const { dossier } = await dossierDissous(request);
  await page.goto("/fermeture?dossier=" + dossier + "&etape=2");

  const colonne = page.getByRole("complementary", {
    name: "Récapitulatif de votre fermeture",
  });
  await expect(colonne).toBeVisible();
  await expect(colonne.getByText("Dissolution · liquidation amiable")).toBeVisible();
  await expect(colonne.getByText("ESSAI FERMETURE")).toBeVisible();
  await expect(colonne.getByText("552 100 554")).toBeVisible();
  await expect(colonne.getByText("10 mars 2026")).toBeVisible();
  await expect(colonne.getByText("Madame Claire MARTIN")).toBeVisible();

  /* Le mandat du liquidateur court trois ans, jour pour jour. */
  await expect(colonne.getByText("Fin du mandat")).toBeVisible();
  await expect(colonne.getByText("10 mars 2029")).toBeVisible();
});

test("en clôture, ce qui manque se dit sur l'écran qui le saisit", async ({ page, request }) => {
  /*
   * Les quatre étapes de la clôture ne sont pas celles de la dissolution : « Les comptes
   * de liquidation » porte tous les champs, « Le solde » ne fait que calculer. Le
   * découpage de la dissolution était appliqué tel quel - le premier écran ne bloquait
   * sur rien, et le second, qui n'a pas une case à remplir, refusait d'avancer en
   * réclamant la date de clôture, une étape en arrière.
   */
  const { dossier } = await dossierDissous(request);
  await request.patch("/api/formalites/fermeture", { data: { dossier } });

  await page.goto("/fermeture?dossier=" + dossier + "&phase=cloture&etape=1");
  // Le formulaire attend d'être vivant : un clic avant l'hydratation ne bloque rien.
  await expect(page.getByLabel("Date de la décision de clôture")).toBeVisible();
  await page.getByRole("button", { name: "Continuer" }).click();

  // On reste sur les comptes, et le manque se lit sur le champ qui le porte.
  await expect(
    page.getByRole("heading", { name: "Les comptes de liquidation", level: 2 })
  ).toBeVisible();
  await expect(
    /*
     * « … est requis » collait un adjectif à un libellé sans l'accorder : la moitié
     * des champs sont féminins. « À renseigner » ne s'accorde avec rien.
     */
    page.getByText("Date de la décision de clôture : à renseigner", { exact: true })
  ).toBeVisible();

  // Rempli, l'écran laisse passer.
  await ecrire(request, dossier, { valeurs: CLOTURE });
  await page.goto("/fermeture?dossier=" + dossier + "&phase=cloture&etape=1");
  await expect(page.getByLabel("Date de la décision de clôture")).toBeVisible();
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.getByRole("heading", { name: "Le solde de la liquidation" })).toBeVisible();
});
