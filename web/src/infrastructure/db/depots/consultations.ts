import { prisma } from "../client";
import { Interdit } from "../utilisateur-courant";
import {
  creneauxLibres,
  etatConsultation,
  etatAffiche,
  annulable,
  enMinutes,
  type PlageHebdomadaire,
} from "@/domain/consultation/creneaux";
import {
  etatPaiement,
  EN_BASE,
  remboursementAutomatique,
  remboursable,
  RESERVATION_TENUE_MINUTES,
} from "@/domain/consultation/paiement";
import { lirePieces, ecrirePieces, type PieceJointe } from "@/domain/consultation/pieces";
import { matiereValide, nomDeMatiere } from "@/domain/consultation/matieres";
import { PRIX_HT_CENTIMES, DUREE_MINUTES } from "@/domain/consultation/offre";
import { rembourser } from "@/infrastructure/paiement/stripe";
import { journal } from "@/lib/journal";
import type { UtilisateurConnecte } from "../sessions";

/**
 * Rendez-vous avec un avocat.
 *
 * Le calcul des créneaux vit dans le domaine ; ce module lit les disponibilités
 * et écrit les réservations.
 */

export async function avocatsDisponibles() {
  const avocats = await prisma.users.findMany({
    where: { role: "avocat", suspended: false },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });

  // Un avocat sans disponibilité déclarée ne serait proposé que pour aboutir à
  // une liste de créneaux vide.
  const avecPlages = await prisma.avocat_availability.groupBy({
    by: ["avocat_id"],
    where: { avocat_id: { in: avocats.map((a) => a.id) } },
  });
  const ouverts = new Set(avecPlages.map((p) => p.avocat_id));

  return avocats.filter((a) => ouverts.has(a.id));
}

/**
 * Depuis quand une réservation impayée ne tient plus son créneau.
 *
 * La consultation est créée avant d'être payée, pour retirer le créneau des
 * disponibilités pendant que le client est sur la page de Stripe. Un paiement
 * abandonné laisserait sinon le créneau bloqué indéfiniment.
 */
function seuilDeTenue(maintenant: Date = new Date()): Date {
  return new Date(maintenant.getTime() - RESERVATION_TENUE_MINUTES * 60_000);
}

export async function creneauxDe(avocatId: number, depuis: Date, jusqua: Date) {
  const [plages, bloquees, pris] = await Promise.all([
    prisma.avocat_availability.findMany({ where: { avocat_id: avocatId } }),
    prisma.avocat_blocked_dates.findMany({ where: { avocat_id: avocatId } }),
    prisma.lawyer_consultations.findMany({
      where: {
        avocat_id: avocatId,
        status: { notIn: ["cancelled", "no_show"] },
        scheduled_at: { gte: depuis, lte: jusqua },
        // Un créneau reste pris s'il est payé, ou si le paiement est encore en
        // cours. Passé le délai, la réservation abandonnée le rend.
        OR: [{ payment_status: EN_BASE.paye }, { created_at: { gte: seuilDeTenue() } }],
      },
      select: { scheduled_at: true, duration_minutes: true },
    }),
  ]);

  const hebdomadaires: PlageHebdomadaire[] = plages.map((p) => ({
    jourSemaine: p.day_of_week,
    debut: p.start_time,
    fin: p.end_time,
    dureeCreneauMinutes: p.slot_duration_minutes,
  }));

  return creneauxLibres(
    hebdomadaires,
    bloquees.map((b) => ({ debut: new Date(b.start_date), fin: new Date(b.end_date) })),
    pris.map((c) => ({ debut: c.scheduled_at, dureeMinutes: c.duration_minutes ?? 30 })),
    depuis,
    jusqua
  );
}

export interface ConsultationVue {
  id: number;
  debut: Date;
  dureeMinutes: number;
  matiere: string | null;
  sujet: string | null;
  description: string | null;
  pieces: PieceJointe[];
  avocat: string;
  lienVisio: string | null;
  compteRendu: string | null;
  prixHtCentimes: number;
  etat: ReturnType<typeof etatConsultation>;
  etatAffiche: ReturnType<typeof etatAffiche>;
  paiement: ReturnType<typeof etatPaiement>;
  annulable: boolean;
  remboursementAutomatique: boolean;
  monRendezVous: boolean;
}

