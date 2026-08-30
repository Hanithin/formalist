import { describe, it, expect } from "vitest";
import { colonneDeContrat } from "@/domain/contrat/colonne";
import { CONTRATS } from "@/domain/contrat/catalogue";
import { OFFRES } from "@/domain/contrat/parcours";

describe("la colonne de rédaction", () => {
  it("compte les modèles plutôt que d'en écrire le nombre", () => {
    /*
     * Un septième contrat au catalogue laisserait un chiffre en arrière s'il était
     * recopié : la colonne le lit.
     */
    const modeles = colonneDeContrat().lignes.find((l) => l.cle === "modeles");
    expect(modeles?.valeur).toBe(CONTRATS.length + " types de contrat");
  });

  it("la relecture ne s'annonce que si une formule l'offre", () => {
    // Elle aboutit à « en_validation » : c'est ce qui la distingue du document seul.
    const relecture = colonneDeContrat().lignes.find((l) => l.cle === "relecture");
    const offerte = OFFRES.some((o) => o.aboutit === "en_validation");

    expect(Boolean(relecture)).toBe(offerte);
    if (offerte) expect(relecture?.valeur).toBe("par un avocat, en option");
  });

  it("n'annonce aucun prix", () => {
    /*
     * Ce domaine n'en porte pas, et la page n'en affiche nulle part : en inventer un
     * dans la colonne serait un engagement que rien ne tient.
     */
    for (const ligne of colonneDeContrat().lignes) {
      expect(ligne.valeur).not.toMatch(/€/);
    }
  });
});
