import { rolesProposables, type Equipe, type RoleEquipe } from "./invitations";

/**
 * Ce qu'un membre d'équipe a le droit de faire.
 *
 * Trois droits, indépendants du rôle : le rôle dit qui gère l'équipe, les droits
 * disent ce qu'on fait des dossiers. Les deux se cumulaient déjà en base
 * (can_view_all, can_edit, can_create) sans jamais être modifiables après coup.
 *
 * Chaque droit porte sa phrase. « Voir tous les dossiers » ne dit pas ce qui se passe
 * quand on ne l'a pas, et c'est précisément ce qu'on veut savoir avant de cocher.
 */

export interface Droits {
  voitTousLesDossiers: boolean;
  peutModifier: boolean;
  peutCreer: boolean;
}

export type CleDroit = keyof Droits;

export interface Droit {
  cle: CleDroit;
  libelle: string;
  /** Ce qui se passe faute de ce droit : c'est la moitié utile de l'explication. */
  explication: string;
}

export const DROITS: readonly Droit[] = [
  {
    cle: "voitTousLesDossiers",
    libelle: "Voir tous les dossiers de l'équipe",
    explication: "Sans ce droit, la personne ne voit que les dossiers qu'elle a ouverts.",
  },
  {
    cle: "peutModifier",
    libelle: "Modifier les dossiers qu'elle voit",
    explication: "Sans ce droit, elle les consulte et télécharge les actes, sans y toucher.",
  },
  {
    cle: "peutCreer",
    libelle: "Ouvrir de nouvelles formalités",
    explication: "Sans ce droit, elle travaille sur les dossiers existants uniquement.",
  },
];

/** Les droits d'un nouvel arrivant : il crée, il ne voit et ne touche rien d'autre. */
export const DROITS_PAR_DEFAUT: Droits = {
  voitTousLesDossiers: false,
  peutModifier: false,
  peutCreer: true,
};

export const LIBELLES_ROLES: Record<RoleEquipe, string> = {
  collaborateur: "Collaborateur",
  admin: "Administrateur",
  avocat: "Avocat",
};

/** Ce que le rôle donne en plus des droits, dit en une phrase. */
export function pouvoirDuRole(equipe: Equipe, role: RoleEquipe): string {
  const dirige =
    equipe.type === "cabinet" ? role === "avocat" : role === "admin";

  if (dirige) return "Gère l'équipe : invitations, droits, retraits.";
  if (role === "admin") return "Administrateur d'équipe, sans la gestion du cabinet.";
  return "Travaille sur les dossiers, sans gérer l'équipe.";
}

/** Les rôles offerts au choix, avec leur libellé et ce qu'ils emportent. */
export function choixDeRole(equipe: Equipe) {
  return rolesProposables(equipe).map((role) => ({
    valeur: role,
    libelle: LIBELLES_ROLES[role],
    pouvoir: pouvoirDuRole(equipe, role),
  }));
}

/**
 * Les droits en pastilles, pour une ligne de liste.
 *
 * Une liste vide est un résultat, pas un oubli : quelqu'un sans aucun droit existe,
 * et l'appelant l'écrit alors en toutes lettres plutôt que d'afficher du vide.
 */
export function resumeDesDroits(droits: Droits): string[] {
  const dits: string[] = [];
  if (droits.voitTousLesDossiers) dits.push("Voit tous les dossiers");
  else dits.push("Voit ses dossiers");
  if (droits.peutModifier) dits.push("Modifie");
  if (droits.peutCreer) dits.push("Crée des formalités");
  return dits;
}

/** Lecture d'une demande venue du réseau, ramenée à trois booléens. */
export function droitsDemandes(demande: Partial<Droits>, actuels: Droits): Droits {
  return {
    voitTousLesDossiers: demande.voitTousLesDossiers ?? actuels.voitTousLesDossiers,
    peutModifier: demande.peutModifier ?? actuels.peutModifier,
    peutCreer: demande.peutCreer ?? actuels.peutCreer,
  };
}

/**
 * Combien de jours reste-t-il à une invitation ?
 *
 * Une date d'expiration brute ne se lit pas : « expire le 23 août » demande un calcul
 * mental, « expire dans 5 jours » se comprend d'un coup. On arrondit vers le haut :
 * un lien qui expire dans quelques heures expire bien aujourd'hui, pas dans zéro jour.
 */
export function joursRestants(expireLe: Date, maintenant: Date = new Date()): number {
  const jour = 24 * 60 * 60 * 1000;
  return Math.max(0, Math.ceil((expireLe.getTime() - maintenant.getTime()) / jour));
}

export function delaiLisible(expireLe: Date, maintenant: Date = new Date()): string {
  const jours = joursRestants(expireLe, maintenant);
  if (jours === 0) return "expire aujourd'hui";
  if (jours === 1) return "expire demain";
  return "expire dans " + jours + " jours";
}
