import { test, expect } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/infrastructure/db/generated/client";
import { retirerDossiers } from "./nettoyage";

/**
 * Tous les documents d'un dossier, en une archive.
 *
 * Cinq actes, cinq clics, cinq fichiers à retrouver dans le dossier de
 * téléchargements : c'est pourtant le geste du jour où l'on porte le dossier à sa
 * banque, ou qu'on l'envoie à son comptable.
 *
 * Ce qui compte ici, et qu'aucun écran ne garantit : un acte que l'avocat n'a pas
 * encore rendu ne doit pas partir dans l'archive. La règle vit dans `fichierLisible`,
 * qui sert aussi les fichiers un par un - l'archive s'y adosse plutôt que d'en écrire
 * une seconde, qui dériverait.
 */

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "" }),
});

const ouverts: number[] = [];

test.afterAll(async () => {
  if (ouverts.length > 0) await retirerDossiers(ouverts);
});

async function dossierAvecActes(societe: string) {
  const client = await prisma.users.findFirstOrThrow({
    where: { email: "parcours@exemple.test" },
  });
  const avocat = await prisma.users.findFirstOrThrow({
    where: { email: "avocat-parcours@exemple.test" },
  });

  const dossier = await prisma.formalites.create({
    data: {
      user_id: client.id,
      assigned_avocat_id: avocat.id,
      type: "creation",
      forme: "SASU",
      societe,
      status: "en_attente_validation",
      phase: 5,
      business_sub_phase: "5c",
      data_json: JSON.stringify({
        forme: "SASU",
        denomination: societe,
        activite: "Conseil aux entreprises",
        adresse: "3 rue Centrale",
        codePostal: "33000",
        ville: "Bordeaux",
        banque: "Qonto",
        capital: 1000,
        capitalLibere: 1000,
        partsTotales: 100,
        offre: "business",
        revue: { informations: true, par: avocat.id },
        associes: [
          {
            type: "physique",
            parts: 100,
            versement: 1000,
            personne: {
              civilite: "Madame",
              prenom: "Camille",
              nom: "Durand",
              dateDeNaissance: "1990-06-24",
              villeDeNaissance: "Bordeaux",
              nationalite: "Française",
              situationMatrimoniale: "Célibataire",
              adresse: "3 rue Centrale, 33000 Bordeaux",
              email: "camille@exemple.test",
            },
          },
        ],
        dirigeants: [{ associe: 0 }],
      }),
    },
  });
  ouverts.push(dossier.id);
  return dossier.id;
}

/** Les noms des fichiers d'une archive zip, lus dans ses en-têtes locales. */
function fichiersDeLArchive(archive: Buffer): string[] {
  const noms: string[] = [];
  for (let i = 0; i < archive.length - 30; i++) {
    if (archive.readUInt32LE(i) !== 0x04034b50) continue;
    const longueurDuNom = archive.readUInt16LE(i + 26);
    const longueurDesExtras = archive.readUInt16LE(i + 28);
    noms.push(archive.subarray(i + 30, i + 30 + longueurDuNom).toString("utf8"));
    i += 30 + longueurDuNom + longueurDesExtras;
  }
  return noms;
}

test.describe("l'archive des documents", () => {
  /* La session du client : c'est pour lui que la règle de relecture existe. */
  test.use({ storageState: "./tests/parcours/session.json" });

  test("porte les actes rendus, en PDF, et laisse ceux en relecture", async ({
    page,
    request,
    browser,
  }) => {
    const dossier = await dossierAvecActes("ARCHIVE ESSAI " + Date.now());

    /* Produire les actes est un geste du cabinet : il lui faut sa propre session. */
    const cabinet = await browser.newContext({
      storageState: "./tests/parcours/session-avocat.json",
    });
    await cabinet.request.post("/api/formalites/documents", { data: { dossier } });
    await cabinet.close();

    /*
     * Produits, les actes sont en relecture : c'est l'état où le client ne doit rien
     * pouvoir prendre, et où l'archive n'a donc rien à lui donner. Le bouton non plus
     * ne se propose pas.
     */
    expect((await request.get("/api/formalites/archive?dossier=" + dossier)).status()).toBe(404);

    await page.goto("/creation?dossier=" + dossier + "&etape=documents");
    await expect(page.getByRole("heading", { name: "Mes documents" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Tout télécharger" })).toHaveCount(0);

    /* L'avocat les rend : ils deviennent ceux du client. */
    await prisma.documents.updateMany({
      where: { formalite_id: dossier, uploaded_by: "system" },
      data: { status: "generated" },
    });

    const reponse = await request.get("/api/formalites/archive?dossier=" + dossier);
    expect(reponse.status()).toBe(200);
    expect(reponse.headers()["content-type"]).toContain("application/zip");
    expect(reponse.headers()["content-disposition"]).toContain("ARCHIVE ESSAI");

    const fichiers = fichiersDeLArchive(await reponse.body());
    expect(fichiers.length).toBeGreaterThan(2);

    /* Tout est en PDF, et nommé par le titre du document, non par son empreinte. */
    for (const nom of fichiers) expect(nom, nom).toMatch(/\.pdf$/);
    expect(fichiers).toContain("Statuts constitutifs.pdf");

    /* L'archive porte exactement ce que le dossier remet, ni plus ni moins. */
    const remis = await prisma.documents.count({
      where: {
        formalite_id: dossier,
        uploaded_by: "system",
        status: "generated",
        NOT: { file_path: null },
      },
    });
    expect(fichiers.length).toBe(remis);

    /* Et le bouton paraît, en tête de la liste. */
    await page.goto("/creation?dossier=" + dossier + "&etape=documents");
    await expect(page.getByRole("link", { name: "Tout télécharger" })).toBeVisible();
  });

  /* Un dossier qui ne nous appartient pas ne livre pas ses actes en bloc. */
  test("refuse un dossier qu'on n'a pas le droit de lire", async ({ request }) => {
    const reponse = await request.get("/api/formalites/archive?dossier=999999999");
    expect(reponse.status()).toBe(404);
  });
});
