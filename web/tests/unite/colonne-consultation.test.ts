import { describe, it, expect } from "vitest";
import { colonneDeConsultation } from "@/domain/consultation/colonne";
import {
  DELAI_REPONSE,
  DUREE_MINUTES,
  PRIX_HT_CENTIMES,
  montantLisible,
} from "@/domain/consultation/offre";

describe("la colonne de réservation", () => {
  /*
   * Les trois faits qu'on veut avant de cliquer : prix, durée, délai. Ils vivaient
   * recopiés dans le composant, où un changement de tarif les aurait laissés derrière.
   */
  it("porte le prix, la durée et le délai de l'offre", () => {
    const lignes = colonneDeConsultation().lignes;

    expect(lignes.map((l) => l.libelle)).toEqual(["Prix", "Durée", "Réponse"]);
    expect(lignes[0].valeur).toBe(montantLisible(PRIX_HT_CENTIMES) + " HT");
    expect(lignes[1].valeur).toBe(DUREE_MINUTES + " minutes");
    expect(lignes[2].valeur).toBe("sous " + DELAI_REPONSE);
  });

  it("le prix annoncé est hors taxes, comme partout ailleurs sur cette offre", () => {
    // 99 € HT : c'est le montant que porte la page de règlement.
    expect(colonneDeConsultation().lignes[0].valeur).toBe("99 € HT");
  });
});
