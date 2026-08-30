/**
 * La lecture d'un dossier du côté du cabinet.
 *
 * L'avocat ne suit pas les mêmes étapes que le client : une fois le dossier
 * transmis, tout se joue dans la sous-phase 5a-5e, qui dit où en est le travail
 * du cabinet. Porté de public/avocat.html, où le tableau, les compteurs et les
 * filtres recalculaient chacun leur version.
 */

import { avecArticle } from "./cabinet";

export type Teinte = "orange" | "blue" | "green" | "gray";

export interface DossierCabinet {
  status: string | null;
  phase: number;
  sousPhase: string | null;
  creePar: "avocat" | "client";
  /**
   * Le dossier est proposé au cabinet et personne ne l'a pris.
   *
   * Il vaut la peine d'être dit avant tout le reste : c'est le seul état qui appelle un
   * geste immédiat, et sans lui la colonne annonçait « En traitement » sur un dossier
   * que personne ne traitait.
   */
  libre?: boolean;
  /**
   * Le dossier est assigné à celui qui regarde la liste.
   *
   * Rien ne permettait de retrouver ce qu'on avait accepté de réviser : les dossiers
   * pris se mêlaient à ceux de tout le cabinet sous « Tous », et il fallait les
   * reconnaître à leur nom.
   */
  monDossier?: boolean;
}

const SOUS_PHASES: Record<string, { libelle: string; teinte: Teinte }> = {
  "5a": { libelle: "Transmis", teinte: "orange" },
  "5b": { libelle: "Révision", teinte: "orange" },
  "5c": { libelle: "Vérifié", teinte: "blue" },
  "5d": { libelle: "Dépôt", teinte: "blue" },
  /*
   * La dernière étape se dit « Terminé », non « KBIS ».
   *
   * Le greffe ne délivre un Kbis qu'à une immatriculation : un dépôt de comptes reçoit
   * un récépissé, une fermeture une attestation de radiation, et un dossier terminé
   * s'affichait pourtant « KBIS ». Ce qui compte à cette étape n'est pas le nom du
   * document, c'est que le travail est fini.
   */
  "5e": { libelle: "Terminé", teinte: "green" },
};

/** Où en est le travail du cabinet, en un mot et une teinte. */
export function etatCabinet(dossier: DossierCabinet): { libelle: string; teinte: Teinte } {
  /*
   * Un dossier que personne n'a pris se dit d'abord.
   *
   * Il affichait « En traitement », l'état de tout dossier réglé : rien ne distinguait
   * celui qu'un autre avocat révise de celui qui attend qu'on le prenne, et il fallait
   * ouvrir le panneau de chaque ligne pour savoir laquelle portait le bouton.
   */
  if (dossier.libre && dossier.status !== "terminee") {
    return { libelle: "À prendre", teinte: "orange" };
  }

  const connue = dossier.sousPhase ? SOUS_PHASES[dossier.sousPhase] : undefined;
  if (connue) return connue;

  if (dossier.status === "terminee") return { libelle: "Terminé", teinte: "green" };
  if (dossier.phase >= 5) return { libelle: "En traitement", teinte: "blue" };
  // Tant que le client complète, il n'y a rien à vérifier.
  return { libelle: "Côté client", teinte: "gray" };
}

/* ---------- L'avancement du travail du cabinet ---------- */

export const SOUS_PHASES_ORDONNEES = ["5a", "5b", "5c", "5d", "5e"] as const;
export type SousPhase = (typeof SOUS_PHASES_ORDONNEES)[number];

export function estSousPhase(valeur: string | null | undefined): valeur is SousPhase {
  return !!valeur && (SOUS_PHASES_ORDONNEES as readonly string[]).includes(valeur);
}

export function libelleSousPhase(sousPhase: string): string {
  return SOUS_PHASES[sousPhase]?.libelle ?? sousPhase;
}

/**
 * Ce qui peut suivre quoi, du côté du cabinet.
 *
 * Les cinq pastilles existaient dans l'écran et aucune ne s'allumait : rien n'écrivait
 * jamais la colonne. On n'avance que d'un cran, et on ne revient que d'un cran - un
 * dossier qu'on repasse de « Dépôt » à « Vérifié » est une correction de saisie, pas
 * un retour en arrière du travail.
 *
 * Un dossier sans sous-phase entre en 5a : il vient d'être transmis.
 */
export function sousPhaseSuivante(actuelle: string | null | undefined): SousPhase | null {
  if (!estSousPhase(actuelle)) return "5a";

  const rang = SOUS_PHASES_ORDONNEES.indexOf(actuelle);
  return SOUS_PHASES_ORDONNEES[rang + 1] ?? null;
}

