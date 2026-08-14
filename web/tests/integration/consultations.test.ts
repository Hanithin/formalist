import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@/infrastructure/db/client";
import {
  creneauxDe,
  reserver,
  mesConsultations,
  confirmerPaiement,
  abandonnerReservation,
  attacherPaiement,
  CreneauIndisponible,
} from "@/infrastructure/db/depots/consultations";
import { fichierLisible } from "@/infrastructure/db/depots/fichiers";
import { RESERVATION_TENUE_MINUTES } from "@/domain/consultation/paiement";
import { hacher, jeton } from "@/lib/mots-de-passe";
import type { UtilisateurConnecte } from "@/infrastructure/db/sessions";

/**
 * La réservation d'une consultation, sur une vraie base.
 *
 * Les tests de domaine prouvent que les règles sont justes ; celui-ci prouve qu'elles
 * sont appliquées par le chemin réellement emprunté. Ce qui se joue ici ne se voit
 * pas en test unitaire : le créneau retiré des disponibilités par une ligne en base,
 * la réservation abandonnée qui le rend, et le droit de lire une pièce jointe.
 *
 * Aucun appel à Stripe : l'encaissement est passé à confirmerPaiement sous la forme
 * où le webhook le remet. Le tunnel de paiement se vérifie à part, en mode test.
 */
const avecBase = process.env.DATABASE_URL ? describe : describe.skip;

const MARQUE = "consultation-essai-";

/** Un créneau franchement dans le futur, pour ne pas dépendre de l'heure qu'il est. */
function prochainMardi(heure: number, minutes = 0): Date {
  const jour = new Date();
  jour.setHours(0, 0, 0, 0);
  jour.setDate(jour.getDate() + ((9 - jour.getDay()) % 7 || 7));
  jour.setHours(heure, minutes, 0, 0);
  return jour;
}

/*
 * La comparaison porte sur l'horaire exact, pas sur l'heure : une plage de 9 h à 12 h
 * par créneaux de 30 minutes contient 10h00 et 10h30, et se contenter de l'heure
 * ferait passer un test qui ne prouve rien.
 */
function contient(creneaux: { debut: Date }[], quand: Date): boolean {
  return creneaux.some((c) => c.debut.getTime() === quand.getTime());
}

avecBase("réservation d'une consultation", () => {
  let cliente: UtilisateurConnecte;
  let tiers: UtilisateurConnecte;
  let avocat: UtilisateurConnecte;

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
    cliente = await creerCompte("cliente", ["user"]);
    tiers = await creerCompte("tiers", ["user"]);
    avocat = await creerCompte("avocat", ["avocat"]);

    // Mardi, de 9 h à 12 h, par créneaux de 30 minutes.
    await prisma.avocat_availability.create({
      data: {
        avocat_id: avocat.id,
        day_of_week: 2,
        start_time: "09:00",
        end_time: "12:00",
        slot_duration_minutes: 30,
      },
    });
  });

  beforeEach(async () => {
    await prisma.lawyer_consultations.deleteMany({ where: { avocat_id: avocat.id } });
  });

  afterAll(async () => {
    await prisma.lawyer_consultations.deleteMany({ where: { avocat_id: avocat.id } });
    await prisma.avocat_availability.deleteMany({ where: { avocat_id: avocat.id } });
    await prisma.uploaded_files.deleteMany({
      where: { user_id: { in: [cliente.id, tiers.id, avocat.id] } },
    });
    await prisma.users.deleteMany({ where: { email: { startsWith: MARQUE } } });
    await prisma.$disconnect();
  });

  async function creneauxDuMardi() {
    const debut = prochainMardi(0);
    const fin = prochainMardi(23);
    return creneauxDe(avocat.id, debut, fin);
  }

  async function reserverA(heure: number) {
    return reserver(cliente, {
      avocatId: avocat.id,
      debut: prochainMardi(heure),
      matiere: "droit_societes",
      description: "Question sur la répartition des parts entre trois associés.",
      pieces: [],
    });
  }

  it("le créneau réservé disparaît des disponibilités", async () => {
    const avant = await creneauxDuMardi();
    expect(contient(avant, prochainMardi(10))).toBe(true);

    await reserverA(10);

    const apres = await creneauxDuMardi();
    expect(contient(apres, prochainMardi(10))).toBe(false);
    // Les autres restent libres : c'est le créneau qui est pris, pas la journée.
    expect(contient(apres, prochainMardi(10, 30))).toBe(true);
    expect(contient(apres, prochainMardi(11))).toBe(true);
  });

  it("il disparaît avant même d'être payé", async () => {
    /*
     * C'est le point de la réservation avant paiement : sans elle, deux clients
     * paieraient le même horaire pendant qu'ils sont chez Stripe.
     */
    const reserve = await reserverA(10);
    expect(reserve.payment_status).toBe("pending");

    const apres = await creneauxDuMardi();
    expect(contient(apres, prochainMardi(10))).toBe(false);
  });

  it("un second client ne peut pas prendre le même créneau", async () => {
    await reserverA(10);

    await expect(
      reserver(tiers, {
        avocatId: avocat.id,
        debut: prochainMardi(10),
        matiere: "fiscalite",
        description: "Question sur la TVA applicable à mon activité.",
        pieces: [],
      })
    ).rejects.toBeInstanceOf(CreneauIndisponible);
  });

  it("une réservation impayée rend le créneau passé le délai", async () => {
    const reserve = await reserverA(10);

    // Le paiement a été abandonné il y a plus longtemps que le délai de tenue.
    await prisma.lawyer_consultations.update({
      where: { id: reserve.id },
      data: {
        created_at: new Date(Date.now() - (RESERVATION_TENUE_MINUTES + 5) * 60_000),
      },
    });

    const apres = await creneauxDuMardi();
    expect(contient(apres, prochainMardi(10))).toBe(true);
  });

  it("une consultation payée le garde, quelle que soit son ancienneté", async () => {
    const reserve = await reserverA(10);
    await prisma.lawyer_consultations.update({
      where: { id: reserve.id },
      data: {
        payment_status: "paid",
        created_at: new Date(Date.now() - 30 * 86_400_000),
      },
    });

    const apres = await creneauxDuMardi();
    expect(contient(apres, prochainMardi(10))).toBe(false);
  });

  it("une réservation abandonnée disparaît de la liste du client", async () => {
    const reserve = await reserverA(10);
    await prisma.lawyer_consultations.update({
      where: { id: reserve.id },
      data: {
        created_at: new Date(Date.now() - (RESERVATION_TENUE_MINUTES + 5) * 60_000),
      },
    });

    // Un panier laissé en route n'est pas un rendez-vous : l'afficher « en attente »
    // ferait croire au client qu'un avocat va le rappeler.
    const liste = await mesConsultations(cliente);
    expect(liste.map((c) => c.id)).not.toContain(reserve.id);
  });

  it("la matière est celle demandée, et le prix est le prix hors taxes", async () => {
    const reserve = await reserverA(10);
    expect(reserve.domain).toBe("droit_societes");
    expect(reserve.topic).toBe("Droit des sociétés");
    expect(reserve.price_cents).toBe(9900);
  });

  it("une matière inventée est refusée", async () => {
    await expect(
      reserver(cliente, {
        avocatId: avocat.id,
        debut: prochainMardi(10),
        matiere: "astrologie",
        description: "Une description suffisamment longue pour passer.",
        pieces: [],
      })
    ).rejects.toMatchObject({ statut: 403 });
  });
});

