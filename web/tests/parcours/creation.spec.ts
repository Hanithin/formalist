import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import { rm } from "node:fs/promises";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/infrastructure/db/generated/client";

/** Le dépôt des fichiers, tel que le voit le serveur lancé depuis web/. */
const DEPOT = path.join(process.cwd(), "..", "uploads");

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
 * Retire des dossiers d'essai, leurs actes et les fichiers produits.
 *
 * En base directement, comme preparer.ts : il n'existe pas de point d'entrée pour
 * supprimer un dossier, et il n'en faut pas un pour les besoins des tests.
 */
async function retirerDossiers(ids: number[]) {
  const client = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });

  try {
    const actes = await client.documents.findMany({
      where: { formalite_id: { in: ids } },
      select: { file_path: true, source_path: true },
    });

    for (const acte of actes) {
      for (const chemin of [acte.file_path, acte.source_path]) {
        if (chemin) await rm(path.join(DEPOT, path.basename(chemin)), { force: true });
      }
    }

    await client.signature_requests.deleteMany({ where: { formalite_id: { in: ids } } });
    await client.audit_log.deleteMany({ where: { formalite_id: { in: ids } } });
    await client.messages.deleteMany({ where: { formalite_id: { in: ids } } });
    await client.team_notes.deleteMany({ where: { formalite_id: { in: ids } } });
    await client.uploaded_files.deleteMany({ where: { formalite_id: { in: ids } } });
    await client.documents.deleteMany({ where: { formalite_id: { in: ids } } });
    await client.formalites.deleteMany({ where: { id: { in: ids } } });
  } finally {
    await client.$disconnect();
  }
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
