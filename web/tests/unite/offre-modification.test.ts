import { describe, it, expect } from "vitest";
import {
  devis,
  HONORAIRES_PARTICULIERS,
  HONORAIRES_PREMIERE_CENTIMES,
  HONORAIRES_SUIVANTE_CENTIMES,
} from "@/domain/modification/offre";

/**
 * Ce que coûte une modification.
 *
 * Le calcul n'avait aucun test, et c'est celui d'un montant facturé : une erreur y
 * passe la revue sans se voir et se découvre sur une facture. Les cas couverts sont
 * ceux où la règle a une articulation - la dégressivité, et ce qui y échappe.
 */
describe("les honoraires d'une modification", () => {
  it("le premier changement au tarif plein, les suivants dégressifs", () => {
    const un = devis({ codes: ["transfert_siege"] });
    expect(un.honorairesHT).toBe(HONORAIRES_PREMIERE_CENTIMES);

    const trois = devis({ codes: ["transfert_siege", "denomination", "objet_social"] });
    expect(trois.honorairesHT).toBe(
      HONORAIRES_PREMIERE_CENTIMES + 2 * HONORAIRES_SUIVANTE_CENTIMES
    );
  });

  it("l'apport de titres a son prix, quel que soit son rang", () => {
    /*
     * Il ne bénéficie pas de la dégressivité et ne la consomme pas non plus : c'est
     * un acte distinct, pas une résolution de plus dans la même assemblée. Placé en
     * premier, il ne doit pas faire payer le tarif « suivant » au changement d'après.
     */
    const seul = devis({ codes: ["apport_titres"] });
    expect(seul.honorairesHT).toBe(HONORAIRES_PARTICULIERS.apport_titres);
    expect(HONORAIRES_PARTICULIERS.apport_titres).toBe(120_000);

    const apresUnAutre = devis({ codes: ["denomination", "apport_titres"] });
    expect(apresUnAutre.honorairesHT).toBe(
      HONORAIRES_PREMIERE_CENTIMES + HONORAIRES_PARTICULIERS.apport_titres!
    );

    const enPremier = devis({ codes: ["apport_titres", "denomination"] });
    expect(enPremier.honorairesHT).toBe(apresUnAutre.honorairesHT);
  });

  it("les frais ne sont comptés qu'une fois pour toute l'assemblée", () => {
    const un = devis({ codes: ["denomination"] });
    const deux = devis({ codes: ["denomination", "objet_social"] });
    expect(deux.fraisTTC).toBe(un.fraisTTC);
  });

  it("le transfert hors ressort paie deux annonces, non une", () => {
    const dansLeRessort = devis({
      codes: ["transfert_siege"],
      ressortActuel: "Paris",
      ressortNouveau: "Paris",
    });
    const horsRessort = devis({
      codes: ["transfert_siege"],
      ressortActuel: "Paris",
      ressortNouveau: "Lyon",
    });

    expect(horsRessort.frais.filter((l) => l.libelle.startsWith("Annonce légale"))).toHaveLength(2);
    expect(horsRessort.fraisTTC).toBeGreaterThan(dansLeRessort.fraisTTC);
  });
});
