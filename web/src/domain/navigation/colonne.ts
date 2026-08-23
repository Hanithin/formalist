/**
 * Ce que la colonne de navigation affiche en plus de ses liens.
 *
 * Le type vit ici et non dans le dépôt qui le calcule : la colonne est un
 * composant, et un composant ne lit pas l'infrastructure. Les deux s'accordent
 * donc sur une forme décrite dans le domaine.
 */

import type { Compteur } from "./menu";
import { libelleDuPortefeuille } from "@/domain/societe/portefeuille";

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
  /**
   * Les dossiers qui attendent le cabinet.
   *
   * Zéro pour un client : le compteur n'est lu que par l'entrée réservée aux avocats,
   * et le calculer pour tout le monde ferait une requête inutile à chaque page.
   */
  aReviser: number;
  /** Combien de sociétés distinctes : l'intitulé de l'entrée en dépend. */
  nombreDeSocietes: number;
}

/** Une colonne sans dossier : rien à situer, aucun chiffre à porter. */
export const COLONNE_VIDE: ResumeColonne = {
  societe: null,
  type: null,
  plusieurs: false,
  enCours: 0,
  nonLus: 0,
  aReviser: 0,
  nombreDeSocietes: 0,
};

/**
 * L'intitulé d'une entrée, quand il dépend de ce qu'on possède.
 *
 * Seule « Mes sociétés » varie aujourd'hui. La règle vit ici plutôt que dans la
 * colonne : c'est une décision de langue, pas d'affichage.
 */
export function libelleDeLEntree(lien: string, libelle: string, resume: ResumeColonne): string {
  if (lien === "/societes") return libelleDuPortefeuille(resume.nombreDeSocietes);
  return libelle;
}

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

  if (compteur === "aReviser") {
    // Un nombre nu : « 4 à réviser » répéterait l'intitulé de l'entrée.
    return resume.aReviser > 0 ? String(resume.aReviser) : null;
  }

  if (resume.nonLus === 0) return null;
  return resume.nonLus + (resume.nonLus > 1 ? " non lus" : " non lu");
}
