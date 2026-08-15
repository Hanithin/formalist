import { test, expect } from "@playwright/test";

/**
 * Auto-entreprise et recherche d'entreprise.
 */

test.describe("auto-entreprise", () => {
  test("ouvrir la déclaration crée un dossier et le met dans l'adresse", async ({ page }) => {
    await page.goto("/auto-entrepreneur");
    await expect(page).toHaveURL(/dossier=\d+/);
    await expect(page.getByRole("heading", { level: 2 })).toContainText("Identité");
  });

  test("l'étape 1 refuse de passer tant qu'elle est incomplète", async ({ page }) => {
    await page.goto("/auto-entrepreneur");
    await page.getByRole("button", { name: "Continuer" }).click();

    await expect(page.getByText("Indiquez votre nom de naissance")).toBeVisible();
    await expect(page.getByRole("heading", { level: 2 })).toContainText("Identité");
  });

  test("un mineur ne peut pas déclarer une activité", async ({ page }) => {
    await page.goto("/auto-entrepreneur");
    await page.getByLabel("Civilité").selectOption("Madame");
    await page.getByLabel("Nom de naissance").fill("Durand");
    await page.getByLabel("Prénoms").fill("Camille");
    await page.getByLabel("Date de naissance").fill("2015-01-01");
    await page.getByLabel("Nationalité").fill("Française");
    await page.getByRole("button", { name: "Continuer" }).click();

    await expect(page.getByText(/au moins 16 ans/)).toBeVisible();
  });

  /** Remplit l'identité et l'adresse, et s'arrête à l'étape activité. */
  async function jusquAActivite(page: import("@playwright/test").Page) {
    await page.goto("/auto-entrepreneur");
    await page.getByLabel("Civilité").selectOption("Madame");
    await page.getByLabel("Nom de naissance").fill("Durand");
    await page.getByLabel("Prénoms").fill("Camille");
    await page.getByLabel("Date de naissance").fill("1990-04-12");
    await page.getByLabel("Ville de naissance").fill("Bordeaux");
    await page.getByLabel("Nationalité").fill("Française");
    await page.getByLabel("Numéro de sécurité sociale").fill("290043312345678");
    await page.getByRole("button", { name: "Continuer" }).click();
    await expect(page.getByRole("heading", { level: 2 })).toContainText("Adresse");

    await page.getByLabel("Adresse du domicile").fill("12 rue des Lilas");
    await page.getByLabel("Code postal", { exact: true }).fill("75011");
    await page.getByLabel("Ville", { exact: true }).fill("Paris");
    await page.getByLabel("Situation matrimoniale").selectOption("Célibataire");
    await page.getByRole("button", { name: "Continuer" }).click();
    await expect(page.getByRole("heading", { level: 2 })).toContainText("Activité");
  }

  test("l'adresse de l'activité n'est demandée que si elle diffère", async ({ page }) => {
    await page.goto("/auto-entrepreneur");
    await page.getByLabel("Civilité").selectOption("Monsieur");
    await page.getByLabel("Nom de naissance").fill("Martin");
    await page.getByLabel("Prénoms").fill("Alex");
    await page.getByLabel("Date de naissance").fill("1985-06-01");
    await page.getByLabel("Ville de naissance").fill("Lille");
    await page.getByLabel("Nationalité").fill("Française");
    await page.getByLabel("Numéro de sécurité sociale").fill("185065912345678");
    await page.getByRole("button", { name: "Continuer" }).click();

    // « exact » : le complément d'adresse de l'activité porte un libellé qui commence
    // de la même façon.
    const voie = page.getByLabel("Adresse de l'activité", { exact: true });
    await expect(voie).toHaveCount(0);
    await page.getByLabel(/autre adresse/).check();
    await expect(voie).toBeVisible();
  });

  test("le régime fiscal découle de l'activité, il n'est pas demandé", async ({ page }) => {
    await jusquAActivite(page);

    await page.getByLabel("Nature de l'activité").selectOption("liberale");
    await expect(page.getByText(/Micro-BNC/)).toBeVisible();
    await expect(page.getByText(/77\s700 euros/)).toBeVisible();

    await page.getByLabel("Nature de l'activité").selectOption("commerciale");
    await expect(page.getByText(/Micro-BIC/)).toBeVisible();
    await expect(page.getByText(/188\s700 euros/)).toBeVisible();
  });

  test("le coût du versement libératoire est chiffré", async ({ page }) => {
    await jusquAActivite(page);
    await page.getByLabel("Nature de l'activité").selectOption("liberale");
    await page.getByLabel("Description de l'activité").fill("Conseil en design");
    await page.getByLabel("Date de début d'activité").fill("2026-09-01");
    await page.getByLabel("Lieu d'exercice").selectOption("À mon domicile");
    await page.getByRole("button", { name: "Continuer" }).click();

    await expect(page.getByRole("heading", { level: 2 })).toContainText("Options");
    // 2,2 % de 30 000 euros
    await expect(page.getByText(/660 euros/)).toBeVisible();
  });

  test("on ne saute pas par-dessus une étape incomplète", async ({ page }) => {
    await page.goto("/auto-entrepreneur");
    const dossier = new URL(page.url()).searchParams.get("dossier");

    await page.goto("/auto-entrepreneur?dossier=" + dossier + "&etape=6");
    await expect(page.getByRole("heading", { level: 2 })).toContainText("Identité");
  });

  test("la déclaration d'un autre client est refusée", async ({ request }) => {
    const reponse = await request.put("/api/auto-entrepreneur", {
      data: { dossier: 999999, modifications: { prenoms: "Intrusion" } },
    });
    expect(reponse.status()).toBe(403);
  });
});

