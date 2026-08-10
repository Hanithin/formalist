import { prisma } from "../client";
import { Interdit } from "../utilisateur-courant";
import {
  creneauxLibres,
  etatConsultation,
  annulable,
  enMinutes,
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