/**
 * Ce qui précède, quand le travail défait ce qu'il annonçait.
 *
 * L'avancement ne savait que monter : un acte repris repassait en relecture pendant
 * que le suivi du client continuait d'annoncer « Vérifié ».
 */
export function sousPhasePrecedente(actuelle: string | null | undefined): SousPhase | null {
  if (!estSousPhase(actuelle)) return null;
  return SOUS_PHASES_ORDONNEES[SOUS_PHASES_ORDONNEES.indexOf(actuelle) - 1] ?? null;
}

/**
 * Jusqu'où l'on redescend.
 *
 * Deux bornes, symétriques du plafond. « Transmis » est le plancher : un dossier pris
 * reste pris. Et l'on ne redescend jamais depuis « Dépôt » ni « Terminé » - le dossier
 * est parti au guichet, c'est un fait du dehors, et reprendre un acte ici ne le
 * rappelle pas.
 */
export function descentePermise(actuelle: string | null | undefined): boolean {
  return actuelle === "5b" || actuelle === "5c";
}

export function passageSousPhasePermis(
  depuis: string | null | undefined,
  vers: string
): boolean {
  if (!estSousPhase(vers)) return false;
  if (!estSousPhase(depuis)) return vers === "5a";

  const ecart = SOUS_PHASES_ORDONNEES.indexOf(vers) - SOUS_PHASES_ORDONNEES.indexOf(depuis);
  return ecart === 1 || ecart === -1;
}

/* ---------- L'étape que le travail fait justifie ---------- */

/** Ce que le cabinet a accompli, tel que la base le sait. */
export interface TravailAccompli {
  informationsVerifiees: boolean;
  actesProduits: boolean;
  /** Des pièces du client attendent une décision. */
  piecesEnAttente: number;
  /** Des actes produits attendent d'être validés. */
  actesARelire: number;
  /** Le document que le greffe délivre est au dossier. */
  documentFinalRemis: boolean;
}

/**
 * L'étape que le travail justifie, sans qu'on ait à la déclarer.
 *
 * Les cinq pastilles s'avançaient à la main : l'avocat cliquait « Passer à Révision »,
 * puis « Passer à Vérifié », pour dire ce que son propre travail disait déjà. Un clic
 * de plus après chaque geste, et un dossier qui restait « Transmis » des jours après
 * avoir été relu parce que personne n'avait pensé au bouton.
 *
 * Une seule étape ne se déduit pas : le dépôt au guichet se passe hors de
 * l'application, et rien ici ne peut savoir qu'il a eu lieu. Elle reste déclarée.
 */
export function etapeMeritee(fait: TravailAccompli): SousPhase {
  if (fait.documentFinalRemis) return "5e";
  if (
    fait.informationsVerifiees &&
    fait.actesProduits &&
    fait.piecesEnAttente === 0 &&
    fait.actesARelire === 0
  ) {
    return "5c";
  }
  if (fait.informationsVerifiees || fait.actesProduits) return "5b";
  return "5a";
}

/**
 * Jusqu'où l'automatisme a le droit d'aller.
 *
 * Il ne franchit jamais le dépôt : celui-ci se déclare. Tant qu'il n'est pas déclaré,
 * l'avancement s'arrête à « Vérifié », même si le reste est fait.
 */
export function plafondAutomatique(courante: string | null | undefined): SousPhase {
  return courante === "5d" || courante === "5e" ? "5e" : "5c";
}

/** L'étape la plus avancée des deux, dans l'ordre du parcours. */
export function laPlusAvancee(a: SousPhase, b: SousPhase): SousPhase {
  return SOUS_PHASES_ORDONNEES.indexOf(a) >= SOUS_PHASES_ORDONNEES.indexOf(b) ? a : b;
}

/** La moins avancée : celle qui borne. */
export function laMoinsAvancee(a: SousPhase, b: SousPhase): SousPhase {
  return SOUS_PHASES_ORDONNEES.indexOf(a) <= SOUS_PHASES_ORDONNEES.indexOf(b) ? a : b;
}

/**
 * Le document du greffe conditionne la dernière étape.
 *
 * Une pastille verte sans document déposé mentirait, et le message de fin promet au
 * client de le trouver dans ses documents. Son nom change avec le type de dossier -
 * un dépôt de comptes reçoit un récépissé, une fermeture une attestation de radiation
 * - et le refus le nommait « Kbis » quel que soit le dossier, en parlant
 * d'immatriculation à une société qu'on ferme.
 *
 * Le registre des bénéficiaires, lui, n'est pas exigé : il n'est pas systématiquement
 * établi.
 */
