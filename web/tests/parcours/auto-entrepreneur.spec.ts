import { test, expect } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/infrastructure/db/generated/client";

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
    await page.getByRole("radio", { name: /Non, aucune ne correspond/ }).check();
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
    reponseReglementation: "non",
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
    data: {
      dossier,
      modifications: {
        ...complete,
        reponseReglementation: "oui",
        categorieReglementee: "coiffure",
      },
    },
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
        reponseReglementation: "non",
      },
    },
  });

  await page.goto("/auto-entrepreneur?dossier=" + dossier + "&etape=4");
  await expect(page.getByText("EIRL")).toHaveCount(0);
  await expect(page.getByText(/patrimoine personnel est protégé/)).toBeVisible();
});

test("le parcours a le cadre de la création de société", async ({ page }) => {
  /*
   * Deux parcours du même site doivent se lire pareil : fil d'ariane, fil d'étapes
   * horizontal, colonne centrée. Celui de l'auto-entreprise portait son fil en
   * colonne à gauche et s'étalait sur toute la largeur.
   */
  await page.setViewportSize({ width: 1400, height: 900 });

  const mesures: Record<string, { x: number; largeur: number }> = {};

  for (const adresse of ["/creation", "/auto-entrepreneur"]) {
    await page.goto(adresse);
    const fil = page.getByRole("navigation", { name: "Étapes du parcours" });
    await expect(fil).toBeVisible();

    const cadre = (await fil.boundingBox())!;
    mesures[adresse] = { x: Math.round(cadre.x), largeur: Math.round(cadre.width) };
  }

  expect(mesures["/auto-entrepreneur"]).toEqual(mesures["/creation"]);

  // Et le fil d'ariane situe la page, comme sur la création.
  await expect(page.getByRole("navigation", { name: "Fil d'ariane" })).toContainText(
    "Créer une auto-entreprise"
  );
});

test("les champs courts se posent deux par ligne", async ({ page }) => {
  /*
   * Sur une seule colonne, l'étape « Identité » descendait sur deux écrans pour neuf
   * champs courts. Ce qui se lit long - une adresse, un texte libre - garde la ligne
   * entière.
   */
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.goto("/auto-entrepreneur");

  const civilite = (await page.getByLabel("Civilité").boundingBox())!;
  const nom = (await page.getByLabel("Nom de naissance").boundingBox())!;

  // Deux champs courts partagent la ligne : même hauteur, l'un à droite de l'autre.
  expect(Math.round(civilite.y)).toBe(Math.round(nom.y));
  expect(nom.x).toBeGreaterThan(civilite.x + civilite.width);

  // Et la case à cocher garde son texte à côté d'elle, non dans l'autre colonne.
  await page.getByLabel("Civilité").selectOption("Madame");
  await page.getByLabel("Nom de naissance").fill("Durand");
  await page.getByLabel("Prénoms").fill("Camille");
  await page.getByLabel("Date de naissance").fill("1990-04-12");
  await page.getByLabel("Ville de naissance").fill("Bordeaux");
  await page.getByLabel("Nationalité").fill("Française");
  await page.getByLabel("Numéro de sécurité sociale").fill("290043312345678");
  await page.getByRole("button", { name: "Continuer" }).click();

  // Le libellé porte la case : on mesure le libellé lui-même, non son conteneur.
  const etiquette = page.locator("label").filter({ hasText: /autre adresse/ });
  await expect(etiquette).toBeVisible();

  const boite = (await etiquette.boundingBox())!;
  // Une seule ligne : la case et son texte tiennent ensemble, non dans deux colonnes.
  expect(boite.height).toBeLessThan(60);
});

