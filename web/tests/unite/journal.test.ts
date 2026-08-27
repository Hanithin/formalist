import { describe, it, expect } from "vitest";
import { libelleJournal } from "@/domain/formalite/journal";
import {
  etapeMeritee,
  plafondAutomatique,
  laMoinsAvancee,
} from "@/domain/formalite/avocat";

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

/**
 * L'étape annoncée au client suit le travail.
 *
 * L'avocat cliquait « Passer à Révision », puis « Passer à Vérifié », pour déclarer ce
 * que son propre travail disait déjà - et des dossiers restaient « Transmis » des jours
 * après avoir été relus parce que personne n'avait pensé au bouton.
 */
describe("l'étape que le travail justifie", () => {
  const RIEN = {
    informationsVerifiees: false,
    actesProduits: false,
    piecesEnAttente: 0,
    actesARelire: 0,
    documentFinalRemis: false,
  };

  it("part de « Transmis » et ne bouge pas sans travail", () => {
    expect(etapeMeritee(RIEN)).toBe("5a");
  });

  it("passe en révision dès qu'un geste est posé", () => {
    expect(etapeMeritee({ ...RIEN, informationsVerifiees: true })).toBe("5b");
    expect(etapeMeritee({ ...RIEN, actesProduits: true })).toBe("5b");
  });

  it("ne dit « Vérifié » que lorsque plus rien n'attend", () => {
    const presque = { ...RIEN, informationsVerifiees: true, actesProduits: true };
    expect(etapeMeritee({ ...presque, piecesEnAttente: 1 })).toBe("5b");
    expect(etapeMeritee({ ...presque, actesARelire: 1 })).toBe("5b");
    expect(etapeMeritee(presque)).toBe("5c");
  });

  it("le document du greffe clôt le parcours", () => {
    expect(etapeMeritee({ ...RIEN, documentFinalRemis: true })).toBe("5e");
  });

  /*
   * Le dépôt au guichet se passe hors de l'application : rien ici ne peut savoir qu'il
   * a eu lieu, et l'automatisme ne le franchit jamais.
   */
  it("s'arrête au dépôt tant qu'il n'est pas déclaré", () => {
    expect(plafondAutomatique(null)).toBe("5c");
    expect(plafondAutomatique("5a")).toBe("5c");
    expect(plafondAutomatique("5c")).toBe("5c");
    expect(plafondAutomatique("5d")).toBe("5e");
    expect(plafondAutomatique("5e")).toBe("5e");
  });

  it("vise la moins avancée des deux", () => {
    expect(laMoinsAvancee("5e", plafondAutomatique("5a"))).toBe("5c");
    expect(laMoinsAvancee("5b", plafondAutomatique("5a"))).toBe("5b");
    expect(laMoinsAvancee("5e", plafondAutomatique("5d"))).toBe("5e");
  });
});
