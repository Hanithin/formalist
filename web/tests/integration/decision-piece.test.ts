import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/infrastructure/db/client";
import { statuerSurDocument } from "@/infrastructure/db/depots/avocat";
import { hacher } from "@/lib/mots-de-passe";

/**
 * Ce que le cabinet décide d'une pièce, et comment il revient dessus.
 *
 * Deux manques se répondaient : une validation donnée trop vite ne se reprenait pas -
 * la pièce passait « Vérifié » et n'offrait plus aucun geste - et un refus ne laissait
 * au client qu'un motif de quelques mots, sans rien à quoi répondre. Il redéposait donc
 * la même pièce, et le dossier faisait deux allers-retours de plus.
 */
const avecBase = process.env.DATABASE_URL ? describe : describe.skip;

const MARQUE = "decision-piece-essai-";

avecBase("décider d'une pièce", () => {
  let avocat: { id: number; roles: string[]; email: string };
  let dossier: number;
  let document: number;

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

    const piece = await prisma.documents.create({
      data: {
        formalite_id: dossier,
        name: "Justificatif de jouissance",
        type: "jouissance-locaux",
        file_path: "essai-decision.pdf",
        uploaded_by: "user",
        status: "uploaded",
      },
    });
    document = piece.id;
  });

  afterAll(async () => {
    await prisma.messages.deleteMany({ where: { formalite_id: dossier } });
    await prisma.notifications.deleteMany({ where: { formalite_id: dossier } });
    await prisma.audit_log.deleteMany({ where: { formalite_id: dossier } });
    await prisma.documents.deleteMany({ where: { formalite_id: dossier } });
    await prisma.formalites.deleteMany({ where: { id: dossier } });
    await prisma.users.deleteMany({ where: { email: { startsWith: MARQUE } } });
    await prisma.$disconnect();
  });

  it("un refus ouvre un message qui reprend le motif", async () => {
    await statuerSurDocument(avocat as never, document, "refuser", "Le bail est au nom d'un tiers");

    const messages = await prisma.messages.findMany({ where: { formalite_id: dossier } });
    expect(messages).toHaveLength(1);
    expect(messages[0].sender_id).toBe(avocat.id);
    expect(messages[0].content).toContain("Le bail est au nom d'un tiers");
    // Le client doit savoir quoi faire, pas seulement que c'est refusé.
    expect(messages[0].content).toContain("nouvelle version");
  });

  it("valider efface le refus", async () => {
    const apres = await statuerSurDocument(avocat as never, document, "valider");
    expect(apres.status).toBe("verified");
    expect(apres.rejection_reason).toBeNull();
  });

  it("revenir sur une validation remet la pièce en attente de décision", async () => {
    const apres = await statuerSurDocument(avocat as never, document, "reprendre");
    expect(apres.status).toBe("uploaded");
    expect(apres.rejection_reason).toBeNull();
  });

  it("revenir sur une décision ne prévient pas le client", async () => {
    // Il a vu une pièce validée : lui annoncer qu'elle ne l'est plus, avant qu'on ait
    // retranché, ne ferait qu'inquiéter. Le journal, lui, garde la trace.
    const avis = await prisma.notifications.count({ where: { formalite_id: dossier } });
    await statuerSurDocument(avocat as never, document, "valider");
    await statuerSurDocument(avocat as never, document, "reprendre");

    expect(await prisma.notifications.count({ where: { formalite_id: dossier } })).toBe(avis + 1);
    expect(
      await prisma.audit_log.count({
        where: { formalite_id: dossier, action: "document_decision_reprise" },
      })
    ).toBeGreaterThan(0);
  });
});