export async function mesConsultations(
  utilisateur: UtilisateurConnecte,
  maintenant: Date = new Date()
): Promise<ConsultationVue[]> {
  const lignes = await prisma.lawyer_consultations.findMany({
    where: utilisateur.roles.includes("avocat")
      ? { OR: [{ user_id: utilisateur.id }, { avocat_id: utilisateur.id }] }
      : { user_id: utilisateur.id },
    orderBy: { scheduled_at: "desc" },
    include: { users_lawyer_consultations_avocat_idTousers: { select: { name: true } } },
  });

  return lignes
    .filter((c) => {
      /*
       * Une réservation dont le paiement a été abandonné n'est pas une consultation :
       * c'est un panier laissé en route. L'afficher « en attente » ferait croire au
       * client qu'un rendez-vous l'attend, alors que le créneau est déjà rendu.
       *
       * La session de paiement expire avec le même délai : un paiement ne peut donc
       * pas aboutir après coup et faire réapparaître la ligne.
       */
      const paiement = etatPaiement(c.payment_status);
      const enCours = etatConsultation(c.status) !== "annulee";
      return !(enCours && paiement === "attente" && c.created_at < seuilDeTenue(maintenant));
    })
    .map((c) => {
      const etat = etatConsultation(c.status);
      const vue = etatAffiche({ etat, lienVisio: c.meeting_link });

      return {
        id: c.id,
        debut: c.scheduled_at,
        dureeMinutes: c.duration_minutes ?? DUREE_MINUTES,
        matiere: c.domain,
        sujet: c.topic,
        description: c.description,
        pieces: lirePieces(c.documents_json),
        avocat: c.users_lawyer_consultations_avocat_idTousers?.name ?? "Avocat",
        lienVisio: c.meeting_link,
        // Le compte-rendu n'a de sens qu'une fois la consultation faite.
        compteRendu: etat === "faite" ? c.notes : null,
        prixHtCentimes: c.price_cents ?? PRIX_HT_CENTIMES,
        etat,
        etatAffiche: vue,
        paiement: etatPaiement(c.payment_status),
        annulable: annulable(etat, c.scheduled_at, maintenant),
        remboursementAutomatique: remboursementAutomatique(c.scheduled_at, maintenant),
        monRendezVous: c.user_id === utilisateur.id,
      };
    });
}

/**
 * Disponibilités d'un avocat.
 *
 * Sans elles, aucun créneau n'est proposé et la prise de rendez-vous ne sert à
 * rien. Un avocat ne gère que les siennes.
 */
function exigerAvocat(utilisateur: UtilisateurConnecte) {
  if (!utilisateur.roles.includes("avocat") && !utilisateur.roles.includes("admin")) {
    throw new Interdit("Réservé aux avocats");
  }
}

export async function mesDisponibilites(utilisateur: UtilisateurConnecte) {
  exigerAvocat(utilisateur);

  const [plages, absences] = await Promise.all([
    prisma.avocat_availability.findMany({
      where: { avocat_id: utilisateur.id },
      orderBy: [{ day_of_week: "asc" }, { start_time: "asc" }],
    }),
    prisma.avocat_blocked_dates.findMany({
      where: { avocat_id: utilisateur.id },
      orderBy: { start_date: "asc" },
    }),
  ]);

  return { plages, absences };
}

export async function ajouterPlage(
  utilisateur: UtilisateurConnecte,
  plage: { jourSemaine: number; debut: string; fin: string; dureeCreneauMinutes: number }
) {
  exigerAvocat(utilisateur);

  const debut = enMinutes(plage.debut);
  const fin = enMinutes(plage.fin);

  // Une plage incohérente ne produirait aucun créneau, et l'avocat croirait
  // avoir publié ses disponibilités.
  if (debut === null || fin === null) {
    throw new Interdit("Les heures doivent être au format 09:30");
  }
  if (fin <= debut) {
    throw new Interdit("L'heure de fin doit suivre l'heure de début");
  }
  if (plage.dureeCreneauMinutes <= 0 || fin - debut < plage.dureeCreneauMinutes) {
    throw new Interdit("La plage est trop courte pour un créneau de cette durée");
  }

  return prisma.avocat_availability.create({
    data: {
      avocat_id: utilisateur.id,
      day_of_week: plage.jourSemaine,
      start_time: plage.debut,
      end_time: plage.fin,
      slot_duration_minutes: plage.dureeCreneauMinutes,
    },
  });
}

export async function retirerPlage(utilisateur: UtilisateurConnecte, plageId: number) {
  exigerAvocat(utilisateur);

  const plage = await prisma.avocat_availability.findUnique({ where: { id: plageId } });
  if (!plage || plage.avocat_id !== utilisateur.id) {
    throw new Interdit("Cette plage n'existe pas ou ne vous appartient pas");
  }

  await prisma.avocat_availability.delete({ where: { id: plageId } });
  return { retiree: plageId };
}

