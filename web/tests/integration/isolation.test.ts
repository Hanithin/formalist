import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/infrastructure/db/client";
import {
  lireDossier,
  exigerDossier,
  exigerDossierModifiable,
  listerDossiers,
} from "@/infrastructure/db/depots/dossiers";
import { hacher, jeton } from "@/lib/mots-de-passe";
import type { UtilisateurConnecte } from "@/infrastructure/db/sessions";

/**
 * L'isolation entre clients, vérifiée sur une vraie base.
 *
 * Les tests de domaine prouvent que les règles sont justes ; celui-ci prouve
 * qu'elles sont bien appliquées par le chemin que le code emprunte réellement.
 * Les deux sont nécessaires : la faille de /api/file venait d'une règle correcte
 * qu'aucun appel n'invoquait.
 */
const avecBase = process.env.DATABASE_URL ? describe : describe.skip;

const MARQUE = "isolation-essai-";

avecBase("isolation des dossiers entre clients", () => {
  let alice: UtilisateurConnecte;
  let bruno: UtilisateurConnecte;
  let administrateur: UtilisateurConnecte;
  let dossierAliceId: number;

  async function creerCompte(suffixe: string, roles: string[]): Promise<UtilisateurConnecte> {
    const empreinte = hacher("MotDePasseEssai2026!");
    const u = await prisma.users.create({
      data: {
        email: MARQUE + suffixe + "@exemple.test",
        password_hash: empreinte.hash,
        salt: empreinte.salt,
        name: "Essai " + suffixe,
        role: roles[0],
        roles: JSON.stringify(roles),
        email_verified: true,
      },
    });
    return {
      id: u.id,
      email: u.email,
      nom: u.name,
      roles: roles as UtilisateurConnecte["roles"],
      jeton: jeton(8),
    };
  }

  beforeAll(async () => {
    alice = await creerCompte("alice", ["user"]);
    bruno = await creerCompte("bruno", ["user"]);
    administrateur = await creerCompte("admin", ["admin"]);

    const dossier = await prisma.formalites.create({
      data: {
        user_id: alice.id,
        type: "creation",
        forme: "SASU",
        societe: MARQUE + "societe",
        status: "en_cours",
        data_json: "{}",
      },
    });
    dossierAliceId = dossier.id;
  });

  afterAll(async () => {
    await prisma.formalites.deleteMany({ where: { societe: { startsWith: MARQUE } } });
    await prisma.users.deleteMany({ where: { email: { startsWith: MARQUE } } });
    await prisma.$disconnect();
  });

  it("la propriétaire lit son dossier", async () => {
    const d = await lireDossier(alice, dossierAliceId);
    expect(d?.id).toBe(dossierAliceId);
  });

  it("un autre client ne le lit pas", async () => {
    expect(await lireDossier(bruno, dossierAliceId)).toBeNull();
  });

  it("le refus ne distingue pas « inexistant » de « interdit »", async () => {
    const interdit = await lireDossier(bruno, dossierAliceId);
    const inexistant = await lireDossier(bruno, 999_999_999);
    expect(interdit).toEqual(inexistant); // les deux valent null
  });

  it("exigerDossier lève pour un tiers", async () => {
    await expect(exigerDossier(bruno, dossierAliceId)).rejects.toMatchObject({ statut: 403 });
  });

  it("un tiers ne peut pas le modifier non plus", async () => {
    await expect(exigerDossierModifiable(bruno, dossierAliceId)).rejects.toMatchObject({
      statut: 403,
    });
  });

  it("l'administrateur de la plateforme y accède", async () => {
    const d = await lireDossier(administrateur, dossierAliceId);
    expect(d?.id).toBe(dossierAliceId);
  });

  it("le dossier n'apparaît pas dans la liste d'un tiers", async () => {
    const liste = await listerDossiers(bruno);
    expect(liste.map((d) => d.id)).not.toContain(dossierAliceId);
  });

  it("il apparaît dans celle de sa propriétaire", async () => {
    const liste = await listerDossiers(alice);
    expect(liste.map((d) => d.id)).toContain(dossierAliceId);
  });
});
