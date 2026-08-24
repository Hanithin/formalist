import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/infrastructure/db/client";
import { supprimerBrouillon } from "@/infrastructure/db/depots/brouillons";
import { formalitesPourListe } from "@/infrastructure/db/depots/documents";
import { hacher, jeton } from "@/lib/mots-de-passe";
import type { UtilisateurConnecte } from "@/infrastructure/db/sessions";

/**
 * La suppression d'un brouillon, sur une vraie base.
 *
 * Le domaine dit quand elle est permise ; ce test dit que le chemin réellement
 * emprunté l'applique, qu'il emporte les lignes filles - les clés étrangères sont en
 * NoAction, un oubli fait échouer la suppression - et qu'il laisse une trace.
 */
const avecBase = process.env.DATABASE_URL ? describe : describe.skip;

const MARQUE = "suppression-essai-";

avecBase("supprimer un brouillon", () => {
  let alice: UtilisateurConnecte;
  let bruno: UtilisateurConnecte;

  async function creerCompte(suffixe: string): Promise<UtilisateurConnecte> {
    const empreinte = hacher("MotDePasseEssai2026!");
    const u = await prisma.users.create({
      data: {
        email: MARQUE + suffixe + "@exemple.test",
        password_hash: empreinte.hash,
        salt: empreinte.salt,
        name: "Essai " + suffixe,
        role: "user",
        roles: JSON.stringify(["user"]),
        email_verified: true,
      },
    });
    return {
      id: u.id,
      email: u.email,
      nom: u.name,
      roles: ["user"],
      jeton: jeton(8),
    };
  }

  async function creerDossier(
    proprietaire: UtilisateurConnecte,
    donnees: Partial<{ status: string; data_json: string; assigned_avocat_id: number }> = {}
  ): Promise<number> {
    const dossier = await prisma.formalites.create({
      data: {
        user_id: proprietaire.id,
        type: "creation",
        forme: "SASU",
        societe: MARQUE + "societe",
        status: "en_cours",
        data_json: "{}",
        ...donnees,
      },
    });
    return dossier.id;
  }

  beforeAll(async () => {
    alice = await creerCompte("alice");
    bruno = await creerCompte("bruno");
  });

  afterAll(async () => {
    const restants = await prisma.formalites.findMany({
      where: { societe: { startsWith: MARQUE } },
      select: { id: true },
    });
    const identifiants = restants.map((d) => d.id);
    if (identifiants.length > 0) {
      await prisma.documents.deleteMany({ where: { formalite_id: { in: identifiants } } });
      await prisma.messages.deleteMany({ where: { formalite_id: { in: identifiants } } });
      await prisma.payments.deleteMany({ where: { formalite_id: { in: identifiants } } });
      await prisma.signature_requests.deleteMany({
        where: { formalite_id: { in: identifiants } },
      });
      await prisma.audit_log.deleteMany({ where: { formalite_id: { in: identifiants } } });
      await prisma.formalites.deleteMany({ where: { id: { in: identifiants } } });
    }
    await prisma.audit_log.deleteMany({ where: { actor_id: { in: [alice.id, bruno.id] } } });
    await prisma.users.deleteMany({ where: { email: { startsWith: MARQUE } } });
    await prisma.$disconnect();
  });

  it("retire le dossier et ses lignes filles", async () => {
    const id = await creerDossier(alice);
    await prisma.documents.create({
      data: { formalite_id: id, name: "Pièce", type: "identite", file_path: null },
    });
    await prisma.messages.create({
      data: { formalite_id: id, sender_id: alice.id, content: "Bonjour" },
    });

    await supprimerBrouillon(alice, id);

    expect(await prisma.formalites.findUnique({ where: { id } })).toBeNull();
    expect(await prisma.documents.count({ where: { formalite_id: id } })).toBe(0);
    expect(await prisma.messages.count({ where: { formalite_id: id } })).toBe(0);
  });

  it("laisse une trace de ce qui a disparu", async () => {
    const id = await creerDossier(alice);
    await supprimerBrouillon(alice, id);

    const trace = await prisma.audit_log.findFirst({
      where: { actor_id: alice.id, action: "brouillon_supprime" },
      orderBy: { created_at: "desc" },
    });
    expect(trace).not.toBeNull();
    expect(trace?.before_value).toContain(String(id));
  });

  it("refuse le brouillon d'un autre client", async () => {
    const id = await creerDossier(alice);
    await expect(supprimerBrouillon(bruno, id)).rejects.toMatchObject({ statut: 403 });
    expect(await prisma.formalites.findUnique({ where: { id } })).not.toBeNull();
  });

  it("refuse un dossier transmis au cabinet", async () => {
    const id = await creerDossier(alice, { status: "en_attente_validation" });
    await expect(supprimerBrouillon(alice, id)).rejects.toMatchObject({ statut: 403 });
    expect(await prisma.formalites.findUnique({ where: { id } })).not.toBeNull();
  });

  it("refuse un dossier que le brouillon dit payé", async () => {
    const id = await creerDossier(alice, { data_json: JSON.stringify({ paye: true }) });
    await expect(supprimerBrouillon(alice, id)).rejects.toMatchObject({ statut: 403 });
  });

  /*
   * Le cas qui justifie la revérification côté serveur : la liste peut avoir été
   * rendue avant l'encaissement, et le brouillon peut encore l'ignorer.
   */
  it("refuse un dossier portant un règlement encaissé, brouillon muet", async () => {
    const id = await creerDossier(alice);
    await prisma.payments.create({
      data: {
        user_id: alice.id,
        formalite_id: id,
        amount_cents: 8900,
        status: "paid",
        paid_at: new Date(),
      },
    });

    await expect(supprimerBrouillon(alice, id)).rejects.toMatchObject({ statut: 403 });
    expect(await prisma.formalites.findUnique({ where: { id } })).not.toBeNull();
  });

  it("refuse un dossier dont une signature a été demandée", async () => {
    const id = await creerDossier(alice);
    await prisma.signature_requests.create({
      data: { formalite_id: id, associe_index: 0, associe_name: "Essai", token: jeton(12) },
    });

    await expect(supprimerBrouillon(alice, id)).rejects.toMatchObject({ statut: 403 });
  });

  it("la liste marque le brouillon et laisse les autres tranquilles", async () => {
    const brouillonId = await creerDossier(alice);
    const transmisId = await creerDossier(alice, { status: "en_attente_validation" });

    const liste = await formalitesPourListe(alice);
    const parIdentifiant = new Map(liste.map((d) => [d.id, d]));

    expect(parIdentifiant.get(brouillonId)?.brouillon).toBe(true);
    expect(parIdentifiant.get(transmisId)?.brouillon).toBe(false);
  });
});
