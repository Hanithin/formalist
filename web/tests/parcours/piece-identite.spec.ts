import { test, expect } from "@playwright/test";
import sharp from "sharp";
import { retirerDossiers } from "./nettoyage";

/**
 * Une pièce d'identité est regardée avant d'être comptée comme reçue.
 *
 * Elle ne l'était que sur sa forme - extension, taille, signature binaire du fichier -
 * et une carte périmée, un cliché flou ou un coin coupé passaient tous. Le défaut se
 * découvrait des semaines plus tard, au refus du greffe, sur un dossier déjà réglé.
 *
 * Ces essais ne font jamais appeler le modèle. L'image qu'ils déposent est refusée sur
 * les seules mesures - trop petite, trop floue - et la lecture est alors épargnée : le
 * verdict est le même à chaque passage, sans réseau ni dépense. Ce que le modèle
 * rapporte est éprouvé ailleurs, sur des lectures écrites à la main.
 */

const semes: number[] = [];

test.afterAll(async () => {
  await retirerDossiers(semes);
});

/** Ce que donne une photo prise de loin, à la volée : illisible, et vite jugée. */
async function imageIllisible(): Promise<Buffer> {
  return sharp({
    create: { width: 300, height: 190, channels: 3, background: { r: 130, g: 133, b: 138 } },
  })
    .blur(6)
    .jpeg({ quality: 40 })
    .toBuffer();
}

async function dossier(request: import("@playwright/test").APIRequestContext) {
  const { dossier: identifiant } = await (await request.post("/api/auto-entrepreneur")).json();
  semes.push(Number(identifiant));

  await request.put("/api/auto-entrepreneur", {
    data: {
      dossier: identifiant,
      modifications: {
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
        reponseReglementation: "non",
      },
    },
  });

  return Number(identifiant);
}

