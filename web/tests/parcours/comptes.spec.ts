import { test, expect } from "@playwright/test";

/**
 * Le dépôt des comptes annuels.
 *
 * Une formalité qui revient chaque année, et dont les erreurs sont silencieuses : une
 * réserve légale dotée là où aucune n'est due, un dividende qui dépasse le bénéfice
 * distribuable, une déclaration de confidentialité signée par une société qui n'y a
 * pas droit. Ces parcours tiennent la chaîne entière, du dossier vide aux actes.
 */
test.describe.configure({ mode: "serial" });

const SOCIETE = {
  denomination: "ESSAI COMPTES",
  forme: "SAS",
  siren: "552100554",
  adresse: "12 rue de la Paix",
  codePostal: "75002",
  ville: "Paris",
  capital: 20000,
  villeRcs: "Paris",
};

const ASSOCIES = [
  { civilite: "Madame", prenom: "Claire", nom: "MARCHAND", parts: 600 },
  { civilite: "Monsieur", prenom: "Paul", nom: "LEROY", parts: 400 },
];

const EXERCICE = {
  dateOuverture: "2025-01-01",
  dateCloture: "2025-12-31",
  dateAssemblee: "2026-06-15",
  heureAssemblee: "14 heures",
  lieuAssemblee: "au siège social",
  dirigeantNom: "Madame Claire MARCHAND",
  dirigeantFonction: "Président",
  commissaireAuxComptes: "Non",
  resultat: 48000,
  reportAnterieur: -6000,
  reserveLegale: 500,
  totalBilan: 310000,
  chiffreAffaires: 620000,
  effectif: 4,
  depensesNonDeductibles: 0,
};

type Requete = import("@playwright/test").APIRequestContext;

async function ouvrirUnDossier(request: Requete) {
  const reponse = await request.post("/api/formalites/comptes");
  expect(reponse.status()).toBe(201);
  return (await reponse.json()).dossier as number;
}

/** Un dossier complet, prêt à produire ses actes. */
async function dossierRempli(request: Requete, sur: Record<string, unknown> = {}) {
  const dossier = await ouvrirUnDossier(request);
  const reponse = await request.put("/api/formalites/comptes", {
    data: {
      dossier,
      societe: SOCIETE,
      associes: ASSOCIES,
      valeurs: EXERCICE,
      ...sur,
    },
  });
  expect(reponse.ok(), await reponse.text()).toBe(true);
  return { dossier, comptes: (await reponse.json()).comptes };
}

test("un dossier s'ouvre vide, et la société se choisit ensuite", async ({ request }) => {
  const { comptes } = await dossierRempli(request);
  expect(comptes.societe.denomination).toBe("ESSAI COMPTES");
});

test("l'affectation proposée dote la réserve légale, sans distribuer", async ({ request }) => {
  /*
   * Résultat 48 000, report débiteur de 6 000 : l'assiette est 42 000, dont un
   * vingtième ferait 2 100. Le dixième du capital plafonne à 2 000, et 500 sont déjà
   * dotés : il ne reste que 1 500 à prélever.
   */
  const { comptes } = await dossierRempli(request);

  expect(comptes.affectation.reserveLegaleCentimes).toBe(150000);
  expect(comptes.affectation.dividendesCentimes).toBe(0);
  expect(comptes.affectation.reportANouveauCentimes).toBe(4050000);
});

test("une société civile ne dote aucune réserve légale", async ({ request }) => {
  const { comptes } = await dossierRempli(request, {
    societe: { ...SOCIETE, forme: "SCI" },
  });

  expect(comptes.affectation.reserveLegaleCentimes).toBe(0);
});

test("un dossier incomplet ne produit pas d'actes troués", async ({ request }) => {
  const dossier = await ouvrirUnDossier(request);
  await request.put("/api/formalites/comptes", {
    data: { dossier, societe: SOCIETE },
  });

  const production = await request.post("/api/formalites/comptes/documents", {
    data: { dossier },
  });
  expect(production.status()).toBe(400);
  expect((await production.json()).manques.length).toBeGreaterThan(0);
});

test("une affectation qui ne tombe pas juste est refusée", async ({ request }) => {
  const { dossier } = await dossierRempli(request);

  await request.put("/api/formalites/comptes", {
    data: {
      dossier,
      affectation: {
        reserveLegaleCentimes: 150000,
        autresReservesCentimes: 0,
        dividendesCentimes: 100000,
        reportANouveauCentimes: 0,
      },
    },
  });

  const production = await request.post("/api/formalites/comptes/documents", {
    data: { dossier },
  });
  expect(production.status()).toBe(400);
  expect(JSON.stringify(await production.json())).toContain("ne tombe pas juste");
});

