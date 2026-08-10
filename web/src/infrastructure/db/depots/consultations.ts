import { prisma } from "../client";
import { Interdit } from "../utilisateur-courant";
import {
  creneauxLibres,
  etatConsultation,
  annulable,
  type PlageHebdomadaire,
} from "@/domain/consultation/creneaux";
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
    select: { id: true, name: true },
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

export async function creneauxDe(avocatId: number, depuis: Date, jusqua: Date) {
  const [plages, bloquees, pris] = await Promise.all([
    prisma.avocat_availability.findMany({ where: { avocat_id: avocatId } }),
    prisma.avocat_blocked_dates.findMany({ where: { avocat_id: avocatId } }),
    prisma.lawyer_consultations.findMany({
      where: {
        avocat_id: avocatId,
        status: { notIn: ["cancelled", "no_show"] },
        scheduled_at: { gte: depuis, lte: jusqua },
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

export async function mesConsultations(utilisateur: UtilisateurConnecte) {
  const lignes = await prisma.lawyer_consultations.findMany({
    where: utilisateur.roles.includes("avocat")
      ? { OR: [{ user_id: utilisateur.id }, { avocat_id: utilisateur.id }] }
      : { user_id: utilisateur.id },
    orderBy: { scheduled_at: "desc" },
    include: { users_lawyer_consultations_avocat_idTousers: { select: { name: true } } },
  });

  return lignes.map((c) => {
    const etat = etatConsultation(c.status);
    return {
      id: c.id,
      debut: c.scheduled_at,
      dureeMinutes: c.duration_minutes ?? 30,
      sujet: c.topic,
      avocat: c.users_lawyer_consultations_avocat_idTousers?.name ?? "Avocat",
      etat,
      annulable: annulable(etat, c.scheduled_at),
      monRendezVous: c.user_id === utilisateur.id,
    };
  });
}

export class CreneauIndisponible extends Error {
  readonly statut = 409;
  constructor() {
    super("Ce créneau vient d'être pris. Choisissez-en un autre.");
    this.name = "CreneauIndisponible";
  }
}

export async function reserver(
  utilisateur: UtilisateurConnecte,
  avocatId: number,
  debut: Date,
  sujet: string,
  description?: string
) {
  // Le créneau est revérifié au moment de réserver : entre l'affichage et le
  // clic, quelqu'un d'autre a pu le prendre.
  const jour = new Date(debut);
  jour.setHours(0, 0, 0, 0);
  const fin = new Date(jour);
  fin.setHours(23, 59, 59, 999);

  const libres = await creneauxDe(avocatId, jour, fin);
  if (!libres.some((c) => c.debut.getTime() === debut.getTime())) {
    throw new CreneauIndisponible();
  }

  return prisma.lawyer_consultations.create({
    data: {
      user_id: utilisateur.id,
      avocat_id: avocatId,
      scheduled_at: debut,
      duration_minutes: 30,
      status: "scheduled",
      topic: sujet.slice(0, 200),
      description: description?.slice(0, 2000) ?? null,
    },
  });
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

  return prisma.lawyer_consultations.update({
    where: { id: consultationId },
    data: { status: "cancelled" },
  });
}