/** Période d'absence : congés, formation, indisponibilité. */
export async function ajouterAbsence(
  utilisateur: UtilisateurConnecte,
  absence: { debut: string; fin: string; motif?: string }
) {
  exigerAvocat(utilisateur);

  if (absence.fin < absence.debut) {
    throw new Interdit("La date de fin précède la date de début");
  }

  return prisma.avocat_blocked_dates.create({
    data: {
      avocat_id: utilisateur.id,
      start_date: absence.debut,
      end_date: absence.fin,
      reason: absence.motif?.slice(0, 200) ?? null,
    },
  });
}

export async function retirerAbsence(utilisateur: UtilisateurConnecte, absenceId: number) {
  exigerAvocat(utilisateur);

  const absence = await prisma.avocat_blocked_dates.findUnique({ where: { id: absenceId } });
  if (!absence || absence.avocat_id !== utilisateur.id) {
    throw new Interdit("Cette absence n'existe pas ou ne vous appartient pas");
  }

  await prisma.avocat_blocked_dates.delete({ where: { id: absenceId } });
  return { retiree: absenceId };
}

/** L'avocat marque un rendez-vous comme honoré. */
export async function marquerFait(utilisateur: UtilisateurConnecte, consultationId: number) {
  exigerAvocat(utilisateur);

  const consultation = await prisma.lawyer_consultations.findUnique({
    where: { id: consultationId },
  });
  if (!consultation || (consultation.avocat_id !== utilisateur.id && !utilisateur.roles.includes("admin"))) {
    throw new Interdit("Ce rendez-vous n'existe pas ou ne vous est pas accessible");
  }

  return prisma.lawyer_consultations.update({
    where: { id: consultationId },
    data: { status: "done", done_at: new Date() },
  });
}

export class CreneauIndisponible extends Error {
  readonly statut = 409;
  constructor() {
    super("Ce créneau vient d'être pris. Choisissez-en un autre.");
    this.name = "CreneauIndisponible";
  }
}

export interface DemandeDeConsultation {
  avocatId: number;
  debut: Date;
  matiere: string;
  description: string;
  pieces: PieceJointe[];
}

/**
 * Réserve un créneau, avant paiement.
 *
 * La ligne est créée en « paiement en attente » : c'est elle qui retire le créneau
 * des disponibilités le temps que le client paie. Sans cela, deux clients
 * paieraient le même horaire et l'un des deux serait remboursé après coup.
 */
export async function reserver(
  utilisateur: UtilisateurConnecte,
  demande: DemandeDeConsultation
) {
  const matiere = matiereValide(demande.matiere);
  if (!matiere) {
    throw new Interdit("Choisissez une matière juridique");
  }

  // Le créneau est revérifié au moment de réserver : entre l'affichage et le
  // clic, quelqu'un d'autre a pu le prendre.
  const jour = new Date(demande.debut);
  jour.setHours(0, 0, 0, 0);
  const fin = new Date(jour);
  fin.setHours(23, 59, 59, 999);

  const libres = await creneauxDe(demande.avocatId, jour, fin);
  if (!libres.some((c) => c.debut.getTime() === demande.debut.getTime())) {
    throw new CreneauIndisponible();
  }

  return prisma.lawyer_consultations.create({
    data: {
      user_id: utilisateur.id,
      avocat_id: demande.avocatId,
      scheduled_at: demande.debut,
      duration_minutes: DUREE_MINUTES,
      status: "scheduled",
      // topic garde le nom de la matière : les écrans de l'avocat le lisent, et une
      // clé technique y serait illisible.
      topic: nomDeMatiere(matiere),
      domain: matiere,
      description: demande.description.slice(0, 2000),
      documents_json: ecrirePieces(demande.pieces),
      price_cents: PRIX_HT_CENTIMES,
      payment_status: EN_BASE.attente,
    },
  });
}

/* ---------- Le paiement ---------- */

/** Rattache la session de paiement à la consultation, une fois Stripe interrogé. */
export async function attacherPaiement(consultationId: number, reference: string) {
  return prisma.lawyer_consultations.update({
    where: { id: consultationId },
    data: { payment_ref: reference },
  });
}

/**
 * Abandonne une réservation dont le paiement n'a pas abouti.
 *
 * Appelée quand la création de la session échoue, et au retour d'un paiement
 * abandonné : le créneau est rendu tout de suite plutôt qu'au bout du délai.
 */
