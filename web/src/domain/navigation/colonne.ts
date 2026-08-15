/**
 * Ce que la colonne de navigation affiche en plus de ses liens.
 *
 * Le type vit ici et non dans le dépôt qui le calcule : la colonne est un
 * composant, et un composant ne lit pas l'infrastructure. Les deux s'accordent
 * donc sur une forme décrite dans le domaine.
 */

import type { Compteur } from "./menu";

export interface ResumeColonne {
  /** La société mise en avant, ou null quand il n'y en a aucune. */
  societe: string | null;
  /**
   * La nature du dossier mis en avant : création, modification, dépôt, fermeture.
   *
   * Un nom de société ne dit pas ce qu'on y fait. « ATELIER MERIDIEN » se lit
   * pareillement qu'on soit en train de la créer ou de la fermer - deux situations
   * qui n'ont rien de commun.
   */
  type: string | null;
  /** Vrai dès qu'il y en a plusieurs : le chevron n'apparaît que dans ce cas. */
  plusieurs: boolean;
  enCours: number;
  nonLus: number;
}

/** Une colonne sans dossier : rien à situer, aucun chiffre à porter. */
export const COLONNE_VIDE: ResumeColonne = {
  societe: null,
  type: null,
  plusieurs: false,
  enCours: 0,
  nonLus: 0,
};

/**
 * Le texte d'un compteur, tel que l'écrivait la colonne d'origine : « 3 en cours »
 * sur les formalités, « 2 non lus » sur la messagerie.
 *
 * Rien à zéro : la pastille disparaît plutôt que d'afficher un 0, qui se lit comme
 * une alerte alors qu'il n'y a rien à signaler.
 */
export function libelleCompteur(compteur: Compteur, resume: ResumeColonne): string | null {
  if (compteur === "enCours") {
    return resume.enCours > 0 ? resume.enCours + " en cours" : null;
  }

  if (resume.nonLus === 0) return null;
  return resume.nonLus + (resume.nonLus > 1 ? " non lus" : " non lu");
}
