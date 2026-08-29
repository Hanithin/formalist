import { describe, it, expect } from "vitest";
import { montantDeLOffre, offre, OFFRES, TVA } from "@/domain/formalite/offres";

/**
 * Ce que le client règle pour une création.
 *
 * Le parcours était le seul à ne pas encaisser : l'étape « Offres » notait un choix, et
 * le dossier partait chez l'avocat sans qu'un euro ait changé de main.
 */

describe("le montant d'une formule", () => {
  it("encaisse le forfait, taxes comprises", () => {
    // Les prix sont affichés hors taxes : 89 € HT font 106,80 € au débit.
    expect(montantDeLOffre("starter")).toBe(10_680);
    expect(montantDeLOffre("business")).toBe(41_400);
  });

  it("n'encaisse que le forfait, jamais les frais annexes", () => {
    /*
     * L'annonce légale et le greffe sont annoncés à côté du prix et réglés ailleurs :
     * ce ne sont aujourd'hui que des phrases, et les additionner obligerait à les
     * chiffrer.
     */
    for (const formule of OFFRES) {
      expect(montantDeLOffre(formule.code)).toBe(Math.round(formule.prix * 100 * (1 + TVA)));
    }
  });

  it("ne facture rien sans formule reconnue", () => {
    // Un code inventé ne doit pas produire un montant : la route refuse alors le règlement.
    expect(montantDeLOffre("premium-plus")).toBeNull();
    expect(montantDeLOffre("")).toBeNull();
    expect(montantDeLOffre(null)).toBeNull();
    expect(montantDeLOffre(undefined)).toBeNull();
  });

  it("suit la formule qu'il nomme", () => {
    expect(offre("premium")?.prix).toBe(545);
    expect(montantDeLOffre("premium")).toBe(54_500 * (1 + TVA));
  });
});
