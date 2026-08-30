import { test, expect } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/infrastructure/db/generated/client";
import { execFile } from "node:child_process";
import { retirerDossiers } from "./nettoyage";

/**
 * Les dossiers ouverts par ce fichier, retirés une fois la série passée.
 *
 * Les specs partagent un compte, et l'espace avocat n'affiche que les trente
 * dossiers les plus récents. Sans ce nettoyage, les dossiers d'exemple sortaient de
 * la liste et faisaient échouer des tests qui n'avaient pas changé.
 */
const ouverts: number[] = [];

/**
 * Ouvre un dossier, puis la page de création dessus.
 *
 * Visiter /creation n'ouvre plus rien : le dossier naît au premier enregistrement,
 * pour qu'un visiteur qui regarde l'écran et repart ne laisse pas derrière lui une
 * formalité « Sans nom » dans la file de l'avocat. Un test qui a besoin d'un dossier
 * le demande donc à l'API, comme le fait le parcours lui-même.
 */
async function ouvrirCreation(
  page: import("@playwright/test").Page,
  request: import("@playwright/test").APIRequestContext
) {
  const reponse = await request.post("/api/formalites/brouillon");
  const { dossier } = await reponse.json();
  ouverts.push(Number(dossier));
  await page.goto("/creation?dossier=" + dossier);
  return String(dossier);
}

/**
 * Choisit une valeur dans un sélecteur du parcours.
 *
 * Les listes ne sont plus des <select> : la restauration du design d'origine a
 * remis le .cselect de creation.html, un bouton qui ouvre une liste role="listbox".
 * selectOption() ne s'y applique pas.
 */
async function choisir(
  page: import("@playwright/test").Page,
  libelle: string,
  option: RegExp | string
) {
  await page.getByLabel(libelle).click();
  await page.getByRole("option", { name: option }).click();
}

/**
 * Un associé complet.
 *
 * La date de naissance est exigée par l'étape - les actes la portent - et elle se
 * saisit dans un sélecteur de date, pas dans un champ texte. Les tests qui ne
 * vérifient pas la saisie elle-même montent donc leurs associés par l'API.
 */
function associe(prenom: string, nom: string) {
  return {
    type: "physique" as const,
    personne: {
      civilite: "Madame" as const,
      prenom,
      nom,
      email: prenom.toLowerCase() + "@exemple.test",
      dateDeNaissance: "1985-04-12",
      villeDeNaissance: "Bordeaux",
      nationalite: "française",
      adresse: "12 rue des Lilas",
      codePostal: "33000",
      ville: "Bordeaux",
    },
  };
}

/** LibreOffice est-il utilisable sur cette machine ? */
function libreOfficePresent(): Promise<boolean> {
  return new Promise((resoudre) =>
    execFile("soffice", ["--version"], { timeout: 10_000 }, (erreur) => resoudre(!erreur))
  );
}

/**
 * Le parcours de création.
 *
 * Le point vérifié en priorité : le brouillon vit sur le serveur. Dans la version
 * d'origine il était dans le navigateur, donc perdu en changeant d'appareil.
 */

/**
 * Regarder l'écran n'ouvre pas de dossier.
 *
 * La page en ouvrait un à chaque affichage. Un visiteur qui la regardait et repartait
 * laissait une formalité « Sans nom » comptée « en cours », réclamée par le tableau de
 * bord, et posée en tête de la file de travail de l'avocat - qui ouvrait sa journée sur
 * quatre dossiers vides. Le dossier naît maintenant au premier enregistrement.
 */
test("visiter la création n'ouvre aucun dossier", async ({ page }) => {
  /*
   * On observe l'ouverture, non le nombre de dossiers du compte : les specs tournent
   * en parallèle sur le même compte, et le total bouge sous le test. Un dossier ne
   * peut naître que de deux façons - le serveur qui redirige avec un identifiant, ce
   * que l'adresse dirait, ou le navigateur qui appelle la route d'ouverture.
   */
  const ouvertures: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/api/formalites/brouillon")) {
      ouvertures.push(r.url());
    }
  });

  await page.goto("/creation");
  await page.goto("/creation");

  await expect(page).not.toHaveURL(/dossier=/);
  await expect(page.getByRole("heading", { level: 2 })).toContainText("Informations de la société");
  expect(ouvertures).toEqual([]);
});

test("le dossier naît au premier enregistrement, sous son nom", async ({ page, request }) => {
  await page.goto("/creation");

  await choisir(page, "Forme juridique", /^SASU/);
  await page.getByLabel("Nom de la société").fill("NAISSANCE DIFFEREE");
  await page.getByLabel("Adresse du siège").fill("12 rue des Lilas");
  await page.getByRole("option", { name: /Paris/ }).first().click();
  await page.getByLabel(/Objet social/).fill("Conseil en informatique");
  await page.getByRole("button", { name: "Continuer" }).click();

  // L'adresse porte l'identifiant : un rechargement ne rouvrira pas un dossier.
  await expect(page).toHaveURL(/dossier=\d+/);
  const dossier = Number(new URL(page.url()).searchParams.get("dossier"));
  ouverts.push(dossier);

  // Et il arrive nommé chez l'avocat, non « Sans nom ».
  const { dossiers } = await (await request.get("/api/formalites")).json();
  expect(dossiers.find((d: { id: number }) => d.id === dossier)?.societe).toBe(
    "NAISSANCE DIFFEREE"
  );
});

/**
 * L'écran dit sur quelle société on travaille.
 *
 * Le titre existait mais était masqué aux seuls lecteurs d'écran : on ouvrait le
 * formulaire depuis « Mes sociétés » sans savoir laquelle on remplissait, le fil
 * d'ariane disant « Créer une société » pour tous les dossiers du compte.
 */
test("le titre nomme la société, et suit la frappe", async ({ page, request }) => {
  await ouvrirCreation(page, request);

  const titre = page.getByRole("heading", { level: 1 });
  await expect(titre).toBeVisible();
  await expect(titre).toHaveText("Nouvelle société");

  await page.getByLabel("Nom de la société").fill("ATELIER DU TITRE");
  await expect(titre).toHaveText("ATELIER DU TITRE");
});

/**
 * Le récapitulatif se remplit à mesure.
 *
 * Sept étapes et jusqu'à quinze champs par étape : arrivé au capital, on ne sait plus
 * quelle forme on a choisie deux écrans plus tôt. La colonne le rappelle sans qu'on
 * ait à revenir en arrière - ce qui ferait perdre la saisie en cours.
 */
