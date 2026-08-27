import { describe, it, expect } from "vitest";
import { libelleJournal } from "@/domain/formalite/journal";

/**
 * Le journal du dossier, lisible.
 *
 * Il affichait la clé technique de la base : l'avocat lisait « informations_verifiees »
 * et « sous_phase_5c » entre deux dates écrites en toutes lettres.
 */
describe("le journal du dossier", () => {
  it("nomme ce qui s'est passé, non la colonne", () => {
    expect(libelleJournal("informations_verifiees", "creation")).toBe(
      "Informations vérifiées"
    );
    expect(libelleJournal("dossier_pris", "creation")).toBe("Dossier pris en charge");
    expect(libelleJournal("document_refuse", "creation")).toBe("Justificatif refusé");
  });

  it("lit les deux familles qui portent leur valeur dans la clé", () => {
    expect(libelleJournal("etat_corrections_demandees", "creation")).toBe(
      "Dossier passé à « Corrections demandées »"
    );
    /* La dernière étape porte le nom du document que le greffe délivre, par type. */
    expect(libelleJournal("sous_phase_5e", "creation")).toBe(
      "Étape annoncée au client : « Kbis »"
    );
    expect(libelleJournal("sous_phase_5e", "comptes")).toBe(
      "Étape annoncée au client : « Récépissé »"
    );
  });

  it("garde lisible une clé qu'aucune table ne nomme", () => {
    /*
     * Une quinzaine d'endroits écrivent le journal, et il en viendra d'autres : une clé
     * oubliée doit se lire comme une phrase, non comme un identifiant.
     */
    expect(libelleJournal("relance_envoyee", "creation")).toBe("Relance envoyee");
  });

  it("n'écrit aucun tiret bas", () => {
    const cles = [
      "actes_mis_a_disposition",
      "avocat_assigne",
      "comptes_payes",
      "etat_en_attente_validation",
      "sous_phase_5a",
      "statuts_signes",
    ];
    for (const cle of cles) {
      expect(libelleJournal(cle, "creation"), cle).not.toContain("_");
    }
  });
});
