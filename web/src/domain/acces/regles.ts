/**
 * Règles de visibilité, portées depuis lib/team-access.js du serveur actuel.
 *
 * Ce module ne connaît ni la base ni le réseau : il reçoit des faits, il rend un
 * verdict. C'est ce qui permet de le tester exhaustivement sans rien démarrer, et
 * d'avoir une seule définition de « qui voit quoi » dans toute l'application.
 */

export type Role = "user" | "avocat" | "admin";
export type TypeEquipe = "client" | "cabinet";

export interface Utilisateur {
  id: number;
  roles: Role[];
}

/** Appartenance de l'utilisateur à une équipe, avec les droits qui y sont attachés. */
export interface Appartenance {
  equipeId: number;
  type: TypeEquipe;
  role: Role;
  voitTousLesDossiers: boolean;
  peutModifier: boolean;
  peutCreer: boolean;
}

export interface Dossier {
  id: number;
  proprietaireId: number;
  avocatAssigneId: number | null;
  equipeId: number | null;
  /**
   * L'état du dossier, quand la règle en dépend.
   *
   * Une seule règle le regarde : celle des dossiers proposés aux avocats. Il reste
   * facultatif pour ne pas obliger tous les appelants à le fournir.
   */
  statut?: string | null;
}

export function aLeRole(utilisateur: Utilisateur, role: Role): boolean {
  return utilisateur.roles.includes(role);
}

/**
 * Voit-il l'ensemble des dossiers de son équipe ?
 * L'administrateur d'équipe, oui. Dans un cabinet, les avocats aussi : ils doivent
 * pouvoir reprendre le dossier d'un confrère.
 */
export function voitToutLEquipe(appartenance: Appartenance | null): boolean {
  if (!appartenance) return false;
  if (appartenance.role === "admin") return true;
  if (appartenance.type === "cabinet" && appartenance.role === "avocat") return true;
  return appartenance.voitTousLesDossiers;
}

/**
 * Un dossier transmis que personne n'a encore pris.
 *
 * Il est proposé à tous les avocats à la fois : chacun est prévenu, chacun peut
 * l'ouvrir pour décider s'il le prend, et le premier qui l'accepte le prend. Sans
 * cette règle, un avocat prévenu ouvrirait un dossier qu'il n'a pas le droit de lire.
 *
 * Trois conditions. Tant que le client remplit son dossier, rien n'est à réviser : le
 * proposer donnerait à voir des brouillons à tout le cabinet. Un dossier déjà pris
 * cesse d'être proposé - il appartient à son avocat. Et un dossier clos n'attend plus
 * personne.
 */
const CLOS = new Set(["terminee", "archive", "rejete"]);

/** Un dossier dont le travail est fini, d'une manière ou d'une autre. */
export function estClos(statut: string | null | undefined): boolean {
  return !!statut && CLOS.has(statut);
}

/**
 * Les statuts qui peuvent encore attendre un avocat.
 *
 * La liste vivait recopiée dans trois requêtes - la liste du cabinet, le compte de
 * l'écran d'un dossier, la pastille de la colonne - et dans le contrôle de la prise,
 * qui n'en retenait qu'une moitié : on ne pouvait pas prendre un dossier clos depuis
 * la liste, qui ne le proposait pas, mais l'appel direct l'attribuait quand même.
 *
 * Une seule liste, lue partout, y compris par la requête : Prisma la reçoit en
 * `notIn`, ce qui la garde vraie des deux côtés.
 */
export const STATUTS_HORS_PROPOSITION = ["en_cours", ...CLOS] as const;

/** Le statut permet-il encore qu'un avocat prenne ce dossier ? */
export function statutProposable(statut: string | null | undefined): boolean {
  return !!statut && statut !== "en_cours" && !estClos(statut);
}

export function estPropose(dossier: Dossier | null): boolean {
  if (!dossier) return false;
  if (dossier.avocatAssigneId !== null) return false;
  // Tant que le client remplit, rien n'est à réviser ; un dossier clos n'attend plus.
  return statutProposable(dossier.statut);
}

export function peutLire(
  utilisateur: Utilisateur,
  dossier: Dossier | null,
  appartenance: Appartenance | null
): boolean {
  if (!dossier) return false;
  if (aLeRole(utilisateur, "admin")) return true;
  if (dossier.proprietaireId === utilisateur.id) return true;
  if (dossier.avocatAssigneId === utilisateur.id) return true;
  // Un dossier proposé se lit par tout avocat : c'est ce qui lui permet de décider.
  if (aLeRole(utilisateur, "avocat") && estPropose(dossier)) return true;

  if (!appartenance || dossier.equipeId !== appartenance.equipeId) return false;
  return voitToutLEquipe(appartenance);
}

/** Lire ne suffit pas : modifier demande un droit distinct. */
export function peutModifier(
  utilisateur: Utilisateur,
  dossier: Dossier | null,
  appartenance: Appartenance | null
): boolean {
  if (!dossier) return false;
  if (aLeRole(utilisateur, "admin")) return true;
  if (dossier.proprietaireId === utilisateur.id) return true;
  if (dossier.avocatAssigneId === utilisateur.id) return true;

  if (!appartenance || dossier.equipeId !== appartenance.equipeId) return false;
  if (appartenance.role === "admin") return true;
  if (appartenance.type === "cabinet" && appartenance.role === "avocat") return true;
  return appartenance.voitTousLesDossiers && appartenance.peutModifier;
}

export function peutCreer(appartenance: Appartenance | null): boolean {
  if (!appartenance) return true; // pas encore d'équipe : rien à restreindre
  if (appartenance.role === "admin") return true;
  return appartenance.peutCreer;
}