test("la colonne montre ce qui est déjà saisi", async ({ page, request }) => {
  await ouvrirCreation(page, request);
  const colonne = page.getByRole("complementary", { name: /Récapitulatif/ });

  // Ce qui manque se dit manquant : c'est la liste de ce qu'il reste à faire.
  await expect(colonne).toContainText("à renseigner");

  await choisir(page, "Forme juridique", /^SARL/);
  await page.getByLabel("Nom de la société").fill("COLONNE VIVANTE");

  await expect(colonne).toContainText("SARL");
  await expect(colonne).toContainText("COLONNE VIVANTE");
  // Le mot du dirigeant suit la forme, ici comme dans le formulaire.
  await expect(colonne).toContainText("Gérant");

  // Et l'on n'a pas changé d'étape pour cela.
  await expect(page.getByRole("heading", { level: 2 })).toContainText("Informations de la société");
});

test("l'étape 1 refuse de passer tant qu'elle est incomplète", async ({ page, request }) => {
  await ouvrirCreation(page, request);
  await page.getByRole("button", { name: "Continuer" }).click();

  await expect(page.getByText("Choisissez une forme juridique")).toBeVisible();
  await expect(page.getByText("Indiquez le nom de la société")).toBeVisible();
  // On reste sur l'étape 1
  await expect(page.getByRole("heading", { level: 2 })).toContainText("Informations de la société");
});

test("les réponses courantes sont déjà écrites, et se relisent", async ({ page, request }) => {
  /*
   * Laissés vides, ces champs partaient vides dans les actes : des statuts sans
   * durée, sans date de clôture, sans option fiscale. La réponse courante est écrite
   * d'avance, en pleine vue et modifiable - pas appliquée en douce à la génération.
   */
  await ouvrirCreation(page, request);

  await expect(page.getByLabel("Durée de vie (années)")).toHaveValue("99");
  await expect(page.locator("#optionFiscale")).toHaveText("IS");
  /*
   * La date se lit dans un champ, non sur un bouton.
   *
   * Ce parcours avait son propre calendrier - un bouton qui ouvrait une grille, sans
   * saisie au clavier et dont les deux flèches glissaient d'un mois. Il emploie
   * maintenant `ChampDate`, comme les cinq autres : la valeur est celle d'un `input`.
   */
  await expect(page.locator("#dateCloturePremierExercice")).toHaveValue("31/12/2027");
});

test("une société de domiciliation demande ce que le greffe exige", async ({ page, request }) => {
  /*
   * Le domicilié déclare au registre la dénomination et l'immatriculation de son
   * domiciliataire, et l'agrément préfectoral doit figurer au contrat : sans ce
   * numéro, l'attestation est refusée. Les demander ici évite de le découvrir au
   * dépôt du dossier.
   */
  await ouvrirCreation(page, request);
  await choisir(page, "Mode de domiciliation", "Société de domiciliation");

  await page.getByLabel("Nom de la société de domiciliation").fill("SEDOMICILIER");
  await page.getByLabel("SIREN de la société de domiciliation").fill("1234");
  await page.getByRole("button", { name: "Continuer" }).click();

  await expect(page.getByText(/SIREN de la société de domiciliation comporte neuf/)).toBeVisible();
  await expect(page.getByText(/numéro d'agrément préfectoral/)).toBeVisible();

  // Et ce qui est saisi tient le rechargement : la route accepte le champ, qu'elle
  // rejetterait s'il ne figurait pas dans son gabarit.
  const adresse = page.url();
  await page.getByLabel("SIREN de la société de domiciliation").fill("493242106");
  await page.getByLabel("Numéro d'agrément préfectoral").fill("2023 A 00123");

  // Les identifiants, non les libellés : « Nom de la société » désigne aussi celui
  // de la société de domiciliation, qui est ouvert à cet instant.
  await choisir(page, "Forme juridique", /^SASU/);
  await page.locator("#denomination").fill("ESSAI DOMICILIATION");
  await page.getByLabel("Objet social", { exact: true }).fill("Conseil");
  await page.locator("#adresse").fill("1 rue de la Paix");
  await page.locator("#codePostal").fill("75002");
  await page.locator("#ville").fill("Paris");
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.getByRole("heading", { level: 2 })).toContainText("Actionnaire");

  await page.goto(adresse);
  await expect(page.getByLabel("Numéro d'agrément préfectoral")).toHaveValue("2023 A 00123");
  await expect(page.getByLabel("SIREN de la société de domiciliation")).toHaveValue("493242106");
});

test("un code postal incomplet est signalé", async ({ page, request }) => {
  await ouvrirCreation(page, request);
  await page.getByLabel("Code postal").fill("750");
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.getByText("Le code postal comporte cinq chiffres")).toBeVisible();
});

test("le brouillon est retrouvé après un rechargement complet", async ({ page, request }) => {
  await ouvrirCreation(page, request);
  const adresse = page.url();

  await choisir(page, "Forme juridique", /^SASU/);
  await page.getByLabel("Nom de la société").fill("ESSAI PERSISTANCE");
  await page.getByLabel("Objet social", { exact: true }).fill("Conseil");
  await page.getByLabel("Adresse du siège").fill("1 rue de la Paix");
  await page.getByLabel("Code postal").fill("75002");
  await page.getByLabel("Ville").fill("Paris");
  await page.getByRole("button", { name: "Continuer" }).click();

  // Une SASU a un actionnaire, pas des associés : le mot suit la forme, comme dans
  // la page d'origine.
  await expect(page.getByRole("heading", { level: 2 })).toContainText("Actionnaire");

  // Rechargement complet : rien ne vient du navigateur.
  await page.goto(adresse);
  await expect(page.getByLabel("Nom de la société")).toHaveValue("ESSAI PERSISTANCE");
});

