import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/infrastructure/db/client";
import {
  confirmerLeReglementDesComptes,
  confirmerComptesAuRetour,
} from "@/infrastructure/db/depots/comptes";
import { hacher } from "@/lib/mots-de-passe";
import type { Comptes } from "@/infrastructure/db/depots/comptes";

/**
 * Les actes suivent le règlement, ils ne l'attendent pas.
 *
 * Un bouton « Produire les actes » figurait à l'étape du devis, avant le paiement. Le
 * client pouvait donc produire ses actes sans payer, ou - c'est le cas qui coûtait -
 * payer sans les produire : le dossier partait en relecture vide, l'avocat ouvrait un
 * dossier sans procès-verbal, et devait relancer quelqu'un qui avait quitté
 * l'application en croyant en avoir fini.
 *
 * La production est maintenant déclenchée par la confirmation du règlement, sur le
 * chemin qui arrive le premier : le retour du client depuis sa banque, ou l'avis de
 * Stripe. C'est ce que ce test tient.
 */
const avecBase = process.env.DATABASE_URL ? describe : describe.skip;

const MARQUE = "comptes-paiement-essai-";

const DOSSIER: Comptes = {
  societe: {
    denomination: "ESSAI PAIEMENT",
    forme: "SAS",
    siren: "552100554",
    adresse: "34 rue Laugier",
    codePostal: "75017",
    ville: "Paris",
    villeRcs: "Paris",
    capital: 10000,
  },
  associes: [
    { civilite: "Monsieur", prenom: "Paul", nom: "DURAND", parts: 600 },
    { civilite: "Madame", prenom: "Anne", nom: "ROUSSEL", parts: 400 },
  ],
  valeurs: {
    dateOuverture: "2025-01-01",
    dateCloture: "2025-12-31",
    dateAssemblee: "2026-06-15",
    dirigeantCivilite: "Monsieur",
    dirigeantPrenom: "Paul",
    dirigeantNomFamille: "DURAND",
    dirigeantFonction: "Président",
    commissaireAuxComptes: "Non",
    resultat: 50000,
    reportAnterieur: 0,
    reserveLegale: 0,
    totalBilan: 120000,
  },
  affectation: {
    reserveLegaleCentimes: 500000,
    autresReservesCentimes: 0,
    dividendesCentimes: 0,
    reportANouveauCentimes: 4500000,
  },
  conventions: [],
  exclusions: [],
  demandeLaConfidentialite: false,
};

avecBase("le règlement d'un dépôt de comptes", () => {
  let dossier: number;
  let utilisateurId: number;

  beforeAll(async () => {
    /* Un essai interrompu laisse ses lignes : on repart d'une base propre. */
    const restes = await prisma.users.findMany({
      where: { email: { startsWith: MARQUE } },
      select: { id: true },
    });
    for (const reste of restes) {
      const anciens = await prisma.formalites.findMany({
        where: { user_id: reste.id },
        select: { id: true },
      });
      for (const ancien of anciens) {
        await prisma.notifications.deleteMany({ where: { formalite_id: ancien.id } });
        await prisma.documents.deleteMany({ where: { formalite_id: ancien.id } });
        await prisma.audit_log.deleteMany({ where: { formalite_id: ancien.id } });
      }
      await prisma.formalites.deleteMany({ where: { user_id: reste.id } });
      await prisma.users.deleteMany({ where: { id: reste.id } });
    }

    const empreinte = hacher("MotDePasseEssai2026!");
    const u = await prisma.users.create({
      data: {
        email: MARQUE + "client@exemple.test",
        password_hash: empreinte.hash,
        salt: empreinte.salt,
        name: "Essai règlement",
        role: "user",
        roles: JSON.stringify(["user"]),
        email_verified: true,
      },
    });
    utilisateurId = u.id;

    const d = await prisma.formalites.create({
      data: {
        user_id: u.id,
        type: "comptes",
        forme: "SAS",
        societe: MARQUE + "societe",
        status: "en_cours",
        data_json: JSON.stringify({ ...DOSSIER, paiementRef: MARQUE + "session" }),
      },
    });
    dossier = d.id;
  });

  afterAll(async () => {
    await prisma.notifications.deleteMany({ where: { formalite_id: dossier } });
    await prisma.documents.deleteMany({ where: { formalite_id: dossier } });
    await prisma.audit_log.deleteMany({ where: { formalite_id: dossier } });
    await prisma.formalites.deleteMany({ where: { id: dossier } });
    await prisma.users.deleteMany({ where: { id: utilisateurId } });
  });

  it("écrit les actes sans qu'on ait rien à actionner", async () => {
    const avant = await prisma.documents.count({ where: { formalite_id: dossier } });
    expect(avant).toBe(0);

    const resultat = await confirmerLeReglementDesComptes(MARQUE + "session", dossier);
    expect(resultat.paye).toBe(true);

    const produits = await prisma.documents.findMany({
      where: { formalite_id: dossier },
      select: { name: true, status: true },
    });

    expect(produits.length).toBeGreaterThan(0);
    expect(produits.map((d) => d.name).join(" | ")).toContain("rocès-verbal");
  });

  it("laisse le dossier en attente de relecture", async () => {
    const ligne = await prisma.formalites.findUnique({
      where: { id: dossier },
      select: { status: true },
    });
    expect(ligne?.status).toBe("en_attente_validation");
  });

  it("ne rend pas une page d'erreur sur une référence illisible", async () => {
    /*
     * Le paramètre de session vient de l'adresse, et une adresse se recopie, se garde
     * en favori, se rouvre le lendemain. Une session expirée ou tronquée faisait
     * remonter l'erreur de Stripe jusqu'au rendu : le client sortait de sa banque,
     * carte débitée, et tombait sur une page d'erreur.
     */
    const retour = await confirmerComptesAuRetour(
      { id: utilisateurId, roles: ["user"], email: MARQUE + "client@exemple.test" },
      dossier,
      "cs_reference_qui_nexiste_pas"
    );
    expect(retour.paye).toBe(false);
  });

  it("ne réécrit rien si la confirmation revient deux fois", async () => {
    /*
     * Le retour du client et l'avis de Stripe confirment le même encaissement. Sans
     * garde, le second passage produirait une seconde série d'actes, et l'avocat
     * verrait deux procès-verbaux identiques dans le même dossier.
     */
    const avant = await prisma.documents.count({ where: { formalite_id: dossier } });
    await confirmerLeReglementDesComptes(MARQUE + "session", dossier);
    const apres = await prisma.documents.count({ where: { formalite_id: dossier } });
    expect(apres).toBe(avant);
  });
});