export function passageBloque(
  vers: string,
  aLeDocument: boolean,
  /** Le nom du document que le greffe délivre pour ce type de dossier. */
  documentFinal = "Kbis"
): string | null {
  if (vers === "5e" && !aLeDocument) {
    return (
      "Déposez " + avecArticle(documentFinal) + " avant de marquer le dossier comme terminé"
    );
  }
  return null;
}

export type Filtre =
  | "tous"
  | "aprendre"
  | "assignes"
  | "verifier"
  | "encours"
  | "termines"
  | "miens";

export const FILTRES: { cle: Filtre; libelle: string }[] = [
  { cle: "tous", libelle: "Tous" },
  /*
   * Ce qui attend un preneur passe en tête.
   *
   * Aucun onglet ne montrait les dossiers proposés : ils se mêlaient aux autres sous
   * « Tous », et rien ne disait à l'avocat lesquels il pouvait prendre.
   */
  { cle: "aprendre", libelle: "À prendre" },
  // Ce qu'on a accepté de réviser : sans cet onglet, on ne le retrouvait pas.
  { cle: "assignes", libelle: "Assignés à moi" },
  { cle: "verifier", libelle: "À vérifier" },
  { cle: "encours", libelle: "En cours" },
  { cle: "termines", libelle: "Terminés" },
  { cle: "miens", libelle: "Créés par le cabinet" },
];

export function estFiltre(valeur: string | undefined): Filtre {
  const connu = FILTRES.some((f) => f.cle === valeur);
  return connu ? (valeur as Filtre) : "tous";
}

export function retenir<T extends DossierCabinet>(dossiers: T[], filtre: Filtre): T[] {
  return dossiers.filter((d) => {
    const sp = d.sousPhase;
    if (filtre === "aprendre") return !!d.libre && d.status !== "terminee";
    if (filtre === "assignes") return !!d.monDossier;
    if (filtre === "verifier") return sp === "5a" || sp === "5b";
    if (filtre === "encours") return sp === "5c" || sp === "5d";
    if (filtre === "termines") return sp === "5e" || d.status === "terminee";
    if (filtre === "miens") return d.creePar === "avocat";
    return true;
  });
}

/** Ce que chaque filtre retiendrait : le compte s'affiche à côté de son nom. */
export function comptes<T extends DossierCabinet>(dossiers: T[]): Record<Filtre, number> {
  return {
    tous: dossiers.length,
    aprendre: retenir(dossiers, "aprendre").length,
    assignes: retenir(dossiers, "assignes").length,
    verifier: retenir(dossiers, "verifier").length,
    encours: retenir(dossiers, "encours").length,
    termines: retenir(dossiers, "termines").length,
    miens: retenir(dossiers, "miens").length,
  };
}

/** « il y a 3 h », « il y a 2 j », puis la date courte. */
export function depuis(quand: Date, maintenant: Date = new Date()): string {
  const minutes = Math.floor((maintenant.getTime() - quand.getTime()) / 60000);
  if (minutes < 60) return "il y a " + Math.max(1, minutes) + " min";
  const heures = Math.floor(minutes / 60);
  if (heures < 24) return "il y a " + heures + " h";
  const jours = Math.floor(heures / 24);
  if (jours < 7) return "il y a " + jours + " j";
  return dateCourte(quand);
}

