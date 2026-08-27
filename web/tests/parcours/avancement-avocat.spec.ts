import { test, expect } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/infrastructure/db/generated/client";
import { retirerDossiers } from "./nettoyage";

/**
 * L'avancement du dossier, du côté du cabinet.
 *
 * Les cinq pastilles - Transmis, Révision, Vérifié, Dépôt, KBIS - existaient dans la
 * liste et aucune ne s'allumait : aucune route n'écrivait jamais la colonne. Et le
 * Kbis n'avait aucun chemin pour arriver dans le dossier du client, alors que le
 * message de fin le lui promettait.
 */
const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL ?? "",
    options: "-c timezone=UTC",
  }),
});

const PDF = Buffer.from("%PDF-1.4\nfaux document d'essai\n%%EOF\n");
const ouverts: number[] = [];

test.describe("avancement du cabinet", () => {
  test.use({ storageState: "./tests/parcours/session-avocat.json" });

  test.afterAll(async () => {
    if (ouverts.length > 0) await retirerDossiers(ouverts);
    await prisma.$disconnect();
  });

  /** Un dossier confié à l'avocat d'essai, transmis et prêt à être suivi. */
  async function dossierDuCabinet(societe: string) {
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
      },
    });
    ouverts.push(dossier.id);
    return dossier;
  }

  test("les étapes s'allument une à une, sans en sauter", async ({ page, request }) => {
    const dossier = await dossierDuCabinet("AVANCEMENT ESSAI " + Date.now());

    await page.goto("/avocat/" + dossier.id + "?onglet=avancement");
    await expect(page.getByRole("heading", { name: "Avancement du dossier" })).toBeVisible();

    // Un dossier neuf n'entre qu'en 5a.
    const saut = await request.put("/api/avocat/dossier", {
      data: { dossier: dossier.id, sousPhase: "5c" },
    });
    expect(saut.status()).toBe(403);

    await page.getByRole("button", { name: /Passer à . Transmis/ }).click();
    await expect(page.getByRole("button", { name: /Passer à . Révision/ })).toBeVisible();

    // Et le retour d'un cran reste possible : c'est une correction de saisie.
    await expect(page.getByRole("button", { name: /Revenir à/ })).toHaveCount(0);
    await page.getByRole("button", { name: /Passer à . Révision/ }).click();
    await expect(page.getByRole("button", { name: /Revenir à . Transmis/ })).toBeVisible();
  });

  test("« Vérifié » demande au client de publier son annonce légale", async ({ request }) => {
    /*
     * C'est la démarche qui manquait : personne ne disait au client qu'il devait
     * publier, ni ce qu'on attendait en retour.
     */
    const dossier = await dossierDuCabinet("ANNONCE ESSAI " + Date.now());

    for (const etape of ["5a", "5b", "5c"]) {
      const reponse = await request.put("/api/avocat/dossier", {
        data: { dossier: dossier.id, sousPhase: etape },
      });
      expect(reponse.status()).toBe(200);
    }

    const avis = await prisma.notifications.findFirst({
      where: { formalite_id: dossier.id, type: "annonce_a_publier" },
    });
    expect(avis?.content).toContain("annonce légale");
  });

  test("le Kbis se dépose et arrive chez le client", async ({ page, request }) => {
    const dossier = await dossierDuCabinet("KBIS ESSAI " + Date.now());

    await page.goto("/avocat/" + dossier.id + "?onglet=avancement");
    /*
     * Le libellé nomme le document que le greffe délivre pour ce type de dossier :
     * « Extrait Kbis » pour une création, « Extrait à jour » pour une modification. Il
     * était écrit « Kbis » en dur, et l'avocat d'une modification lisait qu'il devait
     * remettre un Kbis, que le greffe ne délivre pas dans ce cas.
     */
    await page.getByLabel("Déposer Extrait Kbis").setInputFiles({
      name: "kbis.pdf",
      mimeType: "application/pdf",
      buffer: PDF,
    });

    await expect(page.getByText("Déposé - le client y a accès")).toBeVisible();

    const depose = await prisma.documents.findFirstOrThrow({
      where: { formalite_id: dossier.id, type: "kbis" },
    });
    expect(depose.uploaded_by).toBe("avocat");

    // Un type inventé n'ouvre pas le dépôt : ce serait un fourre-tout.
    const corps = new FormData();
    corps.append("dossier", String(dossier.id));
    corps.append("type", "n-importe-quoi");
    corps.append("fichier", new Blob([PDF], { type: "application/pdf" }), "x.pdf");
    expect((await request.post("/api/avocat/livrables", { multipart: corps })).status()).toBe(400);
  });

  test("« KBIS délivré » exige le Kbis", async ({ request }) => {
    // Une pastille verte sans Kbis mentirait, et le message de fin le promet au client.
    const dossier = await dossierDuCabinet("SANS KBIS " + Date.now());

    for (const etape of ["5a", "5b", "5c", "5d"]) {
      expect(
        (await request.put("/api/avocat/dossier", { data: { dossier: dossier.id, sousPhase: etape } }))
          .status()
      ).toBe(200);
    }

    const refus = await request.put("/api/avocat/dossier", {
      data: { dossier: dossier.id, sousPhase: "5e" },
    });
    expect(refus.status()).toBe(403);
    expect((await refus.json()).error).toContain("Kbis");
  });

  test.describe("vu par un client", () => {
    test.use({ storageState: "./tests/parcours/session.json" });

    test("il ne dépose pas lui-même son Kbis", async ({ request }) => {
      const dossier = await prisma.formalites.findFirstOrThrow({
        where: { users_formalites_user_idTousers: { email: "parcours@exemple.test" } },
      });

      const corps = new FormData();
      corps.append("dossier", String(dossier.id));
      corps.append("type", "kbis");
      corps.append("fichier", new Blob([PDF], { type: "application/pdf" }), "kbis.pdf");

      expect((await request.post("/api/avocat/livrables", { multipart: corps })).status()).toBe(403);
    });
  });
});

