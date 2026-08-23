/**
 * Les dates d'une fermeture, et celles qu'il ne faut pas manquer.
 *
 * Une fermeture est une suite de délais, dont deux se calculent au jour près :
 *
 *   - le délai d'opposition des créanciers en cas de dissolution sans liquidation. La
 *     transmission du patrimoine n'est acquise qu'à son terme, et une radiation demandée
 *     un jour trop tôt est refusée ;
 *   - la durée du mandat du liquidateur, qui ne peut dépasser trois ans.
 *
 * Le premier obéit à une règle de computation que personne ne fait de tête. Depuis le
 * décret n° 2024-751 du 7 juillet 2024, il court à compter de la publication au BODACC
 * et non plus de l'annonce dans un journal d'annonces légales : le point de départ a
 * changé le 1er octobre 2024, et la plupart des modèles en circulation ne l'ont pas
 * intégré.
 */

/** Les jours de la semaine où rien n'expire. */
function estWeekEnd(date: Date): boolean {
  const jour = date.getUTCDay();
  return jour === 0 || jour === 6;
}

/**
 * Le lundi de Pâques, dont dépendent l'Ascension et la Pentecôte.
 *
 * Algorithme de Butcher, en calendrier grégorien. Trois fêtes mobiles sur onze jours
 * fériés : les coder en dur sur une année ferait dériver le calcul dès la suivante.
 */
function paques(annee: number): Date {
  const a = annee % 19;
  const b = Math.floor(annee / 100);
  const c = annee % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31);
  const jour = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(annee, mois - 1, jour));
}

function decaler(date: Date, jours: number): Date {
  const suite = new Date(date);
  suite.setUTCDate(suite.getUTCDate() + jours);
  return suite;
}

