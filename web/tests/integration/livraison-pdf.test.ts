import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/infrastructure/db/client";
import { estActeProduit } from "@/infrastructure/db/depots/fichiers";
import { hacher } from "@/lib/mots-de-passe";

/**
 * Ce qui distingue un acte d'une pièce.
 *
 * Les actes que la plateforme produit sont remis en PDF, comme le faisait la page
 * d'origine dont downloadDoc() et previewDoc() appelaient tous deux /api/generate-pdf.
 * Une pièce déposée par le client, elle, est rendue telle quelle : la convertir
 * changerait le document qu'il a remis. Toute la décision tient à ce départ, donc il
 * se teste.
 */
const avecBase = process.env.DATABASE_URL ? describe : describe.skip;

const MARQUE = "livraison-essai-";

avecBase("acte produit ou pièce déposée", () => {
  let dossier: number;
  let proprietaire: number;

  beforeAll(async () => {
    const empreinte = hacher("MotDePasseEssai2026!");
    const u = await prisma.users.create({
      data: {
        email: MARQUE + "proprietaire@exemple.test",
        password_hash: empreinte.hash,
        salt: empreinte.salt,
        name: "Essai livraison",
        role: "user",
        roles: JSON.stringify(["user"]),
        email_verified: true,
      },
    });
    proprietaire = u.id;

    const d = await prisma.formalites.create({
      data: {
        user_id: proprietaire,
        type: "creation",
        forme: "SASU",
        societe: MARQUE + "societe",
        status: "en_cours",
        data_json: "{}",
      },
    });
    dossier = d.id;

    await prisma.documents.createMany({
      data: [
        {
          formalite_id: dossier,
          name: "Statuts constitutifs",
          type: "docx",
          file_path: MARQUE + "acte.docx",
          uploaded_by: "system",
          status: "generated",
        },
        {
          formalite_id: dossier,
          name: "Justificatif de domicile",
          type: "justificatif",
          file_path: MARQUE + "piece.docx",
          uploaded_by: "user",
          status: "uploaded",
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.documents.deleteMany({ where: { formalite_id: dossier } });
    await prisma.formalites.deleteMany({ where: { id: dossier } });
    await prisma.users.deleteMany({ where: { email: { startsWith: MARQUE } } });
    await prisma.$disconnect();
  });

  it("un acte produit par la plateforme est reconnu", async () => {
    expect(await estActeProduit(MARQUE + "acte.docx")).toBe(true);
  });

  it("une pièce déposée par le client n'en est pas un", async () => {
    expect(await estActeProduit(MARQUE + "piece.docx")).toBe(false);
  });

  it("un fichier qu'aucune ligne ne référence n'en est pas un", async () => {
    expect(await estActeProduit("inconnu-au-registre.docx")).toBe(false);
  });

  it("un nom vide ne passe pas", async () => {
    expect(await estActeProduit("")).toBe(false);
  });

  it("un chemin remontant est réduit à son dernier segment", async () => {
    // Le nom vient de l'adresse : il ne doit pas servir à désigner autre chose que
    // le fichier lui-même.
    expect(await estActeProduit("../../" + MARQUE + "acte.docx")).toBe(true);
    expect(await estActeProduit("../../etc/passwd")).toBe(false);
  });
});