/**
 * Le suivi, vu par le client.
 *
 * Il ne savait rien : l'écran ne portait qu'un état technique - « en attente de
 * validation » - qui ne dit ni qui attend, ni ce qu'on attend de lui.
 */
test.describe("suivi côté client", () => {
  const prisma2 = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.DATABASE_URL ?? "",
      options: "-c timezone=UTC",
    }),
  });

  const miens: number[] = [];

  test.afterAll(async () => {
    if (miens.length > 0) await retirerDossiers(miens);
    await prisma2.$disconnect();
  });

  test("il dit l'étape en cours, à qui est la main, et le geste attendu", async ({ page }) => {
    const compte = await prisma2.users.findFirstOrThrow({
      where: { email: "parcours@exemple.test" },
    });

    const dossier = await prisma2.formalites.create({
      data: {
        user_id: compte.id,
        type: "creation",
        forme: "SASU",
        societe: "SUIVI ESSAI " + Date.now(),
        status: "valide",
        phase: 5,
        business_sub_phase: "5c",
      },
    });
    miens.push(dossier.id);

    await prisma2.documents.create({
      data: {
        formalite_id: dossier.id,
        name: "Attestation de dépôt de capital",
        type: "depot-capital",
        status: "uploaded",
      },
    });

    await page.goto("/creation?dossier=" + dossier.id);

    const suivi = page.getByRole("region", { name: "Avancement du dossier" });
    await expect(suivi).toBeVisible();
    await expect(suivi.getByText("À vous de jouer")).toBeVisible();
    await expect(suivi.getByRole("link", { name: /Déposer l'attestation de parution/ })).toBeVisible();
    // Les six étapes sont là, et l'état technique n'apparaît nulle part.
    await expect(suivi.getByText("Kbis délivré")).toBeVisible();
    await expect(page.getByText("en_attente_validation")).toHaveCount(0);

    /*
     * Chaque ligne dit où elle en est.
     * La liste ne se distinguait que par un rond plein, un rond vide et un gris plus
     * pâle : on voyait qu'il se passait quelque chose sans savoir où l'on en était.
     */
    const etapes = suivi.getByRole("listitem");
    await expect(etapes.first()).toContainText(/Terminé|En cours|À vous|À venir/);
    await expect(suivi.getByText("À venir").first()).toBeVisible();
    await expect(suivi.getByText("Terminé", { exact: true }).first()).toBeVisible();
  });

  test("tant qu'on remplit le dossier, le suivi ne s'affiche pas", async ({ page }) => {
    // Deux indicateurs d'avancement côte à côte se contrediraient.
    await page.goto("/creation");
    await expect(page.getByRole("region", { name: "Avancement du dossier" })).toHaveCount(0);
  });
});
