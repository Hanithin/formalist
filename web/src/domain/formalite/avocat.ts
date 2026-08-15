/**
 * La lecture d'un dossier du côté du cabinet.
 *
 * L'avocat ne suit pas les mêmes étapes que le client : une fois le dossier
 * transmis, tout se joue dans la sous-phase 5a-5e, qui dit où en est le travail
 * du cabinet. Porté de public/avocat.html, où le tableau, les compteurs et les
 * filtres recalculaient chacun leur version.
 */

export type Teinte = "orange" | "blue" | "green" | "gray";

export interface DossierCabinet {
  status: string | null;
  phase: number;
  sousPhase: string | null;
  creePar: "avocat" | "client";
}

const SOUS_PHASES: Record<string, { libelle: string; teinte: Teinte }> = {
  "5a": { libelle: "Transmis", teinte: "orange" },
  "5b": { libelle: "Révision", teinte: "orange" },
  "5c": { libelle: "Vérifié", teinte: "blue" },
  "5d": { libelle: "Dépôt", teinte: "blue" },
  "5e": { libelle: "KBIS", teinte: "green" },
};

/** Où en est le travail du cabinet, en un mot et une teinte. */
export function etatCabinet(dossier: DossierCabinet): { libelle: string; teinte: Teinte } {
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

export function passageSousPhasePermis(
  depuis: string | null | undefined,
  vers: string
): boolean {
  if (!estSousPhase(vers)) return false;
  if (!estSousPhase(depuis)) return vers === "5a";

  const ecart = SOUS_PHASES_ORDONNEES.indexOf(vers) - SOUS_PHASES_ORDONNEES.indexOf(depuis);
  return ecart === 1 || ecart === -1;
}

/**
 * Le Kbis conditionne la dernière étape.
 *
 * « KBIS délivré » sans Kbis déposé serait une pastille verte qui ment, et le message
 * de fin promet au client de le trouver dans ses documents. Le registre des
 * bénéficiaires, lui, n'est pas exigé : il n'est pas systématiquement établi.
 */
export function passageBloque(vers: string, aLeKbis: boolean): string | null {
  if (vers === "5e" && !aLeKbis) {
    return "Déposez le Kbis avant de marquer le dossier comme immatriculé";
  }
  return null;
}

export type Filtre = "tous" | "verifier" | "encours" | "termines" | "miens";

export const FILTRES: { cle: Filtre; libelle: string }[] = [
  { cle: "tous", libelle: "Tous" },
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
  return quand.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "2-digit" });
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