export function dateCourte(quand: Date): string {
  return quand.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * « 27 août 2026 à 22:55 ».
 *
 * L'année tenait sur deux chiffres, et « 27 août 26 » se lisait mal - on y voyait un
 * second quantième. L'heure compte aussi : deux dossiers ouverts le même jour se
 * suivent dans un ordre qu'on ne pouvait pas lire.
 */
export function dateEtHeure(quand: Date): string {
  return (
    dateCourte(quand) +
    " à " +
    quand.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
  );
}

/* ---------- Chercher, trier, paginer ---------- */

/**
 * La liste du cabinet devient vite illisible.
 *
 * Trente dossiers s'affichaient d'un bloc, sans recherche ni tri : retrouver celui
 * d'un client demandait de parcourir la page à l'œil, et les colonnes de dates ne
 * servaient qu'à lire, jamais à ordonner.
 */

export interface DossierCherchable extends DossierCabinet {
  reference: string | null;
  societe: string | null;
  forme: string | null;
  client: string | null;
  clientEmail: string | null;
  creeLe: Date;
  majLe: Date;
}

/** Sans accent ni casse : « Sté Créé » trouve « ste cree ». */
function aplati(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * La recherche porte sur ce qui identifie un dossier.
 *
 * La société d'abord, mais aussi la référence et le client : un avocat cherche
 * « #3686 » qu'il a sous les yeux, ou le nom de la personne qui vient de l'appeler.
 */
export function correspond(dossier: DossierCherchable, terme: string): boolean {
  const cherche = aplati(terme);
  if (!cherche) return true;

  return [
    dossier.societe,
    dossier.reference,
    dossier.forme,
    dossier.client,
    dossier.clientEmail,
  ].some((champ) => champ && aplati(champ).includes(cherche));
}

export type Tri = "recent" | "ancien" | "creation" | "societe";

export const TRIS: { cle: Tri; libelle: string }[] = [
  { cle: "recent", libelle: "Modifiés récemment" },
  { cle: "ancien", libelle: "Sans mouvement depuis longtemps" },
  { cle: "creation", libelle: "Créés récemment" },
  { cle: "societe", libelle: "Par société (A-Z)" },
];

export function estTri(valeur: string | undefined): Tri {
  return TRIS.some((t) => t.cle === valeur) ? (valeur as Tri) : "recent";
}

/**
 * « Sans mouvement depuis longtemps » n'est pas une curiosité.
 *
 * C'est la question qu'un cabinet se pose : quel dossier ai-je laissé dormir ? Un tri
 * par date croissante y répond, là où l'ordre par défaut le cache toujours en bas.
 */
export function trier<T extends DossierCherchable>(dossiers: T[], tri: Tri): T[] {
  const copie = [...dossiers];

  if (tri === "ancien") return copie.sort((a, b) => a.majLe.getTime() - b.majLe.getTime());
  if (tri === "creation") return copie.sort((a, b) => b.creeLe.getTime() - a.creeLe.getTime());
  if (tri === "societe") {
    return copie.sort((a, b) =>
      aplati(a.societe ?? "").localeCompare(aplati(b.societe ?? ""), "fr")
    );
  }
  return copie.sort((a, b) => b.majLe.getTime() - a.majLe.getTime());
}

export interface Periode {
  /** Jour de début, au format YYYY-MM-DD ; vide vaut « depuis toujours ». */
  du?: string;
  /** Jour de fin inclus ; vide vaut « jusqu'à aujourd'hui ». */
  au?: string;
}

/**
 * La période porte sur la date de création du dossier.
 *
 * Les bornes sont des jours, et la borne haute inclut sa journée entière : demander
 * « au 15 août » sans cela exclurait tout ce qui a été créé ce jour-là, ce que
 * personne n'attend.
 */
export function dansLaPeriode(dossier: DossierCherchable, periode: Periode): boolean {
  const jour = jourDe(dossier.creeLe);
  if (periode.du && jour < periode.du) return false;
  if (periode.au && jour > periode.au) return false;
  return true;
}

/** Le jour d'une date, lu sur l'horloge locale : toISOString donnerait la veille. */
export function jourDe(quand: Date): string {
  const mois = String(quand.getMonth() + 1).padStart(2, "0");
  const jour = String(quand.getDate()).padStart(2, "0");
  return quand.getFullYear() + "-" + mois + "-" + jour;
}

/** Une période dont la fin précède le début ne retient rien : on le dit. */
export function periodeIncoherente(periode: Periode): boolean {
  return !!periode.du && !!periode.au && periode.au < periode.du;
}

export const DOSSIERS_PAR_PAGE = 15;

export interface Tranche<T> {
  page: number;
  pages: number;
  visibles: T[];
  premier: number;
  dernier: number;
  total: number;
}

/**
 * La page demandée, ramenée dans les bornes.
 *
 * Une page au-delà de la dernière rend la dernière plutôt qu'une liste vide : un
 * filtre qui se resserre ne doit pas donner l'impression d'avoir tout perdu.
 */
export function paginer<T>(dossiers: T[], pageDemandee: number): Tranche<T> {
  const pages = Math.max(1, Math.ceil(dossiers.length / DOSSIERS_PAR_PAGE));
  const page = Math.min(Math.max(Math.floor(pageDemandee) || 1, 1), pages);
  const debut = (page - 1) * DOSSIERS_PAR_PAGE;

  return {
    page,
    pages,
    visibles: dossiers.slice(debut, debut + DOSSIERS_PAR_PAGE),
    premier: dossiers.length === 0 ? 0 : debut + 1,
    dernier: Math.min(debut + DOSSIERS_PAR_PAGE, dossiers.length),
    total: dossiers.length,
  };
}

/**
 * La longueur d'un motif de renvoi, une seule fois.
 *
 * Le journal le bornait à mille signes et le fil le laissait entier : le suivi, qui
 * lit le journal, montrait un texte tronqué là où la messagerie le montrait complet.
 */
export const LONGUEUR_COMMENTAIRE = 1000;