test("l'adresse se complète sur la Base Adresse Nationale", async ({ page }) => {
  // Recopier le code postal et la ville à la main est là où l'erreur se glisse : le
  // greffe rejette un siège dont la commune ne correspond pas au code postal.
  await page.goto("/auto-entrepreneur");
  await page.getByLabel("Civilité").selectOption("Madame");
  await page.getByLabel("Nom de naissance").fill("Durand");
  await page.getByLabel("Prénoms").fill("Camille");
  await page.getByLabel("Date de naissance").fill("1990-04-12");
  await page.getByLabel("Ville de naissance").fill("Bordeaux");
  await page.getByLabel("Nationalité").fill("Française");
  await page.getByLabel("Numéro de sécurité sociale").fill("290043312345678");
  await page.getByRole("button", { name: "Continuer" }).click();

  await page.getByLabel("Adresse du domicile").type("12 rue de la Paix", { delay: 30 });
  const propositions = page.getByRole("listbox").first();
  await propositions.waitFor({ timeout: 15_000 });

  await propositions.getByRole("option").first().click();
  // Choisir une proposition remplit le code postal et la ville.
  await expect(page.getByLabel("Code postal", { exact: true })).not.toHaveValue("");
  await expect(page.getByLabel("Ville", { exact: true })).not.toHaveValue("");
});

test("la réglementation se reconnaît dans une liste, et le doute est une réponse", async ({
  page,
  request,
}) => {
  /*
   * Une case « mon activité est réglementée » demandait de trancher une question de
   * droit qu'on ne connaît pas : cochée à tort elle réclame un diplôme inutile,
   * oubliée elle fait refuser le dossier au guichet.
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
        natureActivite: "artisanale",
        descriptionActivite: "Coiffure à domicile",
        dateDebut: "2026-09-01",
        lieuExercice: "Chez mes clients",
      },
    },
  });

  await page.goto("/auto-entrepreneur?dossier=" + dossier + "&etape=3");

  // Les intitulés légaux sont donnés avec les métiers qu'ils recouvrent.
  await expect(page.getByText("Plombier, Chauffagiste, Électricien", { exact: false })).toBeVisible();

  // Sans réponse, on n'avance pas : c'est le seul moyen de ne pas décider à sa place.
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.getByText(/si votre métier figure dans la liste/)).toBeVisible();

  // « Oui » demande lequel : on ne sait pas quelle pièce réclamer sans le métier.
  await page.getByRole("radio", { name: /Oui, c'est l'une de ces activités/ }).check();
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.getByText(/Choisissez l'activité qui correspond/)).toBeVisible();

  await page.getByLabel("Laquelle ?").selectOption("coiffure");
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.getByRole("heading", { level: 2 })).toContainText("Options");

  // Le justificatif est réclamé, et nomme l'activité reconnue.
  await page.goto("/auto-entrepreneur?dossier=" + dossier + "&etape=5");
  await expect(page.getByText("Qualification professionnelle")).toBeVisible();
  await expect(page.getByText(/coiffure/)).toBeVisible();

  // Un doute n'appelle pas de pièce : il appelle un avis.
  await page.goto("/auto-entrepreneur?dossier=" + dossier + "&etape=3");
  await page.getByRole("radio", { name: /Je ne sais pas/ }).check();
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.getByRole("heading", { level: 2 })).toContainText("Options");

  await page.goto("/auto-entrepreneur?dossier=" + dossier + "&etape=5");
  await expect(page.getByText("Qualification professionnelle")).toHaveCount(0);
});

const DECLARATION_COMPLETE = {
  civilite: "Madame",
  nomNaissance: "Durand",
  prenoms: "Camille",
  dateNaissance: "1990-04-12",
  villeNaissance: "Bordeaux",
  paysNaissance: "France",
  nationalite: "Française",
  numeroSecuriteSociale: "290043312345678",
  adresseVoie: "12 rue des Lilas",
  codePostal: "75011",
  ville: "Paris",
  situationMatrimoniale: "Célibataire",
  natureActivite: "artisanale",
  descriptionActivite: "Coiffure à domicile",
  dateDebut: "2026-09-01",
  lieuExercice: "Chez mes clients",
  reponseReglementation: "oui",
  categorieReglementee: "coiffure",
  filiationMere: "Durand Sophie",
  filiationPere: "Durand Marc",
  certifie: true,
};

test("le récapitulatif montre tout ce qui sera déposé", async ({ page, request }) => {
  /*
   * Il affichait quatre lignes sur une déclaration qui en compte trente : on ne
   * pouvait pas relire ce qu'on s'apprêtait à déposer.
   */
  await page.goto("/auto-entrepreneur");
  const dossier = Number(new URL(page.url()).searchParams.get("dossier"));

  await request.put("/api/auto-entrepreneur", {
    data: { dossier, modifications: DECLARATION_COMPLETE },
  });

  await page.goto("/auto-entrepreneur?dossier=" + dossier + "&etape=7");

  for (const attendu of [
    "290043312345678",
    "12 rue des Lilas",
    "Célibataire",
    "Chez mes clients",
    "Durand Sophie",
    "Micro-BIC",
  ]) {
    await expect(page.getByText(attendu, { exact: false }).first()).toBeVisible();
  }

  // Les dates se lisent en français : personne ne déclare en ISO.
  await expect(page.getByText("12 avril 1990")).toBeVisible();
  await expect(page.getByText("1990-04-12")).toHaveCount(0);
});

