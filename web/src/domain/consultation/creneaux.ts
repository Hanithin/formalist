/**
 * Calcul des créneaux de rendez-vous.
 *
 * Le serveur d'origine renvoyait les disponibilités brutes et laissait le
 * navigateur en déduire les créneaux. Deux écrans le faisaient chacun de son
 * côté, et rien ne garantissait qu'un créneau proposé soit encore libre. Le
 * calcul se fait ici, une fois, et se teste sans rien démarrer.
 *
 * Toutes les heures sont exprimées en minutes depuis minuit, dans le fuseau de
 * l'avocat : comparer des chaînes « 09:30 » marche par hasard tant que le format
 * ne bouge pas.
 */

export interface PlageHebdomadaire {
  /** 0 = dimanche, comme Date.getDay(). */
  jourSemaine: number;
  debut: string;
  fin: string;
  dureeCreneauMinutes: number;
}

export interface PeriodeBloquee {
  debut: Date;
  fin: Date;
}

export interface RendezVousPris {
  debut: Date;
  dureeMinutes: number;
}

export interface Creneau {
  debut: Date;
  fin: Date;
}

/** « 09:30 » vers 570. Rend null si la forme n'est pas reconnue. */
export function enMinutes(heure: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(heure.trim());
  if (!m) return null;

  const heures = Number(m[1]);
  const minutes = Number(m[2]);
  if (heures > 23 || minutes > 59) return null;

  return heures * 60 + minutes;
}

function memeJour(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function chevauche(a: Creneau, b: Creneau): boolean {
  // Deux rendez-vous qui se touchent bout à bout ne se chevauchent pas : 9h-10h
  // et 10h-11h sont compatibles.
  return a.debut < b.fin && b.debut < a.fin;
}

function estBloque(jour: Date, periodes: PeriodeBloquee[]): boolean {
  return periodes.some((p) => {
    const debutJour = new Date(jour);
    debutJour.setHours(0, 0, 0, 0);
    return debutJour >= new Date(p.debut.toDateString()) && debutJour <= new Date(p.fin.toDateString());
  });
}

/**
 * Les créneaux libres sur une période.
 *
 * @param depuis premier jour considéré, inclus
 * @param jusqua dernier jour considéré, inclus
 * @param maintenant les créneaux déjà passés ne sont jamais proposés
 */
export function creneauxLibres(
  plages: PlageHebdomadaire[],
  bloquees: PeriodeBloquee[],
  pris: RendezVousPris[],
  depuis: Date,
  jusqua: Date,
  maintenant: Date = new Date()
): Creneau[] {
  const libres: Creneau[] = [];

  const occupes: Creneau[] = pris.map((r) => ({
    debut: r.debut,
    fin: new Date(r.debut.getTime() + r.dureeMinutes * 60_000),
  }));

  const jour = new Date(depuis);
  jour.setHours(0, 0, 0, 0);

  const dernier = new Date(jusqua);
  dernier.setHours(23, 59, 59, 999);

  while (jour <= dernier) {
    if (!estBloque(jour, bloquees)) {
      for (const plage of plages.filter((p) => p.jourSemaine === jour.getDay())) {
        const debut = enMinutes(plage.debut);
        const fin = enMinutes(plage.fin);
        const duree = plage.dureeCreneauMinutes;

        // Une plage mal saisie ne doit pas produire de créneaux absurdes, ni
        // faire tourner la boucle indéfiniment.
        if (debut === null || fin === null || duree <= 0 || fin <= debut) continue;

        for (let minute = debut; minute + duree <= fin; minute += duree) {
          const debutCreneau = new Date(jour);
          debutCreneau.setHours(0, minute, 0, 0);
          const creneau = {
            debut: debutCreneau,
            fin: new Date(debutCreneau.getTime() + duree * 60_000),
          };

          if (creneau.debut <= maintenant) continue;
          if (occupes.some((o) => chevauche(creneau, o))) continue;

          libres.push(creneau);
        }
      }
    }

    jour.setDate(jour.getDate() + 1);
  }

  return libres.sort((a, b) => a.debut.getTime() - b.debut.getTime());
}

/** Regroupe par journée, pour un affichage par colonne. */
export function grouperParJournee(creneaux: Creneau[]): { jour: Date; creneaux: Creneau[] }[] {
  const journees: { jour: Date; creneaux: Creneau[] }[] = [];

  for (const creneau of creneaux) {
    const existante = journees.find((j) => memeJour(j.jour, creneau.debut));
    if (existante) existante.creneaux.push(creneau);
    else journees.push({ jour: new Date(creneau.debut), creneaux: [creneau] });
  }

  return journees;
}

export type EtatConsultation = "demandee" | "confirmee" | "faite" | "annulee";

export function etatConsultation(brut: string | null): EtatConsultation {
  if (brut === "done") return "faite";
  if (brut === "cancelled" || brut === "no_show") return "annulee";
  if (brut === "scheduled") return "confirmee";
  return "demandee";
}

export function libelleConsultation(etat: EtatConsultation): string {
  if (etat === "confirmee") return "Confirmé";
  if (etat === "faite") return "Terminé";
  if (etat === "annulee") return "Annulé";
  return "En attente de confirmation";
}

/** Un rendez-vous s'annule tant qu'il n'a pas eu lieu. */
export function annulable(etat: EtatConsultation, debut: Date, maintenant: Date = new Date()): boolean {
  if (etat === "faite" || etat === "annulee") return false;
  return debut.getTime() > maintenant.getTime();
}
