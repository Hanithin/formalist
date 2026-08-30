/**
 * Ce qu'on lit à droite de ses contrats.
 *
 * Comme aux consultations, cet écran n'est pas un formulaire mais une liste : ce qui
 * mérite de rester sous les yeux, c'est le geste qu'on vient faire - rédiger un contrat
 * - et les trois choses qu'on veut savoir avant de le faire.
 *
 * Le bouton vivait au bout de la barre de filtres, à côté de pastilles qui ne lui
 * ressemblaient pas : on le prenait pour un filtre de plus.
 *
 * Il n'y a pas de prix dans ce domaine - la page n'en annonce nulle part, et la colonne
 * n'en invente pas.
 */

import { CONTRATS } from "./catalogue";
import { OFFRES } from "./parcours";

/** Une ligne de la colonne. */
export interface LigneDeColonne {
  cle: string;
  libelle: string;
  valeur: string;
}

export interface ColonneDeContrat {
  lignes: LigneDeColonne[];
}

export function colonneDeContrat(): ColonneDeContrat {
  /*
   * Les deux formules décident des deux dernières lignes : la rédaction est immédiate
   * dans les deux cas, la relecture n'existe que si une formule l'offre. Compter plutôt
   * que réécrire, pour qu'une troisième formule ne laisse pas la colonne en arrière.
   */
  const relecture = OFFRES.some((o) => o.aboutit === "en_validation");

  return {
    lignes: [
      {
        cle: "modeles",
        libelle: "Modèles",
        valeur:
          CONTRATS.length + (CONTRATS.length > 1 ? " types de contrat" : " type de contrat"),
      },
      { cle: "redaction", libelle: "Rédaction", valeur: "immédiate" },
      ...(relecture
        ? [{ cle: "relecture", libelle: "Relecture", valeur: "par un avocat, en option" }]
        : []),
    ],
  };
}
