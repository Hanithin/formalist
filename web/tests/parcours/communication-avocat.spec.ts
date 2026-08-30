import { test, expect } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/infrastructure/db/generated/client";
import { retirerDossiers } from "./nettoyage";

/**
 * L'échange entre le cabinet et son client.
 *
 * Le fil s'écrivait en base et rien d'autre : ni cloche, ni courriel. Un avocat qui
 * demandait une pièce dans la conversation n'était lu que si le client repassait sur
 * le site ; un client qui répondait attendait de même. Et l'onglet qui porte le fil
 * l'affichait sans jamais le marquer lu - la pastille rouge restait sur la ligne de
 * la liste jusqu'à ce qu'on rouvre le même fil dans la messagerie.
 */
const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL ?? "",
    options: "-c timezone=UTC",
  }),
});

const ouverts: number[] = [];

async function comptes() {
  return {
    client: await prisma.users.findFirstOrThrow({ where: { email: "parcours@exemple.test" } }),
    avocat: await prisma.users.findFirstOrThrow({
      where: { email: "avocat-parcours@exemple.test" },
    }),
  };
}

/** Un dossier confié à l'avocat d'essai, avec son fil vide. */
async function dossierSuivi(societe: string) {
  const { client, avocat } = await comptes();

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

test.describe("le fil du dossier", () => {
  test.afterAll(async () => {
    if (ouverts.length > 0) await retirerDossiers(ouverts);
    await prisma.$disconnect();
  });

  test.describe("écrit par l'avocat", () => {
    test.use({ storageState: "./tests/parcours/session-avocat.json" });

    test("un message écrit au client le prévient", async ({ request }) => {
      const dossier = await dossierSuivi("MESSAGE ESSAI " + Date.now());
      const { client } = await comptes();

      const reponse = await request.post("/api/messages", {
        data: { dossier: dossier.id, contenu: "Il me manque votre pièce d'identité." },
      });
      expect(reponse.status()).toBe(201);

      const avis = await prisma.notifications.findMany({
        where: { formalite_id: dossier.id, user_id: client.id, type: "message_recu" },
      });
      expect(avis).toHaveLength(1);
      expect(avis[0].content).toContain("MESSAGE ESSAI");
    });

    /*
     * On ne redit pas ce qui n'a pas encore été lu.
     *
     * Trois messages écrits dans la même minute feraient trois courriels dont les deux
     * derniers n'apprendraient rien, et l'on cesse d'ouvrir ceux qui comptent. La
     * cloche, elle, prend tout : c'est sa raison d'être.
     */
    test("le second message reste dans la cloche, sans second courriel", async ({ request }) => {
      const dossier = await dossierSuivi("MESSAGE SUITE " + Date.now());
      const { client } = await comptes();

      for (const contenu of ["Premier mot", "Second mot", "Troisième mot"]) {
        expect(
          (await request.post("/api/messages", { data: { dossier: dossier.id, contenu } })).status()
        ).toBe(201);
      }

      /* Trois lignes dans la cloche : rien ne se perd. */
      const avis = await prisma.notifications.findMany({
        where: { formalite_id: dossier.id, user_id: client.id, type: "message_recu" },
        orderBy: { id: "asc" },
      });
      expect(avis).toHaveLength(3);
      expect(avis.map((a) => a.content.includes("MESSAGE SUITE"))).toEqual([true, true, true]);
    });

    /*
     * Le refus d'une pièce ouvre un message dans le fil : son avis est déjà parti avec
     * le motif, et un second dirait la même chose une seconde plus tard.
     */
    test("le message d'un refus de pièce n'en envoie pas un second", async ({ request }) => {
      const dossier = await dossierSuivi("REFUS ESSAI " + Date.now());
      const { client } = await comptes();

      const piece = await prisma.documents.create({
        data: {
          formalite_id: dossier.id,
          name: "Pièce d'identité",
          type: "identite",
          file_path: "essai-identite.pdf",
          uploaded_by: "user",
          status: "uploaded",
        },
      });

      expect(
        (
          await request.put("/api/avocat/documents", {
            data: { document: piece.id, decision: "refuser", motif: "Illisible" },
          })
        ).status()
      ).toBe(200);

      const avis = await prisma.notifications.findMany({
        where: { formalite_id: dossier.id, user_id: client.id },
      });
      expect(avis.map((a) => a.type)).toEqual(["document_refuse"]);
    });

    /*
     * L'onglet affichait le fil sans le marquer lu : seule la messagerie appelait ce
     * point d'entrée. L'avocat qui lisait et répondait ici gardait « 1 non lu » sur sa
     * ligne de liste et sur l'onglet, indéfiniment.
     */
    test("ouvrir l'onglet Communication éteint la pastille", async ({ page }) => {
      const dossier = await dossierSuivi("PASTILLE ESSAI " + Date.now());
      const { client } = await comptes();

      await prisma.messages.create({
        data: {
          formalite_id: dossier.id,
          sender_id: client.id,
          content: "J'ai corrigé mon adresse.",
          kind: "text",
          read: false,
        },
      });

      await page.goto("/avocat/" + dossier.id + "?onglet=communication");
      await expect(page.getByText("J'ai corrigé mon adresse.")).toBeVisible();

      await expect
        .poll(
          async () =>
            prisma.messages.count({ where: { formalite_id: dossier.id, read: false } }),
          { timeout: 10_000 }
        )
        .toBe(0);
    });
  });

  test.describe("répondu par le client", () => {
    test("sa réponse prévient l'avocat assigné", async ({ request }) => {
      const dossier = await dossierSuivi("REPONSE ESSAI " + Date.now());
      const { avocat } = await comptes();

      expect(
        (
          await request.post("/api/messages", {
            data: { dossier: dossier.id, contenu: "Voici la pièce demandée." },
          })
        ).status()
      ).toBe(201);

      const avis = await prisma.notifications.findMany({
        where: { formalite_id: dossier.id, user_id: avocat.id, type: "message_recu" },
      });
      expect(avis).toHaveLength(1);
    });

    /* Un dossier que personne n'a pris n'a pas d'autre partie à qui écrire. */
    test("sur un dossier sans avocat, le message part sans prévenir personne", async ({
      request,
    }) => {
      const dossier = await dossierSuivi("SANS AVOCAT " + Date.now());
      await prisma.formalites.update({
        where: { id: dossier.id },
        data: { assigned_avocat_id: null },
      });

      expect(
        (
          await request.post("/api/messages", {
            data: { dossier: dossier.id, contenu: "Bonjour ?" },
          })
        ).status()
      ).toBe(201);

      expect(
        await prisma.notifications.count({
          where: { formalite_id: dossier.id, type: "message_recu" },
        })
      ).toBe(0);
    });
  });
});
