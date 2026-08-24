import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/infrastructure/db/client";
import {
  mettreLesActesADisposition,
  retirerLesActesDeLEspaceClient,
} from "@/infrastructure/db/depots/avocat";
import { A_RELIRE } from "@/domain/document/publication";
import { TITRE_STATUTS_EN_VIGUEUR, TITRE_STATUTS_A_JOUR } from "@/domain/modification/formalites";
import { hacher } from "@/lib/mots-de-passe";

/**
 * Mettre les actes à disposition, et revenir dessus.
 *
 * Publier n'avait pas d'envers : un acte mis à disposition par erreur - le mauvais
 * dossier, une coquille vue une seconde trop tard - restait chez le client, qui pouvait
 * le signer ou l'envoyer à sa banque.
 */
const avecBase = process.env.DATABASE_URL ? describe : describe.skip;

const MARQUE = "actes-disposition-essai-";

avecBase("les actes mis à disposition", () => {
  let avocat: { id: number; roles: string[]; email: string };
  let dossier: number;

  const etats = async () =>
    Object.fromEntries(
      (
        await prisma.documents.findMany({
          where: { formalite_id: dossier },
          select: { name: true, status: true },
        })
      ).map((d) => [d.name, d.status])
    );

  beforeAll(async () => {
    const empreinte = hacher("MotDePasseEssai2026!");
    const client = await prisma.users.create({
      data: {
        email: MARQUE + "client@exemple.test",
        password_hash: empreinte.hash,
        salt: empreinte.salt,
        name: "Client essai",
        role: "user",
        roles: JSON.stringify(["user"]),
        email_verified: true,
      },
    });
    const robe = await prisma.users.create({
      data: {
        email: MARQUE + "avocat@exemple.test",
        password_hash: empreinte.hash,
        salt: empreinte.salt,
        name: "Avocat essai",
        role: "avocat",
        roles: JSON.stringify(["user", "avocat"]),
        email_verified: true,
      },
    });
    avocat = { id: robe.id, roles: ["user", "avocat"], email: robe.email };

    const d = await prisma.formalites.create({
      data: {
        user_id: client.id,
        type: "modification",
        forme: "SAS",
        societe: MARQUE + "societe",
        status: "en_attente_validation",
        assigned_avocat_id: robe.id,
        data_json: "{}",
      },
    });
    dossier = d.id;

    for (const [nom, statut] of [
      ["Procès-verbal d'assemblée générale extraordinaire", A_RELIRE],
      [TITRE_STATUTS_A_JOUR, A_RELIRE],
      // Repris au registre, jamais produit par le cabinet.
      [TITRE_STATUTS_EN_VIGUEUR, "generated"],
      // Signé : il est au-delà de la relecture.
      ["Traité d'apport", "signed"],
    ] as const) {
      await prisma.documents.create({
        data: {
          formalite_id: dossier,
          name: nom,
          type: "pdf",
          file_path: "essai-" + nom.slice(0, 8) + ".pdf",
          uploaded_by: "system",
          status: statut,
        },
      });
    }
  });

  afterAll(async () => {
    await prisma.notifications.deleteMany({ where: { formalite_id: dossier } });
    await prisma.audit_log.deleteMany({ where: { formalite_id: dossier } });
    await prisma.documents.deleteMany({ where: { formalite_id: dossier } });
    await prisma.formalites.deleteMany({ where: { id: dossier } });
    await prisma.users.deleteMany({ where: { email: { startsWith: MARQUE } } });
    await prisma.$disconnect();
  });

  it("la mise à disposition ne publie que ce qui attendait la relecture", async () => {
    expect(await mettreLesActesADisposition(avocat as never, dossier)).toEqual({ publies: 2 });

    const apres = await etats();
    expect(apres["Procès-verbal d'assemblée générale extraordinaire"]).toBe("generated");
    expect(apres[TITRE_STATUTS_A_JOUR]).toBe("generated");
    expect(apres["Traité d'apport"]).toBe("signed");
  });

  it("le retrait remet les actes en relecture, et prévient le client", async () => {
    expect(await retirerLesActesDeLEspaceClient(avocat as never, dossier)).toEqual({ retires: 2 });

    const apres = await etats();
    expect(apres["Procès-verbal d'assemblée générale extraordinaire"]).toBe(A_RELIRE);
    expect(apres[TITRE_STATUTS_A_JOUR]).toBe(A_RELIRE);

    const avis = await prisma.notifications.count({ where: { formalite_id: dossier } });
    expect(avis).toBeGreaterThan(0);
  });

  it("les statuts en vigueur ne sont jamais retirés au client", async () => {
    /*
     * Ils viennent du registre ou de lui : les reprendre lui ôterait son propre
     * document, celui-là même sur lequel la retouche travaille.
     */
    expect((await etats())[TITRE_STATUTS_EN_VIGUEUR]).toBe("generated");
  });

  it("un acte signé ne se reprend pas", async () => {
    // La signature est un fait : elle ne s'annule pas d'un clic.
    expect((await etats())["Traité d'apport"]).toBe("signed");
  });
});