test("une pièce illisible est reçue, et dit tout de suite ce qui ne va pas", async ({
  page,
  request,
}) => {
  const identifiant = await dossier(request);
  await page.goto("/auto-entrepreneur?dossier=" + identifiant + "&etape=5");

  await page.getByLabel("Choisir un fichier").first().setInputFiles({
    name: "identite.jpg",
    mimeType: "image/jpeg",
    buffer: await imageIllisible(),
  });

  /*
   * Le motif, et le geste qui le comble.
   *
   * « Pièce enregistrée » s'affichait sur une carte qu'il fallait refaire : la réponse
   * est un succès au sens du protocole - le fichier est reçu et gardé - et le client
   * repartait en croyant son dossier complet.
   */
  await expect(page.getByText(/L'image est trop petite/)).toBeVisible();
  await expect(page.getByText(/L'image est floue/)).toBeVisible();
});

test("elle ne passe pas pour déposée, ni sur la carte ni dans le récapitulatif", async ({
  page,
  request,
}) => {
  const identifiant = await dossier(request);
  await page.goto("/auto-entrepreneur?dossier=" + identifiant + "&etape=5");

  const colonne = page.getByRole("complementary", { name: "Récapitulatif de votre déclaration" });
  await expect(colonne.getByText("0 sur 3")).toBeVisible();

  await page.getByLabel("Choisir un fichier").first().setInputFiles({
    name: "identite.jpg",
    mimeType: "image/jpeg",
    buffer: await imageIllisible(),
  });
  await expect(page.getByText(/L'image est trop petite/)).toBeVisible();

  /* Le compte ne bouge pas : une pièce retenue n'est pas une pièce rendue. */
  await expect(colonne.getByText("0 sur 3")).toBeVisible();
});

test("le motif survit au rechargement", async ({ page, request }) => {
  const identifiant = await dossier(request);
  await page.goto("/auto-entrepreneur?dossier=" + identifiant + "&etape=5");

  await page.getByLabel("Choisir un fichier").first().setInputFiles({
    name: "identite.jpg",
    mimeType: "image/jpeg",
    buffer: await imageIllisible(),
  });
  await expect(page.getByText(/L'image est trop petite/)).toBeVisible();

  /*
   * Le message du dépôt disparaît au rechargement ; le verdict gardé le remplace.
   * Sans cela, le client revient sur une carte muette et redépose la même photo.
   */
  await page.reload();
  await expect(page.getByText(/L'image est trop petite/)).toBeVisible();
});

test("ce qui n'est pas une pièce d'identité n'est pas contrôlé", async ({ page, request }) => {
  /*
   * Le justificatif de domicile est une facture, une quittance : les mesures d'une
   * pièce d'identité n'ont rien à y dire, et une facture photographiée de loin reste
   * une facture lisible.
   */
  const identifiant = await dossier(request);
  await page.goto("/auto-entrepreneur?dossier=" + identifiant + "&etape=5");

  await page.getByLabel("Choisir un fichier").nth(2).setInputFiles({
    name: "domicile.jpg",
    mimeType: "image/jpeg",
    buffer: await imageIllisible(),
  });

  await expect(page.getByText("Pièce enregistrée")).toBeVisible();
  await expect(page.getByText(/L'image est trop petite/)).toHaveCount(0);
});

/**
 * Ce que l'avocat voit du contrôle.
 *
 * C'est lui qui statue sur la pièce : il doit lire ce que la machine a constaté, et
 * surtout ce qu'elle n'a pas pu constater. Les verdicts sont posés en base plutôt que
 * produits par un dépôt - c'est le seul moyen d'éprouver une lecture indisponible sans
 * débrancher le service, et cela n'appelle personne.
 */
test.describe("le contrôle, côté cabinet", () => {
  test.use({ storageState: "./tests/parcours/session-avocat.json" });

  async function dossierAvecPieces(
    prisma: import("../../src/infrastructure/db/generated/client").PrismaClient,
    verdicts: { nom: string; type: string; controle: unknown; motif?: string }[]
  ) {
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
        type: "auto-entrepreneur",
        forme: "AE",
        societe: "CONTROLE ESSAI",
        status: "en_attente_validation",
        phase: 5,
        business_sub_phase: "5a",
        data_json: JSON.stringify({ prenoms: "Camille", nomNaissance: "Durand" }),
      },
    });
    semes.push(dossier.id);

    for (const v of verdicts) {
      await prisma.documents.create({
        data: {
          formalite_id: dossier.id,
          name: v.nom,
          type: v.type,
          uploaded_by: "user",
          status: "uploaded",
          file_path: "essai-" + v.type + ".jpg",
          controle_json: JSON.stringify(v.controle),
          rejection_reason: v.motif ?? null,
        },
      });
    }

    return dossier.id;
  }

  test("il lit le verdict d'une pièce reçue, et le manque d'une pièce non lue", async ({
    page,
  }) => {
    const { PrismaPg } = await import("@prisma/adapter-pg");
    const { PrismaClient } = await import("../../src/infrastructure/db/generated/client");
    const prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
    });

    const dossier = await dossierAvecPieces(prisma, [
      {
        nom: "Pièce d'identité - recto",
        type: "identite-recto",
        controle: {
          gravite: "acceptee",
          constats: [],
          finDeValidite: "2032-06-14",
          prorogee: false,
          type: "cni",
          nom: "DURAND",
          resume: "Pièce reçue, valable jusqu'au 14 juin 2032.",
          faitLe: "2026-09-24T10:00:00.000Z",
          lectureIndisponible: false,
        },
      },
      {
        nom: "Pièce d'identité - verso",
        type: "identite-verso",
        controle: {
          gravite: "acceptee",
          constats: [],
          finDeValidite: null,
          prorogee: false,
          type: null,
          nom: null,
          resume: "Pièce reçue. Elle sera vérifiée par l'avocat.",
          faitLe: "2026-09-24T10:00:00.000Z",
          lectureIndisponible: true,
        },
      },
    ]);
    await prisma.$disconnect();

    await page.goto("/avocat/" + dossier);

    /* Le constat de la machine, plutôt qu'un « Déposé » muet. */
    await expect(page.getByText("Pièce reçue, valable jusqu'au 14 juin 2032.")).toBeVisible();

    /*
     * Et ce qu'elle n'a pas pu constater.
     *
     * Cette mention vivait sous une condition qui réclamait un constat : une pièce non
     * lue n'en a aucun, c'est tout le problème, et elle ne paraissait donc jamais.
     */
    await expect(page.getByText(/n'a pas pu être lue automatiquement/)).toBeVisible();
  });
});