test("un dividende au-delà du distribuable est refusé", async ({ request }) => {
  const { dossier } = await dossierRempli(request);

  await request.put("/api/formalites/comptes", {
    data: {
      dossier,
      affectation: {
        reserveLegaleCentimes: 150000,
        autresReservesCentimes: 0,
        dividendesCentimes: 4200000,
        reportANouveauCentimes: -150000,
      },
    },
  });

  const production = await request.post("/api/formalites/comptes/documents", {
    data: { dossier },
  });
  expect(production.status()).toBe(400);
  expect(JSON.stringify(await production.json())).toContain("distribuable");
});

test("les actes produits dépendent de ce que la loi exige", async ({ request }) => {
  // Sans convention ni confidentialité : le procès-verbal seul.
  const seul = await dossierRempli(request);
  const un = await request.post("/api/formalites/comptes/documents", {
    data: { dossier: seul.dossier },
  });
  expect(un.status()).toBe(201);
  expect((await un.json()).documents.map((d: { titre: string }) => d.titre)).toEqual([
    "Procès-verbal d'assemblée générale ordinaire annuelle",
  ]);

  // Avec une convention et la confidentialité : trois actes.
  const complet = await dossierRempli(request, {
    conventions: [
      {
        nature: "Compte courant d'associé",
        partie: "Madame Claire MARCHAND, présidente",
        objet: "avance de trésorerie",
        montantCentimes: 2500000,
        modalites: "remboursable à douze mois",
        poursuivie: false,
      },
    ],
    demandeLaConfidentialite: true,
  });
  const trois = await request.post("/api/formalites/comptes/documents", {
    data: { dossier: complet.dossier },
  });
  expect(trois.status()).toBe(201);

  const titres = (await trois.json()).documents.map((d: { titre: string }) => d.titre);
  expect(titres).toContain("Rapport spécial sur les conventions réglementées");
  expect(titres).toContain("Déclaration de confidentialité des comptes annuels");
});

test("un associé unique n'a ni rapport spécial ni assemblée", async ({ request }) => {
  /*
   * La loi le dispense du rapport et du vote : la mention au registre suffit. Lui
   * produire un rapport qu'il s'adresserait à lui-même n'aurait pas d'objet.
   */
  const { dossier } = await dossierRempli(request, {
    societe: { ...SOCIETE, forme: "SASU" },
    associes: [ASSOCIES[0]],
    valeurs: {
      ...EXERCICE,
      associeUniqueNeLe: "1979-03-03",
      associeUniqueNeA: "Bordeaux (33)",
      associeUniqueAdresse: "4 rue des Lilas, 33000 Bordeaux",
    },
    conventions: [
      {
        nature: "Bail ou mise à disposition d'un bien",
        partie: "Madame Claire MARCHAND, présidente",
        objet: "location du local du siège",
        montantCentimes: 1200000,
        modalites: "",
        poursuivie: true,
      },
    ],
  });

  const production = await request.post("/api/formalites/comptes/documents", {
    data: { dossier },
  });
  expect(production.status()).toBe(201);

  const titres = (await production.json()).documents.map((d: { titre: string }) => d.titre);
  expect(titres).toContain("Décision de l'associé unique - approbation des comptes");
  expect(titres).not.toContain("Rapport spécial sur les conventions réglementées");
});

test("le parcours s'affiche à chacune de ses étapes", async ({ page, request }) => {
  const { dossier } = await dossierRempli(request);

  const titres = [
    "La société",
    "L'exercice",
    "Les chiffres",
    "L'affectation du résultat",
    "Les conventions réglementées",
    "La confidentialité",
    "Récapitulatif et règlement",
  ];

  for (const [rang, titre] of titres.entries()) {
    await page.goto("/depot-des-comptes?dossier=" + dossier + "&etape=" + (rang + 1));
    await expect(page.getByRole("heading", { name: titre, exact: true })).toBeVisible();
  }
});

test("l'écran d'entrée annonce les seuils de confidentialité", async ({ page }) => {
  /*
   * C'est souvent la raison de la visite : découvrir à la dernière étape qu'on n'y a
   * pas droit est une déception qu'un tableau de trois lignes évite.
   */
  await page.goto("/depot-des-comptes");

  await expect(page.getByText("Micro-entreprise")).toBeVisible();
  await expect(page.getByText("450 000 €")).toBeVisible();
  await expect(page.getByText("Compte de résultat seul")).toBeVisible();
});