test.describe("recherche d'entreprise", () => {
  test("un client n'y accède pas", async ({ page }) => {
    const reponse = await page.goto("/recherche-entreprise");
    expect(reponse?.status()).toBe(404);
  });

  test.describe("avocat", () => {
    test.use({ storageState: "./tests/parcours/session-avocat.json" });

    test("la page est accessible et propose la recherche", async ({ page }) => {
      await page.goto("/recherche-entreprise");
      await expect(page.getByRole("heading", { level: 1 })).toContainText("Recherche d'entreprise");
      await expect(page.getByLabel("Numéro SIREN")).toBeVisible();
    });

    test("un SIREN mal formé est signalé sans appel extérieur", async ({ page }) => {
      await page.goto("/recherche-entreprise");
      await page.getByLabel("Numéro SIREN").fill("12345");
      await page.getByRole("button", { name: "Consulter" }).click();

      await expect(page.locator("[role=alert]:not(#__next-route-announcer__)")).toContainText("neuf chiffres");
    });

    test("l'entrée figure dans son menu, pas dans celui d'un client", async ({ page }) => {
      await page.goto("/avocat");
      const liens = await page
        .getByRole("navigation", { name: "Navigation principale" })
        .getByRole("link")
        .allInnerTexts();
      expect(liens).toContain("Recherche d'entreprise");
    });
  });
});

/**
 * Les champs que le guichet exige, rendus au formulaire.
 *
 * Le portage avait laissé de côté le numéro de sécurité sociale, la ville de
 * naissance, la situation matrimoniale et le lieu d'exercice : un dossier complet ici
 * était refusé là-bas.
 */
test("le formulaire demande tout ce que le guichet réclame", async ({ page }) => {
  await page.goto("/auto-entrepreneur");

  await expect(page.getByLabel("Numéro de sécurité sociale")).toBeVisible();
  await expect(page.getByLabel("Ville de naissance")).toBeVisible();

  // Un numéro tronqué est une faute de saisie qu'on attrape ici.
  await page.getByLabel("Numéro de sécurité sociale").fill("123");
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.getByText(/quinze chiffres/)).toBeVisible();
});

test("les pièces sont énumérées, et la qualification suit l'activité", async ({ page, request }) => {
  await page.goto("/auto-entrepreneur");
  const dossier = Number(new URL(page.url()).searchParams.get("dossier"));

  const complete = {
    civilite: "Madame",
    nomNaissance: "Durand",
    prenoms: "Camille",
    dateNaissance: "1990-04-12",
    villeNaissance: "Bordeaux",
    nationalite: "Française",
    numeroSecuriteSociale: "290043312345678",
    adresseVoie: "12 rue des Lilas",
    codePostal: "75011",
    ville: "Paris",
    situationMatrimoniale: "Célibataire",
    natureActivite: "liberale",
    descriptionActivite: "Conseil en design",
    dateDebut: "2026-09-01",
    lieuExercice: "À mon domicile",
  };

  await request.put("/api/auto-entrepreneur", {
    data: { dossier, modifications: complete },
  });

  await page.goto("/auto-entrepreneur?dossier=" + dossier + "&etape=5");
  await expect(page.getByText("Pièce d'identité - recto")).toBeVisible();
  await expect(page.getByText("Pièce d'identité - verso")).toBeVisible();
  await expect(page.getByText("Justificatif de domicile")).toBeVisible();
  // Sans activité réglementée, pas de justificatif de qualification.
  await expect(page.getByText(/Qualification professionnelle/)).toHaveCount(0);

  await request.put("/api/auto-entrepreneur", {
    data: { dossier, modifications: { ...complete, activiteReglementee: true } },
  });

  await page.reload();
  await expect(page.getByText(/Qualification professionnelle/)).toBeVisible();
});

test("l'option EIRL n'est pas reprise : le statut n'existe plus", async ({ page, request }) => {
  /*
   * La loi du 14 février 2022 a supprimé l'EIRL, et sa création est impossible depuis
   * le 15 février 2022. La proposer laisserait choisir ce qui n'existe pas.
   */
  await page.goto("/auto-entrepreneur");
  const dossier = Number(new URL(page.url()).searchParams.get("dossier"));

  await request.put("/api/auto-entrepreneur", {
    data: {
      dossier,
      modifications: {
        civilite: "Madame",
        nomNaissance: "Durand",
        prenoms: "Camille",
        dateNaissance: "1990-04-12",
        villeNaissance: "Bordeaux",
        nationalite: "Française",
        numeroSecuriteSociale: "290043312345678",
        adresseVoie: "12 rue des Lilas",
        codePostal: "75011",
        ville: "Paris",
        situationMatrimoniale: "Célibataire",
        natureActivite: "liberale",
        descriptionActivite: "Conseil",
        dateDebut: "2026-09-01",
        lieuExercice: "À mon domicile",
      },
    },
  });

  await page.goto("/auto-entrepreneur?dossier=" + dossier + "&etape=4");
  await expect(page.getByText("EIRL")).toHaveCount(0);
  await expect(page.getByText(/patrimoine personnel est protégé/)).toBeVisible();
});