test("l'offre dit ce qu'elle vend, son prix et ce qu'elle ne cache pas", async ({
  page,
  request,
}) => {
  await page.goto("/auto-entrepreneur");
  const dossier = Number(new URL(page.url()).searchParams.get("dossier"));

  await request.put("/api/auto-entrepreneur", {
    data: { dossier, modifications: DECLARATION_COMPLETE },
  });

  await page.goto("/auto-entrepreneur?dossier=" + dossier + "&etape=8");

  await expect(page.getByText("149 €")).toBeVisible();
  await expect(page.getByText(/178,80 € TTC/)).toBeVisible();
  // Les frais sont dits avant, jamais facturés après.
  await expect(page.getByText(/Aucun frais administratif/)).toBeVisible();
  await expect(page.getByText(/agent commercial/)).toBeVisible();
  await expect(page.getByText(/Dépôt au guichet unique/)).toBeVisible();
  // La démarche est gratuite si on la fait soi-même : le taire ferait croire que les
  // 200 euros sont un droit à payer, et qui l'apprend après coup ne revient pas.
  await expect(page.getByText(/gratuite si vous la faites vous-même/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Confier mon dossier à un avocat/ })).toBeVisible();
});

test("une déclaration incomplète ne s'ouvre pas au paiement", async ({ page, request }) => {
  // L'avocat recevrait un dossier qu'il ne peut pas déposer, et il faudrait rembourser.
  await page.goto("/auto-entrepreneur");
  const dossier = Number(new URL(page.url()).searchParams.get("dossier"));

  const reponse = await request.post("/api/auto-entrepreneur/paiement", { data: { dossier } });
  expect(reponse.status()).toBe(400);
  expect((await reponse.json()).error).toContain("Complétez");
});

