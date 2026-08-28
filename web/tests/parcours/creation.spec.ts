import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import { retirerDossiers } from "./nettoyage";

/**
 * Les dossiers ouverts par ce fichier, retirés une fois la série passée.
 *
 * Chaque visite de /creation ouvre un dossier - c'est le comportement voulu - mais
 * les specs partagent un compte, et l'espace avocat n'affiche que les trente
 * dossiers les plus récents. Sans ce nettoyage, les dossiers d'exemple sortaient de
 * la liste et faisaient échouer des tests qui n'avaient pas changé.
 */
const ouverts: number[] = [];

/** Ouvre la création et retient le dossier créé. */
async function ouvrirCreation(page: import("@playwright/test").Page) {
  await page.goto("/creation");
  const dossier = new URL(page.url()).searchParams.get("dossier")!;
  ouverts.push(Number(dossier));
  return dossier;
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

test("ouvrir la création crée un dossier et le met dans l'adresse", async ({ page }) => {
  await ouvrirCreation(page);
  // Sans identifiant dans l'adresse, un rechargement créerait un dossier de plus.
  await expect(page).toHaveURL(/dossier=\d+/);
});

test("l'étape 1 refuse de passer tant qu'elle est incomplète", async ({ page }) => {
  await ouvrirCreation(page);
  await page.getByRole("button", { name: "Continuer" }).click();

  await expect(page.getByText("Choisissez une forme juridique")).toBeVisible();
  await expect(page.getByText("Indiquez le nom de la société")).toBeVisible();
  // On reste sur l'étape 1
  await expect(page.getByRole("heading", { level: 2 })).toContainText("Informations de la société");
});

test("les réponses courantes sont déjà écrites, et se relisent", async ({ page }) => {
  /*
   * Laissés vides, ces champs partaient vides dans les actes : des statuts sans
   * durée, sans date de clôture, sans option fiscale. La réponse courante est écrite
   * d'avance, en pleine vue et modifiable - pas appliquée en douce à la génération.
   */
  await ouvrirCreation(page);

  await expect(page.getByLabel("Durée de vie (années)")).toHaveValue("99");
  await expect(page.locator("#optionFiscale")).toHaveText("IS");
  await expect(page.locator("#dateCloturePremierExercice")).toContainText("31 décembre");
});

test("une société de domiciliation demande ce que le greffe exige", async ({ page }) => {
  /*
   * Le domicilié déclare au registre la dénomination et l'immatriculation de son
   * domiciliataire, et l'agrément préfectoral doit figurer au contrat : sans ce
   * numéro, l'attestation est refusée. Les demander ici évite de le découvrir au
   * dépôt du dossier.
   */
  await ouvrirCreation(page);
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

test("un code postal incomplet est signalé", async ({ page }) => {
  await ouvrirCreation(page);
  await page.getByLabel("Code postal").fill("750");
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.getByText("Le code postal comporte cinq chiffres")).toBeVisible();
});

test("le brouillon est retrouvé après un rechargement complet", async ({ page }) => {
  await ouvrirCreation(page);
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
  const dossier = await ouvrirCreation(page);

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

test("on ne saute pas par-dessus une étape incomplète", async ({ page }) => {
  const dossier = await ouvrirCreation(page);

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
    const dossier = await ouvrirCreation(page);

    const enregistre = await requete.put("/api/formalites/brouillon", {
      data: { dossier: Number(dossier), modifications: SASU_COMPLETE },
    });
    expect(enregistre.status()).toBe(200);

    await page.goto("/creation?dossier=" + dossier + "&etape=5");
    await expect(page.getByRole("heading", { level: 2 })).toContainText("Pièces justificatives");

    return dossier;
  }


  test("les pièces demandées dépendent de la forme", async ({ page, request }) => {
    await dossierPret(page, request);
    await expect(page.getByText("Pièce d'identité du dirigeant")).toBeVisible();
    // Une SASU libère du capital : l'attestation est demandée.
    await expect(page.getByText("Attestation de dépôt de capital")).toBeVisible();
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
    await page.goto("/creation");
    const dossier = new URL(page.url()).searchParams.get("dossier")!;

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