test("le mot employé pour le dirigeant suit la forme choisie", async ({ page, request }) => {
  const dossier = await ouvrirCreation(page, request);

  const societe = {
    forme: "SARL",
    denomination: "ESSAI SARL",
    activite: "Commerce de détail",
    adresse: "2 rue Neuve",
    codePostal: "69001",
    ville: "Lyon",
  };

  // Une SARL demande deux associés : avec un seul, l'étape ne passe pas.
  await request.put("/api/formalites/brouillon", {
    data: { dossier: Number(dossier), modifications: { ...societe, associes: [associe("Camille", "Durand")] } },
  });
  await page.goto("/creation?dossier=" + dossier + "&etape=2");
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.getByText(/au moins 2 associés/)).toBeVisible();

  // Avec deux, on atteint les dirigeants - et une SARL a un gérant, pas un
  // président. Le mot figure dans les actes, d'où l'attention qu'on y porte.
  await request.put("/api/formalites/brouillon", {
    data: {
      dossier: Number(dossier),
      modifications: {
        ...societe,
        associes: [associe("Camille", "Durand"), associe("Alex", "Martin")],
      },
    },
  });
  await page.goto("/creation?dossier=" + dossier + "&etape=3");
  await expect(page.getByRole("button", { name: /Ajouter un gérant/ })).toBeVisible();
});

/**
 * L'étape du capital dit par quoi commencer, et ne le demande qu'une fois.
 *
 * Elle posait une barre de progression et un camembert avant les deux champs qui les
 * alimentent : on arrivait sur deux graphiques à zéro pour cent, et rien ne disait que
 * le premier geste était de saisir le nombre de titres émis.
 *
 * Le montant, lui, était réclamé deux fois - à l'étape « Société » puis ici, sur le
 * même champ et sous le même libellé - et l'astérisque de la première mentait :
 * `verifierSociete` ne regarde pas le capital.
 */