test("un paiement abandonné le dit, et ne laisse pas croire à un débit", async ({
  page,
  request,
}) => {
  /*
   * Revenir sur l'offre sans un mot laisse craindre d'avoir été débité quand même :
   * c'est le doute le plus coûteux d'un parcours de paiement.
   */
  await page.goto("/auto-entrepreneur");
  const dossier = Number(new URL(page.url()).searchParams.get("dossier"));

  await request.put("/api/auto-entrepreneur", {
    data: { dossier, modifications: DECLARATION_COMPLETE },
  });

  await page.goto("/auto-entrepreneur?dossier=" + dossier + "&etape=8&paiement=annule");

  const annonce = page.getByRole("dialog", { name: "Paiement annulé" });
  await expect(annonce).toBeVisible();
  await expect(annonce.getByText("Rien n'a été débité.")).toBeVisible();

  // Fermer nettoie l'adresse : rouvrir la page ne rejoue pas l'annonce.
  await annonce.getByRole("button", { name: /Revenir à l'offre/ }).click();
  await page.waitForURL((adresse) => !adresse.searchParams.has("paiement"));
  await expect(annonce).toHaveCount(0);

  // Et l'offre est toujours là : la déclaration n'a pas bougé.
  await expect(page.getByRole("button", { name: /Confier mon dossier/ })).toBeVisible();
});

test("une déclaration réglée ne se reprend plus", async ({ page, request }) => {
  /*
   * Elle est entre les mains d'un avocat qui va la déposer : la laisser modifier
   * ferait déposer autre chose que ce qui a été relu, et revenir sur l'offre déjà
   * payée ferait douter d'avoir payé.
   */
  const prisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.DATABASE_URL ?? "",
      options: "-c timezone=UTC",
    }),
  });

  await page.goto("/auto-entrepreneur");
  const dossier = Number(new URL(page.url()).searchParams.get("dossier"));

  await request.put("/api/auto-entrepreneur", {
    data: { dossier, modifications: DECLARATION_COMPLETE },
  });

  // Le paiement lui-même passe par Stripe : on pose l'état qu'il aurait laissé.
  await prisma.formalites.update({
    where: { id: dossier },
    data: { data_json: JSON.stringify({ ...DECLARATION_COMPLETE, paye: true }) },
  });

  /*
   * Quelle que soit l'étape demandée, on arrive sur le récapitulatif : c'est ce qui a
   * été déposé qu'on vient relire, et le suivi au-dessus dit où en est le dossier.
   */
  await page.goto("/auto-entrepreneur?dossier=" + dossier + "&etape=2");
  // Le suivi porte aussi un titre de niveau 2 : on nomme celui qu'on vise.
  await expect(page.getByRole("heading", { name: "Récapitulatif" })).toBeVisible();

  /*
   * Et le fil d'étapes a disparu : il sert à parcourir un formulaire, et quand il n'y
   * a plus rien à parcourir il ne fait que repousser le récapitulatif vers le bas.
   */
  await expect(page.getByRole("navigation", { name: "Étapes du parcours" })).toHaveCount(0);
  await expect(page.getByText(/Ce qui a été confié à l'avocat/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Étape précédente" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Confier mon dossier/ })).toHaveCount(0);

  // Et le suivi montre les quatre étapes propres à l'auto-entreprise.
  const suivi = page.getByRole("region", { name: "Avancement du dossier" });
  await expect(suivi).toBeVisible();
  await expect(suivi.getByText("Dossier confié à un avocat")).toBeVisible();
  await expect(suivi.getByText("SIRET délivré")).toBeVisible();
  // Ni capital, ni annonce légale, ni Kbis : ce n'est pas son chemin.
  await expect(suivi.getByText(/Kbis/)).toHaveCount(0);
  await expect(suivi.getByText(/annonce légale/)).toHaveCount(0);

  /*
   * Et la carte du dossier propose de le suivre, non de le reprendre : il n'y a plus
   * rien à reprendre, il est chez l'avocat.
   */
  await prisma.formalites.update({
    where: { id: dossier },
    data: { status: "en_attente_validation", societe: "SUIVI AE " + dossier },
  });

  await page.goto("/formalites");
  const carte = page.getByText("SUIVI AE " + dossier).first().locator("..");
  await expect(carte).toContainText("Suivre");

  await prisma.$disconnect();
});

test("les pièces se déposent depuis le parcours", async ({ page, request }) => {
  /*
   * La route de dépôt lisait la liste de la création de société : pour un dossier
   * d'auto-entreprise elle proposait une attestation de dépôt de capital, et refusait
   * tout ce que le parcours demandait. Le client ne pouvait rien remettre.
   */
  const PDF = Buffer.from("%PDF-1.4\nfaux document d'essai\n%%EOF\n");

  await page.goto("/auto-entrepreneur");
  const dossier = Number(new URL(page.url()).searchParams.get("dossier"));

  await request.put("/api/auto-entrepreneur", {
    data: {
      dossier,
      modifications: {
        ...DECLARATION_COMPLETE,
        reponseReglementation: "oui",
        categorieReglementee: "coiffure",
      },
    },
  });

  await page.goto("/auto-entrepreneur?dossier=" + dossier + "&etape=5");

  // Quatre pièces : identité recto, verso, domicile, et la qualification du métier.
  await expect(page.getByLabel("Choisir un fichier")).toHaveCount(4);
  await expect(page.getByText(/La coiffure/)).toBeVisible();

  await page.getByLabel("Choisir un fichier").first().setInputFiles({
    name: "identite.pdf",
    mimeType: "application/pdf",
    buffer: PDF,
  });
  await expect(page.getByText("Pièce enregistrée")).toBeVisible();

  // Ce que ce parcours n'attend pas reste refusé : la liste n'est pas un fourre-tout.
  const corps = new FormData();
  corps.append("dossier", String(dossier));
  corps.append("piece", "depot-capital");
  corps.append("fichier", new Blob([PDF], { type: "application/pdf" }), "x.pdf");

  const refus = await request.post("/api/formalites/pieces", { multipart: corps });
  expect(refus.status()).toBe(400);
  expect((await refus.json()).error).toContain("pas attendue");
});
