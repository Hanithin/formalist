import { test, expect } from "@playwright/test";

/**
 * La fermeture d'une auto-entreprise.
 *
 * Le parcours le plus court, et celui dont la valeur n'est pas dans la formalité : elle
 * est gratuite et prend dix minutes. Elle est dans ce qui suit - quatre échéances, dont
 * deux se comptent en jours - et dans le choix qu'on offre à l'entrée : fermer, ou
 * mettre en pause. Une cessation définitive ne se défait pas.
 */
test.describe.configure({ mode: "serial" });

const ENTREPRISE = {
  denomination: "ATELIER ESSAI",
  siren: "902345678",
  activite: "graphisme",
  adresse: "8 rue des Lilas",
  codePostal: "75011",
  ville: "Paris",
};

const ENTREPRENEUR = {
  civilite: "Madame",
  prenom: "Camille",
  nom: "DURAND",
  adresse: "8 rue des Lilas, 75011 Paris",
};

const VALEURS = {
  dateCessation: "2026-05-14",
  motif: "Création d'une société",
  activiteCommerciale: "Non",
  periodicite: "Trimestrielle",
  assujettiTva: "Non",
  agentCommercial: "Non",
};

type Requete = import("@playwright/test").APIRequestContext;

async function dossierRempli(request: Requete, sur: Record<string, unknown> = {}) {
  const ouverture = await request.post("/api/formalites/cessation");
  expect(ouverture.status()).toBe(201);
  const dossier = (await ouverture.json()).dossier as number;

  const reponse = await request.put("/api/formalites/cessation", {
    data: {
      dossier,
      nature: "definitive",
      entreprise: ENTREPRISE,
      entrepreneur: ENTREPRENEUR,
      valeurs: VALEURS,
      ...sur,
    },
  });
  expect(reponse.ok(), await reponse.text()).toBe(true);
  return { dossier, cessation: (await reponse.json()).cessation };
}

test("un dossier s'ouvre, se remplit et produit ses deux pièces", async ({ request }) => {
  const { dossier } = await dossierRempli(request);

  const production = await request.post("/api/formalites/cessation/documents", {
    data: { dossier },
  });
  expect(production.status()).toBe(201);

  const titres = (await production.json()).documents.map((d: { titre: string }) => d.titre);
  expect(titres).toContain("Déclaration de cessation d'activité");
  expect(titres).toContain("Pouvoir pour la formalité au guichet unique");
});

test("une date d'arrêt dans le futur est refusée", async ({ request }) => {
  /*
   * Le guichet la refuserait : on ne déclare pas l'arrêt d'une activité qui n'a pas
   * cessé. C'est presque toujours une faute de frappe sur l'année.
   */
  const { dossier } = await dossierRempli(request, {
    valeurs: { ...VALEURS, dateCessation: "2099-01-01" },
  });

  const production = await request.post("/api/formalites/cessation/documents", {
    data: { dossier },
  });
  expect(production.status()).toBe(400);
  expect(JSON.stringify(await production.json())).toContain("dans le futur");
});

test("un dossier incomplet ne produit rien", async ({ request }) => {
  const ouverture = await request.post("/api/formalites/cessation");
  const dossier = (await ouverture.json()).dossier as number;

  const production = await request.post("/api/formalites/cessation/documents", {
    data: { dossier },
  });
  expect(production.status()).toBe(400);
  expect((await production.json()).manques.length).toBeGreaterThan(0);
});

test("la suspension se dit comme une suspension", async ({ request }) => {
  const { dossier } = await dossierRempli(request, { nature: "temporaire" });

  const production = await request.post("/api/formalites/cessation/documents", {
    data: { dossier },
  });
  expect(production.status()).toBe(201);

  const titres = (await production.json()).documents.map((d: { titre: string }) => d.titre);
  expect(titres).toContain("Déclaration de suspension d'activité");
});

test("l'entrée met la pause à égalité avec la fermeture", async ({ page }) => {
  /*
   * Presque personne ne sait que la suspension existe : on radie son SIRET pour une
   * pause de six mois, et l'on découvre en revenant qu'il faut tout refaire.
   */
  await page.goto("/cessation");

  await expect(page.getByRole("heading", { name: "Fermer votre auto-entreprise" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Fermer définitivement/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Mettre en pause/ })).toBeVisible();

  // Rien ne s'ouvre tant qu'on n'a pas tranché.
  await expect(page.getByRole("button", { name: "Commencer" })).toHaveCount(0);

  await page.getByRole("button", { name: /Mettre en pause/ }).click();
  await expect(page.getByText(/radiation d'office/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Commencer" })).toBeVisible();
});

test("le prix annonce que la formalité, elle, est gratuite", async ({ page }) => {
  await page.goto("/cessation");
  await page.getByRole("button", { name: /Fermer définitivement/ }).click();

  await expect(page.getByText("79,00 €", { exact: false })).toBeVisible();
  await expect(page.getByText(/ni annonce légale, ni frais de greffe/)).toBeVisible();
});

test("le calendrier se calcule à mesure qu'on répond", async ({ page, request }) => {
  const { dossier } = await dossierRempli(request);
  await page.goto("/cessation?dossier=" + dossier + "&etape=2");

  // Trimestre clos le 30 juin, déclaration dans le mois : 30 juillet.
  await expect(page.getByText("Dernière déclaration de chiffre d'affaires")).toBeVisible();
  await expect(page.getByText("30/07/2026")).toBeVisible();

  // La déclaration au guichet nous revient, et c'est dit.
  await expect(page.getByText("nous nous en chargeons")).toBeVisible();

  // Sans TVA ni mandat d'agent, ces deux échéances ne s'inventent pas.
  await expect(page.getByText("Déclaration de TVA de cessation")).toHaveCount(0);
  await expect(page.getByText("Radiation du registre des agents commerciaux")).toHaveCount(0);
});

test("le parcours s'affiche à chacune de ses trois étapes", async ({ page, request }) => {
  const { dossier } = await dossierRempli(request);

  const titres = [
    "Votre auto-entreprise",
    "L'arrêt et vos échéances",
    "Récapitulatif et règlement",
  ];

  for (const [rang, titre] of titres.entries()) {
    await page.goto("/cessation?dossier=" + dossier + "&etape=" + (rang + 1));
    await expect(page.getByRole("heading", { name: titre, exact: true })).toBeVisible();
  }
});

test("la fenêtre de création y mène", async ({ page }) => {
  await page.goto("/tableau-de-bord");
  await page.getByRole("button", { name: /Nouvelle formalité/ }).first().click();

  const fenetre = page.getByRole("dialog");
  await expect(fenetre.getByRole("link", { name: /Fermer une auto-entreprise/ })).toHaveAttribute(
    "href",
    "/cessation"
  );
});
