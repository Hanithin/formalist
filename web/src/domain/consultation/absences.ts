/**
 * Les périodes d'absence, et le calendrier qui sert à les choisir.
 *
 * Une absence se dit en jours entiers, jamais en instants : « du 17 au 24 août » n'a
 * pas d'heure. Elle est donc manipulée en chaînes « 2026-08-17 », et jamais en Date
 * convertie - c'est la seule façon d'éviter le décalage d'un jour qui guette dès
 * qu'un minuit local passe en UTC.
 */

/** « 2026-08-17 », écrit depuis les composantes locales de la date. */
export function enJour(quand: Date): string {
  return (
    quand.getFullYear() +
    "-" +
    String(quand.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(quand.getDate()).padStart(2, "0")
  );
}

/**
 * La Date correspondant à un jour, à midi.
 *
 * Midi et non minuit : un changement d'heure déplace la journée d'une heure, et
 * minuit bascule alors sur la veille ou le lendemain. À midi, aucun décalage
 * saisonnier ne peut faire changer la date de jour.
 */
export function depuisJour(jour: string): Date {
  const [annee, mois, quantieme] = jour.split("-").map(Number);
  return new Date(annee, mois - 1, quantieme, 12, 0, 0, 0);
}

export function jourSuivant(jour: string, decalage = 1): string {
  const d = depuisJour(jour);
  d.setDate(d.getDate() + decalage);
  return enJour(d);
}

/** Le nombre de jours d'une période, bornes comprises. */
export function nombreDeJours(debut: string, fin: string): number {
  const ecart = depuisJour(fin).getTime() - depuisJour(debut).getTime();
  return Math.round(ecart / 86_400_000) + 1;
}

/* ---------- La grille d'un mois ---------- */

export interface CaseDeCalendrier {
  jour: string;
  quantieme: number;
  /** Faux pour les jours du mois précédent ou suivant qui complètent la grille. */
  duMois: boolean;
}

const NOMS_DE_MOIS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

export function nomDuMois(annee: number, mois: number): string {
  return NOMS_DE_MOIS[mois] + " " + annee;
}

/**
 * Les six semaines d'un mois, du lundi au dimanche.
 *
 * La grille est toujours complète : elle déborde sur le mois précédent et le suivant
 * plutôt que de laisser des trous. Une grille dont la hauteur change d'un mois à
 * l'autre fait sauter le contenu qui la suit à chaque navigation.
 */
export function grilleDuMois(annee: number, mois: number): CaseDeCalendrier[] {
  const premier = new Date(annee, mois, 1, 12);
  // getDay() rend 0 pour dimanche ; la semaine commence le lundi.
  const decalage = (premier.getDay() + 6) % 7;

  const debut = new Date(premier);
  debut.setDate(debut.getDate() - decalage);

  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(debut);
    d.setDate(d.getDate() + i);
    return { jour: enJour(d), quantieme: d.getDate(), duMois: d.getMonth() === mois };
  });
}

/* ---------- La période en cours de saisie ---------- */

export interface Periode {
  debut: string;
  fin: string;
}

/**
 * Ce que devient la sélection quand on clique sur un jour.
 *
 * Premier clic : la période commence et finit ce jour-là, ce qui permet de valider
 * une absence d'une seule journée sans second clic. Deuxième clic : il ferme la
 * période, et s'il tombe avant le début, c'est lui qui devient le début - on a
 * simplement désigné les deux bornes dans l'autre sens.
 */
export function choisir(courante: Periode | null, jour: string, fige: boolean): Periode {
  if (!courante || fige) return { debut: jour, fin: jour };
  if (jour < courante.debut) return { debut: jour, fin: courante.debut };
  return { debut: courante.debut, fin: jour };
}

export function dansLaPeriode(jour: string, periode: Periode | null): boolean {
  if (!periode) return false;
  return jour >= periode.debut && jour <= periode.fin;
}

/** Les jours déjà bloqués par une absence enregistrée. */
export function dejaBloque(jour: string, absences: Periode[]): boolean {
  return absences.some((a) => jour >= a.debut && jour <= a.fin);
}

/**
 * Une période qui recouvre une absence déjà posée n'apporte rien.
 *
 * Elle serait acceptée sans dommage - deux absences superposées bloquent les mêmes
 * journées - mais la liste deviendrait illisible, et on ne saurait plus laquelle
 * retirer pour redevenir disponible.
 */
export function recouvre(periode: Periode, absences: Periode[]): boolean {
  return absences.some((a) => periode.debut <= a.fin && a.debut <= periode.fin);
}

/** « Du 17 au 24 août 2026 · 8 jours », ou « Le 17 août 2026 » pour un seul jour. */
export function resumeDePeriode(periode: Periode): string {
  const ecrire = (jour: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("fr-FR", options).format(depuisJour(jour));

  const complet: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "long",
    year: "numeric",
  };

  if (periode.debut === periode.fin) return "Le " + ecrire(periode.debut, complet);

  /*
   * Seule la borne de fin porte le mois et l'année ; celle de début ne répète le mois
   * que si la période en change. « Du 17 au 24 août 2026 » se lit mieux que « du
   * 17 août 2026 au 24 août 2026 », qui dit trois fois la même chose.
   */
  const memeMois = periode.debut.slice(0, 7) === periode.fin.slice(0, 7);
  const debut = ecrire(
    periode.debut,
    memeMois ? { day: "numeric" } : { day: "numeric", month: "long" }
  );

  /* « 1 jours » se lisait sur une absence d'une seule journée. */
  const jours = nombreDeJours(periode.debut, periode.fin);

  return (
    "Du " +
    debut +
    " au " +
    ecrire(periode.fin, complet) +
    " · " +
    jours +
    (jours > 1 ? " jours" : " jour")
  );
}

/* ---------- Les raccourcis ---------- */

export const RACCOURCIS_ABSENCE: { cle: string; libelle: string; jours: number }[] = [
  { cle: "semaine", libelle: "1 semaine", jours: 7 },
  { cle: "deux-semaines", libelle: "2 semaines", jours: 14 },
];

/**
 * La période qu'un raccourci produit, à partir du début déjà choisi.
 *
 * Sans début choisi, il part d'aujourd'hui : le raccourci sert à aller vite, demander
 * un premier clic avant de pouvoir s'en servir le viderait de son intérêt.
 */
export function periodeDuRaccourci(
  jours: number,
  debut: string | null,
  aujourdHui: string
): Periode {
  const depart = debut ?? aujourdHui;
  return { debut: depart, fin: jourSuivant(depart, jours - 1) };
}

/** Le mois entier, tel que l'affiche la grille. */
export function periodeDuMois(annee: number, mois: number): Periode {
  return {
    debut: enJour(new Date(annee, mois, 1, 12)),
    fin: enJour(new Date(annee, mois + 1, 0, 12)),
  };
}
