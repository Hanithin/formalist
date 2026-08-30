/**
 * Ce qu'on lit à droite de ses consultations.
 *
 * Les autres écrans mettent en colonne le récapitulatif de ce qu'on remplit. Celui-ci
 * n'est pas un formulaire mais une liste : ce qui mérite d'y rester sous les yeux, c'est
 * l'appel à réserver - et les trois choses qu'on veut savoir avant de cliquer.
 *
 * Il portait ces trois faits dans une carte en pleine largeur, qui disparaissait dès
 * qu'un rendez-vous était à venir : le bouton s'en allait avec elle, et l'on ne pouvait
 * plus en prendre un second depuis cet écran.
 */

import { DELAI_REPONSE, DUREE_MINUTES, PRIX_HT_CENTIMES, montantLisible } from "./offre";

/** Une ligne de la colonne. */
export interface LigneDeColonne {
  cle: string;
  libelle: string;
  valeur: string;
}

export interface ColonneDeConsultation {
  lignes: LigneDeColonne[];
}

export function colonneDeConsultation(): ColonneDeConsultation {
  return {
    lignes: [
      { cle: "prix", libelle: "Prix", valeur: montantLisible(PRIX_HT_CENTIMES) + " HT" },
      { cle: "duree", libelle: "Durée", valeur: DUREE_MINUTES + " minutes" },
      { cle: "reponse", libelle: "Réponse", valeur: "sous " + DELAI_REPONSE },
    ],
  };
}
