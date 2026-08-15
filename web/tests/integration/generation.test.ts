import { describe, it, expect } from "vitest";
import PizZip from "pizzip";
import { genererDocument, gabaritDisponible } from "@/infrastructure/documents/generation";
import { documentsAProduire } from "@/domain/formalite/documents";
import { donneesDeGabarit } from "@/domain/formalite/gabarit";

/**
 * Le texte d'un .docx.
 *
 * L'archive est un ZIP dont le corps vit dans word/document.xml. PizZip est déjà là
 * pour l'archive de la bibliothèque : lire le texte ne coûte donc aucune dépendance
 * de plus, et permet de vérifier ce que porte l'acte plutôt que sa taille.
 */
function texteDu(docx: Buffer): string {
  const xml = new PizZip(docx).file("word/document.xml")?.asText() ?? "";
  // Les balises sautent ; le texte se recolle, y compris quand Word l'a découpé.
  return xml.replace(/<[^>]+>/g, "");
}

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
    /*
     * NOM_SOCIETE, non SOCIETE_NOM : les gabarits ont leurs noms de champ, et un
     * champ mal nommé ne fait pas échouer la génération - il produit un acte où la
     * dénomination est un blanc entre guillemets. C'est le seul moyen de le voir.
     */
    const buffer = genererDocument("sasu-statuts.docx", {
      NOM_SOCIETE: "MARQUEUR UNIQUE 4711",
      SOCIETE_FORME: "SASU",
    });
    expect(texteDu(buffer)).toContain("MARQUEUR UNIQUE 4711");
  });

  it("les champs du domaine sont ceux que les gabarits attendent", () => {
    // Le jeu complet, passé au vrai gabarit : ce qui est écrit doit s'y retrouver.
    const donnees = donneesDeGabarit({
      forme: "SASU",
      denomination: "ATELIER MERIDIEN",
      adresse: "12 rue des Lilas",
      codePostal: "75011",
      ville: "Paris",
      capital: 5000,
      activite: "Conseil aux entreprises",
    });

    const texte = texteDu(genererDocument("sasu-statuts.docx", donnees));
    expect(texte).toContain("ATELIER MERIDIEN");
    expect(texte).toContain("Conseil aux entreprises");
    expect(texte).toContain("12 rue des Lilas");
  });

  it("les actes portent la date qu'on leur donne, pas celle du jour", () => {
    /*
     * C'est la date de l'attestation de dépôt de capital : la banque la délivre après
     * le versement, et c'est ce jour-là qu'on signe les statuts. Produire un acte daté
     * du jour donnerait des statuts signés avant que le capital n'existe.
     */
    const donnees = donneesDeGabarit(
      { forme: "SASU", denomination: "ESSAI DATATION", capital: 1000 },
      { maintenant: new Date("2026-03-17T10:00:00") }
    );
    expect(donnees.DATE_SIGNATURE).toBe("17 mars 2026");

    const texte = texteDu(genererDocument("sasu-statuts.docx", donnees));
    expect(texte).toContain("17 mars 2026");

    // Et sans date donnée, celle du jour : un acte de travail se date d'aujourd'hui.
    const sansDate = donneesDeGabarit({ forme: "SASU", denomination: "ESSAI" });
    expect(sansDate.DATE_SIGNATURE).not.toBe("17 mars 2026");
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