function cle(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Les onze jours fériés légaux d'une année, article L. 3133-1 du code du travail. */
export function joursFeries(annee: number): string[] {
  const lundiDePaques = decaler(paques(annee), 1);
  return [
    cle(new Date(Date.UTC(annee, 0, 1))), // Jour de l'an
    cle(lundiDePaques),
    cle(new Date(Date.UTC(annee, 4, 1))), // Fête du travail
    cle(new Date(Date.UTC(annee, 4, 8))), // Victoire 1945
    cle(decaler(paques(annee), 39)), // Ascension
    cle(decaler(paques(annee), 50)), // Lundi de Pentecôte
    cle(new Date(Date.UTC(annee, 6, 14))), // Fête nationale
    cle(new Date(Date.UTC(annee, 7, 15))), // Assomption
    cle(new Date(Date.UTC(annee, 10, 1))), // Toussaint
    cle(new Date(Date.UTC(annee, 10, 11))), // Armistice 1918
    cle(new Date(Date.UTC(annee, 11, 25))), // Noël
  ];
}

export function estFerie(date: Date): boolean {
  return joursFeries(date.getUTCFullYear()).includes(cle(date));
}

/**
 * Le jour ouvrable suivant, s'il le faut.
 *
 * Article 642 du code de procédure civile : un délai qui expirerait un samedi, un
 * dimanche, un jour férié ou chômé est prorogé jusqu'au premier jour ouvrable suivant.
 */
export function prorogerAuJourOuvrable(date: Date): Date {
  let jour = new Date(date);
  while (estWeekEnd(jour) || estFerie(jour)) jour = decaler(jour, 1);
  return jour;
}

export interface DelaiDOpposition {
  /** La date de parution au BODACC, telle qu'elle a été saisie. */
  publicationLe: string;
  /** Le dernier jour où une opposition reste recevable. */
  expireLe: string;
  /** Le jour où la transmission du patrimoine est acquise. */
  transmissionLe: string;
  /** Le délai a-t-il été prorogé, et pourquoi. */
  prorogation: string | null;
  /** Combien de jours restent à courir, à la date de référence. */
  joursRestants: number;
  /** Le délai est-il écoulé ? */
  ecoule: boolean;
}

/** Les créanciers ont trente jours pour s'opposer à la dissolution sans liquidation. */
export const JOURS_D_OPPOSITION = 30;

/**
 * Le calcul du délai d'opposition, tel que le greffe le fait.
 *
 * Le premier jour se compte au lendemain de la parution. Le délai expire le trentième
 * jour à vingt-quatre heures, et la transmission se réalise le jour suivant. Si ce
 * trentième jour tombe un samedi, un dimanche ou un férié, il glisse au premier jour
 * ouvrable - et la transmission avec lui.
 */
export function delaiDOpposition(
  publicationBodacc: string | null | undefined,
  aujourdHui: Date = new Date()
): DelaiDOpposition | null {
  const brut = (publicationBodacc ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(brut)) return null;

  const publication = new Date(brut + "T00:00:00Z");
  if (Number.isNaN(publication.getTime())) return null;

  const theorique = decaler(publication, JOURS_D_OPPOSITION);
  const expire = prorogerAuJourOuvrable(theorique);
  const transmission = decaler(expire, 1);

  const reference = new Date(
    Date.UTC(aujourdHui.getUTCFullYear(), aujourdHui.getUTCMonth(), aujourdHui.getUTCDate())
  );
  const joursRestants = Math.ceil(
    (expire.getTime() - reference.getTime()) / 86_400_000
  );

  return {
    publicationLe: brut,
    expireLe: cle(expire),
    transmissionLe: cle(transmission),
    prorogation:
      cle(expire) === cle(theorique)
        ? null
        : "Le trentième jour tombait un " +
          new Intl.DateTimeFormat("fr-FR", { weekday: "long", timeZone: "UTC" }).format(theorique) +
          (estFerie(theorique) ? " férié" : "") +
          " : le délai est reporté au premier jour ouvrable suivant, en application de l'article 642 du code de procédure civile.",
    joursRestants: Math.max(0, joursRestants),
    ecoule: reference.getTime() > expire.getTime(),
  };
}

/** Le terme du mandat du liquidateur : trois ans, jour pour jour. */
export function termeDuMandat(dateDissolution: string | null | undefined): string | null {
  const brut = (dateDissolution ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(brut)) return null;

  const debut = new Date(brut + "T00:00:00Z");
  if (Number.isNaN(debut.getTime())) return null;

  const terme = new Date(debut);
  terme.setUTCFullYear(terme.getUTCFullYear() + 3);
  return cle(terme);
}

/**
 * Les échéances déclaratives que la fermeture déclenche.
 *
 * Elles ne passent pas par nous - elles se déposent aux impôts - mais les manquer coûte
 * des pénalités, et personne ne les rappelle au dirigeant. On les affiche donc avec
 * leur date, calculée depuis la clôture.
 */
export interface Echeance {
  intitule: string;
  /** La date limite, quand elle se calcule. */
  limite: string | null;
  explication: string;
  fondement: string;
}

function apres(depart: string | null | undefined, jours: number): string | null {
  const brut = (depart ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(brut)) return null;
  const date = new Date(brut + "T00:00:00Z");
  return Number.isNaN(date.getTime()) ? null : cle(decaler(date, jours));
}

export function echeancesFiscales(args: {
  /** La date de la dissolution, qui vaut cessation d'activité. */
  dateDissolution?: string | null;
  /** Le régime de TVA, qui change le délai de la dernière déclaration. */
  tvaAuReelNormal?: boolean;
}): Echeance[] {
  return [
    {
      intitule: "Déclaration de résultats de cessation",
      limite: apres(args.dateDissolution, 60),
      explication:
        "Le résultat de la période écoulée depuis la dernière clôture s'impose immédiatement. La déclaration se dépose dans les soixante jours de la cessation.",
      fondement: "Article 201 du code général des impôts",
    },
    {
      intitule: "Dernière déclaration de TVA",
      limite: apres(args.dateDissolution, args.tvaAuReelNormal ? 30 : 60),
      explication: args.tvaAuReelNormal
        ? "Au réel normal, la dernière CA3 se dépose dans les trente jours de la cessation."
        : "Au réel simplifié, la dernière CA12 se dépose dans les soixante jours de la cessation.",
      fondement: "Articles 287 et 242 sexies de l'annexe II du code général des impôts",
    },
    {
      intitule: "Cotisation foncière des entreprises",
      limite: null,
      explication:
        "La CFE reste due pour l'année entière, mais un dégrèvement au prorata peut être demandé au service des impôts des entreprises lorsque l'activité cesse en cours d'année.",
      fondement: "Article 1478 du code général des impôts",
    },
  ];
}