avecBase("encaissement d'une consultation", () => {
  let cliente: UtilisateurConnecte;
  let avocat: UtilisateurConnecte;

  async function creerCompte(suffixe: string, roles: string[]): Promise<UtilisateurConnecte> {
    const empreinte = hacher("MotDePasseEssai2026!");
    const u = await prisma.users.create({
      data: {
        email: MARQUE + "paiement-" + suffixe + "@exemple.test",
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
    cliente = await creerCompte("cliente", ["user"]);
    avocat = await creerCompte("avocat", ["avocat"]);
    await prisma.avocat_availability.create({
      data: {
        avocat_id: avocat.id,
        day_of_week: 2,
        start_time: "09:00",
        end_time: "12:00",
        slot_duration_minutes: 30,
      },
    });
  });

  beforeEach(async () => {
    await prisma.lawyer_consultations.deleteMany({ where: { avocat_id: avocat.id } });
  });

  afterAll(async () => {
    await prisma.lawyer_consultations.deleteMany({ where: { avocat_id: avocat.id } });
    await prisma.avocat_availability.deleteMany({ where: { avocat_id: avocat.id } });
    await prisma.users.deleteMany({ where: { email: { startsWith: MARQUE + "paiement-" } } });
  });

  async function reserverEtOuvrir(reference: string) {
    const reserve = await reserver(cliente, {
      avocatId: avocat.id,
      debut: prochainMardi(11),
      matiere: "contrats",
      description: "Relecture d'un contrat de prestation avant signature.",
      pieces: [],
    });
    await attacherPaiement(reserve.id, reference);
    return reserve;
  }

  it("l'encaissement marque la consultation payée", async () => {
    const reserve = await reserverEtOuvrir("cs_essai_paye");

    const resultat = await confirmerPaiement({
      reference: "cs_essai_paye",
      consultationId: reserve.id,
      payee: true,
      expiree: false,
    });

    expect(resultat).toEqual({ consultationId: reserve.id, paye: true });
    const relue = await prisma.lawyer_consultations.findUnique({ where: { id: reserve.id } });
    expect(relue?.payment_status).toBe("paid");
  });

  it("le même avis reçu deux fois ne change rien", async () => {
    /*
     * Le webhook et le retour du client peuvent arriver dans n'importe quel ordre, et
     * Stripe réessaie ses avis. Sans idempotence, la seconde écriture serait au mieux
     * inutile, au pire un second encaissement compté.
     */
    const reserve = await reserverEtOuvrir("cs_essai_deux_fois");
    const encaissement = {
      reference: "cs_essai_deux_fois",
      consultationId: reserve.id,
      payee: true,
      expiree: false,
    };

    await confirmerPaiement(encaissement);
    const second = await confirmerPaiement(encaissement);

    expect(second).toEqual({ consultationId: reserve.id, paye: true });
  });

  it("un retour de paiement pour la consultation d'autrui est ignoré", async () => {
    const reserve = await reserverEtOuvrir("cs_essai_autrui");
    const autre = await creerCompte("intruse", ["user"]);

    const resultat = await confirmerPaiement(
      { reference: "cs_essai_autrui", consultationId: reserve.id, payee: true, expiree: false },
      autre.id
    );

    expect(resultat.paye).toBe(false);
    const relue = await prisma.lawyer_consultations.findUnique({ where: { id: reserve.id } });
    expect(relue?.payment_status).toBe("pending");
  });

  it("une session expirée annule la réservation et rend le créneau", async () => {
    const reserve = await reserverEtOuvrir("cs_essai_expire");

    await confirmerPaiement({
      reference: "cs_essai_expire",
      consultationId: reserve.id,
      payee: false,
      expiree: true,
    });

    const relue = await prisma.lawyer_consultations.findUnique({ where: { id: reserve.id } });
    expect(relue?.status).toBe("cancelled");

    const libres = await creneauxDe(avocat.id, prochainMardi(0), prochainMardi(23));
    expect(contient(libres, prochainMardi(11))).toBe(true);
  });

  it("un abandon ne touche pas une consultation déjà payée", async () => {
    const reserve = await reserverEtOuvrir("cs_essai_deja_paye");
    await confirmerPaiement({
      reference: "cs_essai_deja_paye",
      consultationId: reserve.id,
      payee: true,
      expiree: false,
    });

    const resultat = await abandonnerReservation(reserve.id, cliente.id);

    expect(resultat.abandonnee).toBe(false);
    const relue = await prisma.lawyer_consultations.findUnique({ where: { id: reserve.id } });
    expect(relue?.status).toBe("scheduled");
  });

  it("un tiers ne peut pas abandonner la réservation d'un autre", async () => {
    const reserve = await reserverEtOuvrir("cs_essai_abandon_tiers");
    const autre = await creerCompte("abandon-tiers", ["user"]);

    expect((await abandonnerReservation(reserve.id, autre.id)).abandonnee).toBe(false);
  });
});

avecBase("lecture des pièces joignées à une consultation", () => {
  let cliente: UtilisateurConnecte;
  let avocat: UtilisateurConnecte;
  let tiers: UtilisateurConnecte;
  const PIECE = "abcdef0123456789abcdef0123456789.pdf";

  async function creerCompte(suffixe: string, roles: string[]): Promise<UtilisateurConnecte> {
    const empreinte = hacher("MotDePasseEssai2026!");
    const u = await prisma.users.create({
      data: {
        email: MARQUE + "piece-" + suffixe + "@exemple.test",
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
    cliente = await creerCompte("cliente", ["user"]);
    avocat = await creerCompte("avocat", ["avocat"]);
    tiers = await creerCompte("tiers", ["user"]);

    await prisma.lawyer_consultations.create({
      data: {
        user_id: cliente.id,
        avocat_id: avocat.id,
        scheduled_at: prochainMardi(9),
        duration_minutes: 30,
        status: "scheduled",
        payment_status: "paid",
        domain: "contrats",
        documents_json: JSON.stringify([{ fichier: PIECE, nom: "Contrat.pdf" }]),
      },
    });
  });

  afterAll(async () => {
    await prisma.lawyer_consultations.deleteMany({ where: { user_id: cliente.id } });
    await prisma.users.deleteMany({ where: { email: { startsWith: MARQUE + "piece-" } } });
  });

  it("l'avocat de la consultation lit la pièce", async () => {
    /*
     * Sans cette règle, l'avocat verrait le nom du document dans le panneau et
     * recevrait un 404 en cliquant : la pièce n'est rattachée à aucun dossier, et
     * c'est lui qui n'a rien déposé. Or c'est pour lui que le client la joint.
     */
    expect(await fichierLisible(avocat, PIECE)).toBe(PIECE);
  });

  it("la cliente lit la sienne", async () => {
    expect(await fichierLisible(cliente, PIECE)).toBe(PIECE);
  });

  it("un tiers ne la lit pas", async () => {
    expect(await fichierLisible(tiers, PIECE)).toBeNull();
  });

  it("un chemin remontant ne sort pas du dépôt", async () => {
    expect(await fichierLisible(avocat, "../../../etc/passwd")).toBeNull();
  });
});