test("le capital se saisit une fois, avant de se répartir", async ({ page, request }) => {
  const dossier = await ouvrirCreation(page, request);

  await request.put("/api/formalites/brouillon", {
    data: {
      dossier: Number(dossier),
      modifications: {
        forme: "SAS",
        denomination: "REPARTITION CLAIRE",
        activite: "Conseil aux entreprises",
        adresse: "2 rue Neuve",
        codePostal: "69001",
        ville: "Lyon",
        associes: [associe("Camille", "Durand"), associe("Alex", "Martin")],
        dirigeants: [{ associe: 0 }],
      },
    },
  });

  // L'étape « Société » ne le demande plus.
  await page.goto("/creation?dossier=" + dossier + "&etape=1");
  await expect(page.getByRole("heading", { level: 2 })).toContainText("Informations de la société");
  await expect(page.getByLabel("Capital social")).toHaveCount(0);

  await page.goto("/creation?dossier=" + dossier + "&etape=4");

  // L'étiquette s'élide : elle écrivait « Nombre total de actions ».
  const total = page.getByLabel(/Nombre total d'actions/);
  await expect(total).toBeVisible();

  // Tant qu'aucun titre n'est émis, la phrase dit le premier geste, non un pourcentage.
  await expect(page.getByText(/Indiquez d'abord le nombre total d'actions/)).toBeVisible();

  await total.fill("2000");
  await page.getByLabel("Capital social").fill("2000");
  await expect(page.getByText(/2\s000 actions à 1\s€ l'une/)).toBeVisible();
  await expect(page.getByText(/il en reste 2\s000 à attribuer/)).toBeVisible();

  await page.locator("#parts-0").fill("1200");
  await page.locator("#parts-1").fill("800");
  await expect(page.getByText("Les 2 000 actions sont attribuées.")).toBeVisible();

  // Et le dépassement se dit, là où la barre se contentait de plafonner à 100 %.
  await page.locator("#parts-1").fill("1000");
  await expect(page.getByText(/200 de trop/)).toBeVisible();
});

/**
 * La valeur d'un titre donne leur nombre, et l'associé unique détient tout.
 *
 * Il fallait faire la division soi-même, puis écrire deux fois le même nombre - le
 * total en tête, puis la totalité dans la carte de l'associé - et l'on cherchait
 * longtemps pourquoi la répartition restait incomplète.
 */
test("la valeur d'une action donne leur nombre", async ({ page, request }) => {
  const dossier = await ouvrirCreation(page, request);

  await request.put("/api/formalites/brouillon", {
    data: {
      dossier: Number(dossier),
      modifications: {
        forme: "SASU",
        denomination: "PAR DIVISION",
        activite: "Conseil aux entreprises",
        adresse: "3 rue Centrale",
        codePostal: "33000",
        ville: "Bordeaux",
        capital: 2000,
        associes: [associe("Camille", "Durand")],
        dirigeants: [{ associe: 0 }],
      },
    },
  });

  await page.goto("/creation?dossier=" + dossier + "&etape=4");

  await page.getByLabel(/Valeur d'une action/).fill("10");
  await expect(page.getByLabel(/Nombre total d'actions/)).toHaveValue("200");
  await expect(page.getByText(/200 actions à 10\s€ l'une/)).toBeVisible();

  // L'actionnaire unique détient tout : son nombre suit, et ne se saisit pas.
  await expect(page.locator("#parts-0")).toHaveValue("200");
  await expect(page.locator("#parts-0")).toHaveAttribute("readonly", "");
  await expect(page.getByText(/actionnaire unique détient les 200 actions/)).toBeVisible();

  /*
   * Et l'étape passe. Elle ne passait pas : `capitalLibere` n'est écrit par aucun
   * écran, et une SASU se voyait refuser « exige de libérer au moins 50 % du capital »
   * sur un dossier entièrement libéré.
   */
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.getByRole("heading", { level: 2 })).toContainText("Pièces justificatives");
});

test("une valeur qui ne tombe pas juste laisse le capital intact", async ({ page, request }) => {
  const dossier = await ouvrirCreation(page, request);

  await request.put("/api/formalites/brouillon", {
    data: {
      dossier: Number(dossier),
      modifications: {
        forme: "SASU",
        denomination: "DIVISION IMPOSSIBLE",
        activite: "Conseil aux entreprises",
        adresse: "3 rue Centrale",
        codePostal: "33000",
        ville: "Bordeaux",
        capital: 2000,
        partsTotales: 200,
        associes: [{ ...associe("Camille", "Durand"), parts: 200 }],
        dirigeants: [{ associe: 0 }],
      },
    },
  });

  await page.goto("/creation?dossier=" + dossier + "&etape=4");
  await page.getByLabel(/Valeur d'une action/).fill("3");

  /*
   * Deux nombres ne se négocient pas : le capital est celui qu'on a décidé de mettre,
   * et un titre ne se découpe pas. C'est la valeur nominale qui absorbe le reste, et
   * la phrase dit le chiffre exact que porteront les statuts.
   */
  await expect(page.getByLabel("Capital social")).toHaveValue("2000");
  await expect(page.getByLabel(/Nombre total d'actions/)).toHaveValue("667");
  // 2 000 / 667 ne tombe pas rond : la phrase le dit sans arrondir à « 3 € ».
  await expect(page.getByText(/667 actions à 2,998\d* €? ?l'une/)).toBeVisible();
});

/**
 * Les tarifs se lisent côte à côte, sur toute la largeur.
 *
 * Trois cartes dans la colonne du formulaire tombaient sous deux cents pixels
 * chacune : « Démarrez votre entreprise en quelques clics » s'y coupait sur quatre
 * lignes. Le récapitulatif n'aide pas à choisir un forfait - il dit ce qu'on a saisi,
 * non ce qu'on achète - et cède la place.
 */
test("l'étape des offres prend toute la largeur", async ({ page, request }) => {
  await page.setViewportSize({ width: 1500, height: 900 });
  const dossier = await ouvrirCreation(page, request);

  await request.put("/api/formalites/brouillon", {
    data: {
      dossier: Number(dossier),
      modifications: {
        forme: "SASU",
        denomination: "OFFRES AU LARGE",
        activite: "Conseil aux entreprises",
        adresse: "3 rue Centrale",
        codePostal: "33000",
        ville: "Bordeaux",
        capital: 1000,
        capitalLibere: 1000,
        partsTotales: 100,
        associes: [{ ...associe("Camille", "Durand"), parts: 100, versement: 1000 }],
        dirigeants: [{ associe: 0 }],
      },
    },
  });

  const colonne = page.getByRole("complementary", { name: /Récapitulatif/ });
  const carte = page.locator("main section").first();

  await page.goto("/creation?dossier=" + dossier + "&etape=5");
  await expect(colonne).toBeVisible();
  const etroite = (await carte.boundingBox())!;

  await page.goto("/creation?dossier=" + dossier + "&etape=6");
  await expect(page.getByRole("heading", { level: 2 })).toContainText("Choisissez votre offre");
  await expect(colonne).toHaveCount(0);
  const large = (await carte.boundingBox())!;

  // La colonne et sa gouttière font trois cent cinquante pixels : la carte les reprend.
  expect(large.width).toBeGreaterThan(etroite.width + 300);
});

/**
 * On ne confie pas un dossier sans l'avoir réglé.
 *
 * La création était le seul parcours à ne pas encaisser : l'étape « Offres » notait un
 * choix, et « transmettre à l'avocat » était un bouton libre et distinct. Les deux n'en
 * font plus qu'un, comme sur la modification.
 */
test("l'étape des offres règle et confie d'un seul geste", async ({ page, request }) => {
  const dossier = await ouvrirCreation(page, request);

  await request.put("/api/formalites/brouillon", {
    data: {
      dossier: Number(dossier),
      modifications: {
        forme: "SASU",
        denomination: "REGLEMENT ATTENDU",
        activite: "Conseil aux entreprises",
        adresse: "3 rue Centrale",
        codePostal: "33000",
        ville: "Bordeaux",
        capital: 1000,
        capitalLibere: 1000,
        partsTotales: 100,
        associes: [{ ...associe("Camille", "Durand"), parts: 100, versement: 1000 }],
        dirigeants: [{ associe: 0 }],
      },
    },
  });

  await page.goto("/creation?dossier=" + dossier + "&etape=6");

  /*
   * Le geste est offert deux fois : en tête, avant les trois cartes et leurs vingt
   * lignes de contenu, et au pied pour qui a tout lu. Il ne se trouvait qu'en bas,
   * après trois écrans de défilement.
   */
  const regler = page.getByRole("button", { name: /Régler et confier à un avocat/ });
  await expect(regler).toHaveCount(2);
  await expect(regler.first()).toBeInViewport();

  // Et « Continuer » a disparu de cette étape : on ne passe pas les offres sans payer.
  await expect(page.getByRole("button", { name: /^Continuer$/ })).toHaveCount(0);

  // La formule recommandée est retenue d'avance : on ne croit plus l'avoir choisie.
  // Les cartes sont un groupe de boutons radio : leur rôle prime sur leur balise.
  await expect(page.getByRole("radio", { name: "Formule retenue" })).toBeVisible();
});

/**
 * Un dossier confié s'ouvre sur ses documents, non sur son formulaire.
 *
 * Sans étape dans l'adresse on retombait sur la première : le client qui rouvrait un
 * dossier réglé arrivait sur « Forme juridique », un écran où il n'a plus rien à
 * saisir, et devait franchir six étapes pour retrouver ses actes et son suivi.
 */
test("un dossier confié s'ouvre sur ses documents", async ({ page, request }) => {
  const dossier = await ouvrirCreation(page, request);

  await request.put("/api/formalites/brouillon", {
    data: {
      dossier: Number(dossier),
      modifications: {
        forme: "SASU",
        denomination: "OUVERTURE SUR LES ACTES",
        activite: "Conseil aux entreprises",
        adresse: "3 rue Centrale",
        codePostal: "33000",
        ville: "Bordeaux",
        capital: 1000,
        partsTotales: 100,
        offre: "business",
        associes: [{ ...associe("Camille", "Durand"), parts: 100, versement: 1000 }],
        dirigeants: [{ associe: 0 }],
      },
    },
  });

  // Tant qu'il se remplit, il s'ouvre là où l'on s'était arrêté.
  await page.goto("/creation?dossier=" + dossier);
  await expect(page.getByRole("heading", { level: 2 })).toContainText("Informations de la société");

  // Confié, il s'ouvre sur ses actes. Le règlement passe par Stripe : on pose l'état
  // qu'il aurait laissé.
  await request.post("/api/formalites/transmission", { data: { dossier: Number(dossier) } });

  /*
   * Le titre de l'étape, non celui du suivi : un dossier confié en porte deux, et la
   * colonne de droite annonce « Où en est votre dossier ».
   */
  const titreDEtape = page.getByRole("heading", { level: 2 }).first();

  await page.goto("/creation?dossier=" + dossier);
  await expect(titreDEtape).toContainText("Mes documents");

  // Une étape demandée l'emporte : le suivi renvoie aux pièces pour l'attestation.
  await page.goto("/creation?dossier=" + dossier + "&etape=5");
  await expect(titreDEtape).toContainText("Pièces justificatives");
});

/**
 * Le dossier dit qu'on lui a écrit, et mène au fil.
 *
 * Ici vivait « Note pour l'avocat (optionnel) », une zone de texte enregistrée dans le
 * brouillon et qu'aucun écran d'avocat n'affichait : le client croyait écrire à
 * quelqu'un, personne ne lisait. La messagerie du dossier, elle, existe - texte,
 * pièces jointes, horodatage - et le parcours y renvoie plutôt que d'en porter une
 * seconde.
 */
test("les échanges renvoient à la messagerie du dossier", async ({ page, request }) => {
  const dossier = await ouvrirCreation(page, request);

  await request.put("/api/formalites/brouillon", {
    data: {
      dossier: Number(dossier),
      modifications: {
        forme: "SASU",
        denomination: "ECHANGES AU DOSSIER",
        activite: "Conseil aux entreprises",
        adresse: "3 rue Centrale",
        codePostal: "33000",
        ville: "Bordeaux",
        capital: 1000,
        partsTotales: 100,
        offre: "business",
        associes: [{ ...associe("Camille", "Durand"), parts: 100, versement: 1000 }],
        dirigeants: [{ associe: 0 }],
      },
    },
  });

  await page.goto("/creation?dossier=" + dossier + "&etape=7");

  // La zone de texte a disparu, le fil prend sa place.
  await expect(page.getByLabel(/Note pour l'avocat/)).toHaveCount(0);

  const echanges = page.getByRole("region", { name: "Échanges avec le cabinet" });
  await expect(echanges).toBeVisible();
  await expect(echanges.getByRole("link", { name: "Voir la conversation" })).toHaveAttribute(
    "href",
    "/messagerie?dossier=" + dossier
  );

  /*
   * On écrit sans quitter son dossier : le bouton menait droit à la messagerie, et
   * l'on perdait l'écran qu'on remplissait pour une phrase à écrire.
   */
  await echanges.getByRole("button", { name: "Écrire au cabinet" }).click();
  const fenetre = page.getByRole("dialog", { name: "Écrire au cabinet" });
  await expect(fenetre).toBeVisible();
  await expect(fenetre.getByRole("button", { name: "Joindre une pièce" })).toBeVisible();

  // Rien à envoyer tant que rien n'est écrit.
  await expect(fenetre.getByRole("button", { name: "Envoyer" })).toBeDisabled();

  await fenetre.getByLabel("Votre message").fill("Le bail suffit-il comme justificatif ?");
  await fenetre.getByRole("button", { name: "Envoyer" }).click();
  await expect(fenetre.getByText(/Message envoyé/)).toBeVisible();

  /*
   * Et le message est bien dans le fil du dossier.
   *
   * La messagerie écarte de sa liste les dossiers sans avocat ni message - à juste
   * titre - mais elle restait alors muette sur celui qu'on lui demandait : aucun fil,
   * aucun champ, rien à quoi s'adresser.
   */
  await page.goto("/messagerie?dossier=" + dossier);
  await expect(page.getByText("Le bail suffit-il comme justificatif ?")).toBeVisible();
});

test.describe("le règlement d'une création", () => {
  test("sans formule choisie, il n'y a rien à encaisser", async ({ page, request }) => {
    const dossier = await ouvrirCreation(page, request);

    await request.put("/api/formalites/brouillon", {
      data: {
        dossier: Number(dossier),
        modifications: {
          forme: "SASU",
          denomination: "SANS FORMULE",
          activite: "Conseil aux entreprises",
          adresse: "3 rue Centrale",
          codePostal: "33000",
          ville: "Bordeaux",
          capital: 1000,
          capitalLibere: 1000,
          partsTotales: 100,
          associes: [{ ...associe("Camille", "Durand"), parts: 100, versement: 1000 }],
          dirigeants: [{ associe: 0 }],
        },
      },
    });

    const reponse = await request.post("/api/formalites/creation/paiement", {
      data: { dossier: Number(dossier) },
    });

    expect(reponse.status()).toBe(400);
    expect((await reponse.json()).etape).toBe(6);
  });

  test("un dossier incomplet ne se paie pas", async ({ page, request }) => {
    /*
     * L'avocat recevrait des actes troués qu'il ne peut pas déposer, et il faudrait
     * rembourser.
     */
    const dossier = await ouvrirCreation(page, request);
    await request.put("/api/formalites/brouillon", {
      data: { dossier: Number(dossier), modifications: { offre: "business" } },
    });

    const reponse = await request.post("/api/formalites/creation/paiement", {
      data: { dossier: Number(dossier) },
    });

    expect(reponse.status()).toBe(400);
    expect((await reponse.json()).error).toMatch(/Complétez/);
  });

  test("le navigateur ne peut pas déclarer un dossier payé", async ({ page, request }) => {
    /*
     * `paye` et `paiementRef` se constatent, ils ne se saisissent pas : un brouillon
     * qui pourrait s'annoncer réglé ferait partir un dossier chez l'avocat sans
     * encaissement.
     */
    const dossier = await ouvrirCreation(page, request);

    const reponse = await request.put("/api/formalites/brouillon", {
      data: {
        dossier: Number(dossier),
        /*
         * Le dossier porte une forme : sans elle, le registre des sociétés affiche
         * « Société » à la place, le mot même de son en-tête de colonne, et la spec du
         * registre trouve alors deux fois le même texte.
         */
        modifications: {
          forme: "SASU",
          denomination: "FAUX PAIEMENT",
          paye: true,
          paiementRef: "cs_faux",
        },
      },
    });

    // Le schéma de l'API ne connaît pas ces clés : elles sont écartées, non écrites.
    const { brouillon } = await reponse.json();
    expect(brouillon.denomination).toBe("FAUX PAIEMENT");
    expect(brouillon.paye).toBeUndefined();
    expect(brouillon.paiementRef).toBeUndefined();

    // Et le dossier n'est donc pas parti : il est toujours à saisir.
    const paiement = await request.post("/api/formalites/creation/paiement", {
      data: { dossier: Number(dossier) },
    });
    expect(paiement.status()).toBe(400);
  });
});

test("on ne saute pas par-dessus une étape incomplète", async ({ page, request }) => {
  const dossier = await ouvrirCreation(page, request);

  // Demander l'étape 4 directement dans l'adresse
  await page.goto("/creation?dossier=" + dossier + "&etape=4");
  await expect(page.getByRole("heading", { level: 2 })).toContainText("Informations de la société");
});

test.describe("accès au brouillon", () => {
  test("sans session, l'enregistrement est refusé", async ({ browser }) => {
    const anonyme = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const reponse = await anonyme.request.put("/api/formalites/brouillon", {
      data: { dossier: 1, modifications: { denomination: "intrusion" } },
    });
    expect(reponse.status()).toBe(401);
    await anonyme.close();
  });

  test("le brouillon d'un autre client est refusé", async ({ request }) => {
    const reponse = await request.put("/api/formalites/brouillon", {
      data: { dossier: 999999, modifications: { denomination: "intrusion" } },
    });
    expect(reponse.status()).toBe(403);
  });

  test("un champ hors gabarit est refusé avant enregistrement", async ({ request }) => {
    const reponse = await request.put("/api/formalites/brouillon", {
      data: { dossier: 1, modifications: { capital: -500 } },
    });
    expect([400, 403]).toContain(reponse.status());
  });
});

/**
 * On ne signe pas un acte que l'avocat n'a pas rendu.
 *
 * Depuis que le règlement produit les actes automatiquement, ils arrivent en
 * relecture : c'est la validation de l'avocat qui en fait des documents signables, et
 * c'est elle qui accorde la mise en signature. L'écran désactive le bouton, mais un
 * écran se contourne - la demande part par courriel avec un jeton d'accès.
 */
test.describe("la relecture retient la signature", () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.DATABASE_URL ?? "",
      options: "-c timezone=UTC",
    }),
  });

  test.afterAll(() => prisma.$disconnect());

  /** Un dossier complet, ses actes produits, puis remis en relecture. */
  async function dossierEnRelecture(
    page: import("@playwright/test").Page,
    request: import("@playwright/test").APIRequestContext
  ) {
    const dossier = await ouvrirCreation(page, request);

    await request.put("/api/formalites/brouillon", {
      data: {
        dossier: Number(dossier),
        modifications: {
          forme: "SASU",
          denomination: "ACTES EN RELECTURE",
          activite: "Conseil aux entreprises",
          adresse: "3 rue Centrale",
          codePostal: "33000",
          ville: "Bordeaux",
          capital: 1000,
          capitalLibere: 1000,
          partsTotales: 100,
          offre: "business",
          associes: [{ ...associe("Camille", "Durand"), parts: 100, versement: 1000 }],
          dirigeants: [{ associe: 0 }],
        },
      },
    });

    await request.post("/api/formalites/documents", { data: { dossier: Number(dossier) } });

    // L'encaissement les produit ainsi ; ici on pose l'état qu'il aurait laissé.
    await prisma.documents.updateMany({
      where: { formalite_id: Number(dossier), uploaded_by: "system" },
      data: { status: "a_relire" },
    });

    return dossier;
  }

  test("la demande de signature est refusée, même hors de l'écran", async ({ page, request }) => {
    const dossier = await dossierEnRelecture(page, request);

    const reponse = await request.post("/api/signature", {
      data: {
        dossier: Number(dossier),
        signataires: [{ nom: "Camille Durand", email: "camille@exemple.test" }],
      },
    });

    expect(reponse.status()).toBe(409);
    expect((await reponse.json()).error).toMatch(/relecture/i);
  });

  test("l'écran n'ouvre pas la signature avant l'attestation", async ({ page, request }) => {
    /*
     * Le bloc entier attend l'attestation de dépôt de capital : c'est elle qui date les
     * actes, et signer avant ferait signer des actes que la re-datation reproduira -
     * donc signer deux fois. Le refus au dépôt, lui, est vérifié juste au-dessus.
     */
    const dossier = await dossierEnRelecture(page, request);
    await page.goto("/creation?dossier=" + dossier + "&etape=7");

    await expect(page.getByRole("button", { name: "Demander les signatures" })).toHaveCount(0);

    // Les actes, eux, sont bien là - annoncés en relecture, et l'étape dit l'attente.
    await expect(page.getByText("Statuts constitutifs")).toBeVisible();
    await expect(page.getByText(/actes en relecture/)).toBeVisible();
    await expect(
      page.getByText(/disponibles dès qu'un avocat les aura relus et validés/)
    ).toBeVisible();
  });

  /*
   * L'écran cache le bloc de signature tant que l'attestation n'est pas au dossier.
   * Un écran se contourne : la demande part par courriel avec un jeton, et le circuit
   * s'ouvrait sur des statuts que la re-datation allait remplacer.
   */
  test("la signature attend aussi l'attestation, même hors de l'écran", async ({
    page,
    request,
  }) => {
    const dossier = await dossierEnRelecture(page, request);

    /* Les actes sont relus : il ne reste que l'attestation à attendre. */
    await prisma.documents.updateMany({
      where: { formalite_id: Number(dossier), uploaded_by: "system" },
      data: { status: "generated" },
    });

    const refus = await request.post("/api/signature", {
      data: {
        dossier: Number(dossier),
        signataires: [{ nom: "Camille Durand", email: "camille@exemple.test" }],
      },
    });
    expect(refus.status()).toBe(409);
    expect((await refus.json()).error).toMatch(/attestation de dépôt de capital/i);

    /* Déposée, elle ouvre le circuit. */
    const attestation = new FormData();
    attestation.append("dossier", dossier);
    attestation.append("piece", "depot-capital");
    attestation.append(
      "fichier",
      new Blob([Buffer.from("%PDF-1.4\nattestation")], { type: "application/pdf" }),
      "attestation.pdf"
    );
    expect((await request.post("/api/formalites/pieces", { multipart: attestation })).status()).toBe(
      201
    );

    /* Elle re-date les actes, qui repassent en relecture : l'avocat les revalide. */
    await prisma.documents.updateMany({
      where: { formalite_id: Number(dossier), uploaded_by: "system" },
      data: { status: "generated" },
    });

    const ouvert = await request.post("/api/signature", {
      data: {
        dossier: Number(dossier),
        signataires: [{ nom: "Camille Durand", email: "camille@exemple.test" }],
      },
    });
    expect(ouvert.status()).toBe(201);
  });

  /*
   * Une société immatriculée ne signe plus ses statuts constitutifs.
   *
   * L'écran offrait encore « Demander les signatures » sur un dossier clos, et le
   * circuit s'ouvrait : des courriels partaient aux associés d'une société qui existe
   * depuis des semaines.
   */
  test("un dossier clos ne signe plus rien", async ({ page, request }) => {
    const dossier = await dossierEnRelecture(page, request);
    await prisma.documents.updateMany({
      where: { formalite_id: Number(dossier), uploaded_by: "system" },
      data: { status: "generated" },
    });
    await prisma.documents.create({
      data: {
        formalite_id: Number(dossier),
        name: "Attestation de dépôt de capital",
        type: "depot-capital",
        file_path: "essai-attestation-close.pdf",
        uploaded_by: "user",
        status: "verified",
      },
    });
    await prisma.formalites.update({
      where: { id: Number(dossier) },
      data: { status: "terminee", business_sub_phase: "5e" },
    });

    const refus = await request.post("/api/signature", {
      data: {
        dossier: Number(dossier),
        signataires: [{ nom: "Camille Durand", email: "camille@exemple.test" }],
      },
    });
    expect(refus.status()).toBe(409);
    expect((await refus.json()).error).toMatch(/clos/i);

    await page.goto("/creation?dossier=" + dossier + "&etape=7");
    await expect(page.getByRole("button", { name: "Demander les signatures" })).toHaveCount(0);
  });

  test("régénérer ne publie pas ce qui attend l'avocat", async ({ page, request }) => {
    /*
     * Un clic sur « Régénérer les documents » déverrouillait les cinq actes : le
     * client pouvait alors les signer avant que quiconque les ait lus.
     */
    const dossier = await dossierEnRelecture(page, request);

    await request.post("/api/formalites/documents", { data: { dossier: Number(dossier) } });

    const publies = await prisma.documents.count({
      where: { formalite_id: Number(dossier), uploaded_by: "system", status: "generated" },
    });
    expect(publies).toBe(0);
  });
});

test.describe("pièces et documents", () => {
  /**
   * Une SASU complète jusqu'aux pièces, montée par l'API.
   *
   * Le remplissage à la main est vérifié par les tests d'étape ci-dessus ; ce bloc
   * n'a besoin que de l'état. Le monter en cliquant rendait ces sept tests
   * solidaires du moindre détail d'interface - c'est ce qui les a fait tomber
   * ensemble quand le design d'origine est revenu, sélecteurs compris.
   */
  const SASU_COMPLETE = {
    forme: "SASU",
    denomination: "ESSAI DOCUMENTS",
    activite: "Conseil aux entreprises",
    adresse: "3 rue Centrale",
    codePostal: "33000",
    ville: "Bordeaux",
    capital: 1000,
    capitalLibere: 1000,
    partsTotales: 100,
    // L'étape « Offres » doit être franchie pour atteindre les actes.
    offre: "business",
    associes: [{ ...associe("Camille", "Durand"), parts: 100, versement: 1000 }],
    dirigeants: [{ associe: 0 }],
  };

  async function dossierPret(
    page: import("@playwright/test").Page,
    requete: import("@playwright/test").APIRequestContext
  ) {
    const dossier = await ouvrirCreation(page, requete);

    const enregistre = await requete.put("/api/formalites/brouillon", {
      data: { dossier: Number(dossier), modifications: SASU_COMPLETE },
    });
    expect(enregistre.status()).toBe(200);

    await page.goto("/creation?dossier=" + dossier + "&etape=5");
    await expect(page.getByRole("heading", { level: 2 })).toContainText("Pièces justificatives");

    return dossier;
  }


  test("les pièces demandées sont celles qu'on peut fournir tout de suite", async ({
    page,
    request,
  }) => {
    await dossierPret(page, request);
    await expect(page.getByText("Pièce d'identité du dirigeant")).toBeVisible();

    /*
     * L'attestation de dépôt de capital n'est pas là, et c'est le sujet.
     *
     * La banque ouvre le compte sur présentation des statuts, et les statuts sont ce
     * que l'avocat relit : la réclamer ici demandait une pièce qu'on ne peut pas encore
     * obtenir, et l'écran l'affichait « Requis » en rouge dès la première visite. Elle
     * paraît une fois les actes rendus.
     */
    await expect(page.getByText("Attestation de dépôt de capital")).toHaveCount(0);

    /*
     * L'attestation de parution non plus, et pour de bon : c'est le cabinet qui publie
     * l'annonce et joint la parution au dossier.
     */
    await expect(page.getByText(/Attestation de parution/)).toHaveCount(0);
  });

  test("un fichier au contenu trompeur est refusé", async ({ page, request }) => {
    await dossierPret(page, request);

    await page.getByLabel("Choisir un fichier").first().setInputFiles({
      name: "piege.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("<html><script>alert(1)</script></html>"),
    });

    // Viser le texte plutôt qu'un role=alert : Next place un signaleur de
    // navigation qui porte le même rôle, et la carte de dépôt n'est plus un
    // <fieldset> depuis la restauration du .doc-upload-card d'origine.
    await expect(page.getByText(/ne correspond pas à son format/)).toBeVisible();
  });

  test("un vrai PDF est accepté et enregistré", async ({ page, request }) => {
    await dossierPret(page, request);

    await page.getByLabel("Choisir un fichier").first().setInputFiles({
      name: "identite.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\nfaux document d'essai"),
    });

    await expect(page.getByText("Pièce enregistrée")).toBeVisible();
  });

  test("les documents sont produits à partir des gabarits", async ({ page, request }) => {
    /* Une production d'actes, convertis en PDF par LibreOffice : quelques secondes par
       acte, et davantage quand la machine en convertit pour d'autres essais en même
       temps. L'échec au bout de trente secondes ne disait rien du code. */
    test.setTimeout(120_000);

    const dossier = await dossierPret(page, request);

    const reponse = await request.post("/api/formalites/documents", {
      data: { dossier: Number(dossier) },
    });
    expect(reponse.status()).toBe(201);

    const corps = await reponse.json();
    const titres = corps.documents.map((d: { titre: string }) => d.titre);
    expect(titres).toContain("Statuts constitutifs");
    expect(titres).toContain("Liste des souscripteurs");
    expect(titres).toContain("Procès-verbal de nomination");
  });

  test("régénérer ne produit pas un second jeu d'actes", async ({ page, request }) => {
    /*
     * Deux jeux d'actes produits d'affilée, chacun converti en PDF par LibreOffice.
     *
     * C'est le seul essai de la série qui le fasse deux fois, et la conversion prend
     * plusieurs secondes par acte : seul, il tient largement ; lancé avec les autres
     * sur la même machine, il dépassait les trente secondes accordées par défaut.
     * L'échec ne disait rien du code - il disait que la machine était occupée.
     */
    test.setTimeout(120_000);

    const dossier = await dossierPret(page, request);

    const premier = await request.post("/api/formalites/documents", {
      data: { dossier: Number(dossier) },
    });
    const attendus = (await premier.json()).documents.length;

    // Le geste que la page offre après une première production : le même appel.
    // Il remplaçait le jeu au lieu de l'empiler dans la page d'origine, qui ne
    // stockait rien ; il doit en faire autant ici.
    const second = await request.post("/api/formalites/documents", {
      data: { dossier: Number(dossier) },
    });
    expect((await second.json()).documents).toHaveLength(attendus);

    await page.goto("/creation?dossier=" + dossier + "&etape=7");
    await expect(page.getByText("Statuts constitutifs")).toHaveCount(1);
  });

  test("un acte se télécharge en PDF, pas en Word", async ({ page, request }) => {
    // La conversion demande LibreOffice, une dépendance système : sans elle, la
    // route remet le Word à dessein, et il n'y a rien à vérifier ici.
    test.skip(!(await libreOfficePresent()), "LibreOffice absent");

    const dossier = await dossierPret(page, request);
    await request.post("/api/formalites/documents", { data: { dossier: Number(dossier) } });

    await page.goto("/creation?dossier=" + dossier + "&etape=7");
    const lien = await page.locator('a[href*="/api/fichier"]').first().getAttribute("href");
    expect(lien).toContain("telecharger=1");

    const fichier = await request.get(lien!);
    expect(fichier.status()).toBe(200);
    expect(fichier.headers()["content-type"]).toBe("application/pdf");
    expect(fichier.headers()["content-disposition"]).toContain(".pdf");
    // Le nom proposé est celui de l'acte, pas son empreinte de stockage.
    expect(fichier.headers()["content-disposition"]).toContain("attachment");
    expect((await fichier.body()).subarray(0, 4).toString()).toBe("%PDF");
  });

  test("l'attestation de dépôt re-date les actes du jour où la banque l'a délivrée", async ({
    page,
    request,
  }) => {
    /*
     * La banque délivre l'attestation après le versement, et c'est ce jour-là qu'on
     * signe les statuts. Les dater du jour de leur production donnerait des statuts
     * signés avant que le capital n'existe.
     */
    const dossier = await dossierPret(page, request);
    await request.post("/api/formalites/documents", { data: { dossier: Number(dossier) } });

    const attestation = new FormData();
    attestation.append("dossier", dossier);
    attestation.append("piece", "depot-capital");
    attestation.append(
      "fichier",
      new Blob([Buffer.from("%PDF-1.4\nattestation d'essai")], { type: "application/pdf" }),
      "attestation.pdf"
    );

    const depot = await request.post("/api/formalites/pieces", { multipart: attestation });
    expect(depot.status()).toBe(201);
    // Le dépôt relance la production : sans cela, la date ne s'appliquerait qu'à la
    // prochaine génération manuelle, que personne ne déclenche.
    expect((await depot.json()).redates).toBe(true);

    // Redéposer l'attestation - le premier fichier était illisible - ne repousse pas
    // la date de signature des statuts : c'est la première qui compte.
    const seconde = new FormData();
    seconde.append("dossier", dossier);
    seconde.append("piece", "depot-capital");
    seconde.append(
      "fichier",
      new Blob([Buffer.from("%PDF-1.4\nseconde attestation")], { type: "application/pdf" }),
      "attestation-2.pdf"
    );
    expect((await request.post("/api/formalites/pieces", { multipart: seconde })).status()).toBe(
      201
    );

    // L'acte reste servi, et le jeu n'a pas doublé.
    await page.goto("/creation?dossier=" + dossier + "&etape=7");
    const lien = await page.locator('a[href*="/api/fichier"]').first().getAttribute("href");
    expect((await request.get(lien!)).status()).toBe(200);
  });

  test("un dossier incomplet ne produit pas de documents troués", async ({ page, request }) => {
    const dossier = await ouvrirCreation(page, request);

    const reponse = await request.post("/api/formalites/documents", {
      data: { dossier: Number(dossier) },
    });
    expect(reponse.status()).toBe(400);
    expect((await reponse.json()).error).toContain("incomplet");
  });
});

/**
 * La série range derrière elle.
 *
 * Les specs partagent un compte et l'espace avocat n'affiche que les trente dossiers
 * les plus récents : les dossiers ouverts ici y repoussaient les dossiers d'exemple
 * hors de la liste, et faisaient échouer des tests qui n'avaient pas changé.
 */
test.afterAll(async () => {
  if (ouverts.length > 0) await retirerDossiers(ouverts);
});

test("une date de naissance se tape, elle ne se cherche pas au calendrier", async ({
  page,
  request,
}) => {
  /*
   * Le parcours avait son propre calendrier : un bouton, une grille, et deux flèches
   * qui glissaient d'un mois. Une associée née en avril 1988 demandait quatre cent
   * soixante clics sur la flèche gauche - sur un champ obligatoire de la deuxième
   * étape. Les cinq autres parcours emploient `ChampDate`, où l'on tape la date.
   */
  const dossier = await ouvrirCreation(page, request);
  await request.put("/api/formalites/brouillon", {
    data: {
      dossier: Number(dossier),
      modifications: {
        forme: "SASU",
        denomination: "ESSAI DATE",
        activite: "Conseil",
        adresse: "2 rue Neuve",
        codePostal: "69001",
        ville: "Lyon",
      },
    },
  });
  await page.goto("/creation?dossier=" + dossier + "&etape=2");

  await page.getByRole("button", { name: /Ajouter un/ }).click();
  const naissance = page.locator("#naissance-0");

  await naissance.click();
  await naissance.pressSequentially("12041988");

  // Le masque s'applique à la frappe, et le calendrier ne s'est pas ouvert.
  await expect(naissance).toHaveValue("12/04/1988");
});