export async function abandonnerReservation(consultationId: number, utilisateurId?: number) {
  const consultation = await prisma.lawyer_consultations.findUnique({
    where: { id: consultationId },
  });
  if (!consultation) return { abandonnee: false };

  // Seul un paiement encore en attente s'abandonne : une consultation payée ne se
  // supprime pas par un retour de navigateur.
  if (etatPaiement(consultation.payment_status) !== "attente") return { abandonnee: false };
  if (utilisateurId !== undefined && consultation.user_id !== utilisateurId) {
    return { abandonnee: false };
  }

  await prisma.lawyer_consultations.update({
    where: { id: consultationId },
    data: { status: "cancelled" },
  });
  return { abandonnee: true };
}

/**
 * Enregistre un encaissement.
 *
 * Appelée par le webhook et au retour du client, qui peuvent arriver dans n'importe
 * quel ordre : la fonction est donc idempotente, et un second appel ne fait rien.
 * La session est retrouvée par sa référence, qui est unique en base.
 */
export async function confirmerPaiement(
  encaissement: {
    reference: string;
    consultationId: number | null;
    payee: boolean;
    expiree: boolean;
  },
  /**
   * Au retour du client, la consultation doit être la sienne : la référence de
   * session vient de l'adresse, et une adresse se recopie. Le webhook, lui, parle
   * pour Stripe et n'a pas d'utilisateur.
   */
  utilisateurId?: number
) {
  const consultation = await prisma.lawyer_consultations.findFirst({
    where: encaissement.consultationId
      ? { OR: [{ payment_ref: encaissement.reference }, { id: encaissement.consultationId }] }
      : { payment_ref: encaissement.reference },
  });

  if (!consultation) {
    journal.warn({ session: encaissement.reference }, "Encaissement sans consultation");
    return { consultationId: null, paye: false };
  }

  if (utilisateurId !== undefined && consultation.user_id !== utilisateurId) {
    journal.warn({ session: encaissement.reference }, "Retour de paiement pour autrui, ignoré");
    return { consultationId: null, paye: false };
  }

  if (etatPaiement(consultation.payment_status) === "paye") {
    return { consultationId: consultation.id, paye: true };
  }

  if (encaissement.payee) {
    await prisma.lawyer_consultations.update({
      where: { id: consultation.id },
      data: { payment_status: EN_BASE.paye, payment_ref: encaissement.reference },
    });
    return { consultationId: consultation.id, paye: true };
  }

  if (encaissement.expiree) {
    // La session a expiré sans paiement : le créneau est rendu explicitement, sans
    // attendre que le délai le fasse.
    await prisma.lawyer_consultations.update({
      where: { id: consultation.id },
      data: { status: "cancelled", payment_status: EN_BASE.echoue },
    });
  }

  return { consultationId: consultation.id, paye: false };
}

export async function annuler(utilisateur: UtilisateurConnecte, consultationId: number) {
  const consultation = await prisma.lawyer_consultations.findUnique({
    where: { id: consultationId },
  });

  // Ni le client ni l'avocat concernés : on ne dit pas que le rendez-vous existe.
  if (
    !consultation ||
    (consultation.user_id !== utilisateur.id &&
      consultation.avocat_id !== utilisateur.id &&
      !utilisateur.roles.includes("admin"))
  ) {
    throw new Interdit("Ce rendez-vous n'existe pas ou ne vous est pas accessible");
  }

  const etat = etatConsultation(consultation.status);
  if (!annulable(etat, consultation.scheduled_at)) {
    throw new Interdit("Ce rendez-vous ne peut plus être annulé");
  }

  /*
   * Le remboursement suit la promesse faite au client dans le panneau de détail :
   * annulé plus de 24 h avant, le rendez-vous est remboursé. En deçà, il s'annule
   * mais n'est pas remboursé d'office - et l'interface l'annonce avant d'annuler,
   * plutôt que de promettre un remboursement qui n'arriverait pas.
   *
   * Le remboursement passe avant l'annulation : si Stripe refuse, le rendez-vous
   * reste en place et le client peut réessayer. L'inverse annulerait sans rendre
   * l'argent.
   */
  const paiement = etatPaiement(consultation.payment_status);
  const aRembourser =
    remboursable(paiement) &&
    remboursementAutomatique(consultation.scheduled_at) &&
    consultation.payment_ref !== null;

  let rembourse = false;
  if (aRembourser && consultation.payment_ref) {
    const resultat = await rembourser(consultation.payment_ref);
    rembourse = resultat.rembourse;
  }

  await prisma.lawyer_consultations.update({
    where: { id: consultationId },
    data: {
      status: "cancelled",
      payment_status: rembourse ? EN_BASE.rembourse : consultation.payment_status,
    },
  });

  return { annulee: true, rembourse, remboursementAttendu: aRembourser };
}
