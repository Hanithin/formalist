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

export function peutLire(
  utilisateur: Utilisateur,
  dossier: Dossier | null,
  appartenance: Appartenance | null
): boolean {
  if (!dossier) return false;
  if (aLeRole(utilisateur, "admin")) return true;
  if (dossier.proprietaireId === utilisateur.id) return true;
  if (dossier.avocatAssigneId === utilisateur.id) return true;

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
