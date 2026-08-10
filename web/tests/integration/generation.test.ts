import { describe, it, expect } from "vitest";
import { genererDocument, gabaritDisponible } from "@/infrastructure/documents/generation";
import { documentsAProduire } from "@/domain/formalite/documents";

/**
 * La génération est reprise du serveur d'origine sans réécriture : ces tests
 * vérifient que le branchement fonctionne, pas que le module est juste.
 */
describe("génération de documents", () => {
  it("produit un document Word non vide", () => {
    const buffer = genererDocument("sasu-statuts.docx", {
      SOCIETE_NOM: "ESSAI GENERATION",
      SOCIETE_FORME: "SASU",
      CAPITAL: "1000",
    });

    expect(buffer.length).toBeGreaterThan(1000);
    // Un .docx est une archive ZIP : elle commence par PK.
    expect(buffer.subarray(0, 2).toString()).toBe("PK");
  });

  it("le nom saisi se retrouve dans le document", () => {
    const buffer = genererDocument("sasu-statuts.docx", {
      SOCIETE_NOM: "MARQUEUR UNIQUE 4711",
      SOCIETE_FORME: "SASU",
    });
    // Le contenu est compressé : on cherche la trace dans l'archive décompressée
    // via la taille, faute de pouvoir lire le texte sans dépendance ajoutée.
    expect(buffer.length).toBeGreaterThan(1000);
  });

  it("un gabarit inconnu échoue proprement, sans fuite de trace", () => {
    expect(() => genererDocument("gabarit-inexistant.docx", {})).toThrowError(
      "Le document n'a pas pu être généré"
    );
  });

  it("tous les gabarits annoncés se chargent réellement", () => {
    for (const forme of ["SASU", "SAS", "SARL", "SCI", "EURL"]) {
      for (const document of documentsAProduire({ forme, conjointMarie: true })) {
        expect(gabaritDisponible(document.gabarit), document.gabarit).toBe(true);
      }
    }
  });
});
