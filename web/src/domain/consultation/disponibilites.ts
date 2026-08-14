import { enMinutes, type PlageHebdomadaire } from "./creneaux";

/**
 * Les disponibilités que l'avocat publie.
 *
 * Une plage hebdomadaire dit « le mardi, de 9 h à 12 h, par tranches de 30 minutes ».
 * C'est de là que viennent les créneaux proposés au client : sans plage publiée, un
 * avocat n'apparaît nulle part.
 */

export const JOURS = [
  { valeur: 1, nom: "Lundi", court: "Lun" },
  { valeur: 2, nom: "Mardi", court: "Mar" },
  { valeur: 3, nom: "Mercredi", court: "Mer" },
  { valeur: 4, nom: "Jeudi", court: "Jeu" },
  { valeur: 5, nom: "Vendredi", court: "Ven" },
  { valeur: 6, nom: "Samedi", court: "Sam" },
  // Dimanche vaut 0 pour Date.getDay() : il ferme la semaine à l'affichage mais
  // garde sa valeur, sous peine de décaler tous les calculs de créneaux.
  { valeur: 0, nom: "Dimanche", court: "Dim" },
] as const;

export function nomDuJour(jourSemaine: number): string {
  return JOURS.find((j) => j.valeur === jourSemaine)?.nom ?? "";
}

/** Les raccourcis de la fenêtre d'ajout, repris de la page d'origine. */
export const RACCOURCIS: { cle: string; libelle: string; jours: number[] }[] = [
  { cle: "semaine", libelle: "En semaine", jours: [1, 2, 3, 4, 5] },
  { cle: "weekend", libelle: "Week-end", jours: [6, 0] },
  { cle: "tous", libelle: "Tous les jours", jours: [1, 2, 3, 4, 5, 6, 0] },
];

export const DUREES_CRENEAU = [15, 30, 45, 60] as const;

/**
 * Ce qu'un compte avocat reçoit à sa création.
 *
 * Un avocat sans plage publiée n'apparaît nulle part : il est créé, il se connecte,
 * et rien ne se passe côté client sans que personne comprenne pourquoi. Des horaires
 * de bureau par défaut le rendent visible tout de suite, quitte à les ajuster.
 */
export const PLAGES_PAR_DEFAUT: PlageHebdomadaire[] = [1, 2, 3, 4, 5].flatMap((jour) => [
  { jourSemaine: jour, debut: "09:00", fin: "12:00", dureeCreneauMinutes: 30 },
  { jourSemaine: jour, debut: "14:00", fin: "18:00", dureeCreneauMinutes: 30 },
]);

/* ---------- Ce qu'une plage doit respecter ---------- */

export type RefusDePlage =
  "heures-illisibles" | "fin-avant-debut" | "trop-courte" | "chevauchement";

export function messageDeRefus(refus: RefusDePlage): string {
  if (refus === "heures-illisibles") return "Les heures doivent être au format 09:30";
  if (refus === "fin-avant-debut") return "L'heure de fin doit suivre l'heure de début";
  if (refus === "trop-courte") return "La plage est trop courte pour un créneau de cette durée";
  return "Cette plage en chevauche une autre le même jour";
}

/**
 * Deux plages du même jour se chevauchent-elles ?
 *
 * Deux plages qui se touchent bout à bout ne se chevauchent pas : 9 h - 12 h et
 * 12 h - 14 h sont compatibles, c'est la même règle que pour les rendez-vous.
 */
function chevauche(a: PlageHebdomadaire, b: PlageHebdomadaire): boolean {
  if (a.jourSemaine !== b.jourSemaine) return false;

  const aDebut = enMinutes(a.debut);
  const aFin = enMinutes(a.fin);
  const bDebut = enMinutes(b.debut);
  const bFin = enMinutes(b.fin);
  if (aDebut === null || aFin === null || bDebut === null || bFin === null) return false;

  return aDebut < bFin && bDebut < aFin;
}

/**
 * La plage est-elle publiable ?
 *
 * Le chevauchement est refusé ici, dans le domaine, et non dans le navigateur comme
 * le faisait la page d'origine : un contrôle qui vit dans la page se contourne par un
 * appel direct à l'API, et deux plages superposées produisent des créneaux en double
 * qu'un client peut réserver deux fois.
 */
export function refusDePlage(
  nouvelle: PlageHebdomadaire,
  existantes: PlageHebdomadaire[]
): RefusDePlage | null {
  const debut = enMinutes(nouvelle.debut);
  const fin = enMinutes(nouvelle.fin);

  // Une plage incohérente ne produirait aucun créneau, et l'avocat croirait avoir
  // publié ses disponibilités.
  if (debut === null || fin === null) return "heures-illisibles";
  if (fin <= debut) return "fin-avant-debut";
  if (nouvelle.dureeCreneauMinutes <= 0 || fin - debut < nouvelle.dureeCreneauMinutes) {
    return "trop-courte";
  }
  if (existantes.some((e) => chevauche(e, nouvelle))) return "chevauchement";

  return null;
}

/** Les plages rangées par jour, dans l'ordre de la semaine puis de l'horaire. */
export function parJournee<T extends PlageHebdomadaire>(
  plages: T[]
): { jour: number; nom: string; plages: T[] }[] {
  return JOURS.map((j) => ({
    jour: j.valeur,
    nom: j.nom,
    plages: plages
      .filter((p) => p.jourSemaine === j.valeur)
      .sort((a, b) => (enMinutes(a.debut) ?? 0) - (enMinutes(b.debut) ?? 0)),
  })).filter((j) => j.plages.length > 0);
}
