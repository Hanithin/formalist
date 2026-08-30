import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/infrastructure/db/client";
import { enregistrerBrouillon } from "@/infrastructure/db/depots/brouillons";
import { marquerLesInformationsVerifiees } from "@/infrastructure/db/depots/avocat";
import { hacher } from "@/lib/mots-de-passe";

/**
 * Une relecture porte sur ce qui était écrit ce jour-là.
 *
 * Le client reste propriétaire de son dossier après l'avoir transmis : il peut y
 * revenir, et il le doit quand on lui demande des corrections. La fusion conservait la
 * marque de relecture telle quelle, si bien que la case « J'ai vérifié les
 * informations » restait cochée sur un capital modifié depuis - et l'avancement
 * continuait de compter la vérification comme faite.
 */
const avecBase = process.env.DATABASE_URL ? describe : describe.skip;

const MARQUE = "relecture-perimee-essai-";

avecBase("la marque de relecture", () => {
  let client: { id: number; roles: string[]; nom: string };
  let avocat: { id: number; roles: string[]; nom: string };
  let dossier: number;

  const relecture = async () => {
    const ligne = await prisma.formalites.findUniqueOrThrow({ where: { id: dossier } });
    return JSON.parse(ligne.data_json ?? "{}").revue as
      | { informations?: boolean; par?: number }
      | undefined;
  };

  beforeAll(async () => {
    const empreinte = hacher("MotDePasseEssai2026!");
    const compte = (nom: string, role: string) =>
      prisma.users.create({
        data: {
          email: MARQUE + role + "@exemple.test",
          password_hash: empreinte.hash,
          salt: empreinte.salt,
          name: nom,
          role,
          roles: JSON.stringify(role === "avocat" ? ["user", "avocat"] : ["user"]),
          email_verified: true,
        },
      });

    const c = await compte("Client essai", "user");
    const a = await compte("Avocat essai", "avocat");
    client = { id: c.id, roles: ["user"], nom: c.name ?? "" };
    avocat = { id: a.id, roles: ["user", "avocat"], nom: a.name ?? "" };

    const d = await prisma.formalites.create({
      data: {
        user_id: c.id,
        assigned_avocat_id: a.id,
        type: "creation",
        forme: "SASU",
        societe: MARQUE + "societe",
        status: "en_attente_validation",
        phase: 5,
        data_json: JSON.stringify({ forme: "SASU", denomination: "ESSAI", capital: 1000 }),
      },
    });
    dossier = d.id;
  });

  afterAll(async () => {
    await prisma.notifications.deleteMany({ where: { formalite_id: dossier } });
    await prisma.audit_log.deleteMany({ where: { formalite_id: dossier } });
    await prisma.formalites.deleteMany({ where: { id: dossier } });
    await prisma.users.deleteMany({ where: { email: { startsWith: MARQUE } } });
    await prisma.$disconnect();
  });

  it("tombe quand le client modifie ce qui a été relu", async () => {
    await marquerLesInformationsVerifiees(avocat as never, dossier, true);
    expect((await relecture())?.informations).toBe(true);

    await enregistrerBrouillon(client as never, dossier, { capital: 50000 });

    expect((await relecture())?.informations).toBe(false);
  });

  it("survit à l'écriture du relecteur lui-même", async () => {
    /*
     * L'avocat corrige parfois une coquille dans le dossier qu'il vient de relire :
     * décocher sa propre case lui demanderait de la recocher aussitôt, sans qu'il ait
     * rien à revoir.
     */
    await marquerLesInformationsVerifiees(avocat as never, dossier, true);
    await enregistrerBrouillon(avocat as never, dossier, { activite: "Conseil" });

    expect((await relecture())?.informations).toBe(true);
  });

  it("ne s'invente pas sur un dossier jamais relu", async () => {
    await marquerLesInformationsVerifiees(avocat as never, dossier, false);
    await enregistrerBrouillon(client as never, dossier, { ville: "Lyon" });

    expect((await relecture())?.informations).toBe(false);
  });
});
