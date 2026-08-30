import { describe, it, expect } from "vitest";
import {
  SOUS_PHASES_ORDONNEES,
  estSousPhase,
  libelleSousPhase,
  sousPhaseSuivante,
  passageSousPhasePermis,
  passageBloque,
  descentePermise,
  sousPhasePrecedente,
} from "@/domain/formalite/avocat";

describe("l'avancement du travail du cabinet", () => {
  it("un dossier sans sous-phase entre au début", () => {
    // Il vient d'être transmis : c'est ce que dit 5a.
    expect(sousPhaseSuivante(null)).toBe("5a");
    expect(sousPhaseSuivante("n-importe-quoi")).toBe("5a");
  });

  it("on avance d'un cran, jusqu'au dernier", () => {
    expect(sousPhaseSuivante("5a")).toBe("5b");
    expect(sousPhaseSuivante("5d")).toBe("5e");
    expect(sousPhaseSuivante("5e")).toBeNull();
  });

  it("on ne saute pas de cran", () => {
    /*
     * Les cinq pastilles existaient et aucune ne s'allumait : rien n'écrivait la
     * colonne. Maintenant qu'elle s'écrit, elle doit raconter le travail réel.
     */
    expect(passageSousPhasePermis("5a", "5b")).toBe(true);
    expect(passageSousPhasePermis("5a", "5d")).toBe(false);
    expect(passageSousPhasePermis("5c", "5e")).toBe(false);
  });

  it("on revient d'un cran, pour corriger une saisie", () => {
    expect(passageSousPhasePermis("5d", "5c")).toBe(true);
    expect(passageSousPhasePermis("5d", "5a")).toBe(false);
  });

  it("un dossier neuf ne peut entrer qu'en 5a", () => {
    expect(passageSousPhasePermis(null, "5a")).toBe(true);
    expect(passageSousPhasePermis(null, "5c")).toBe(false);
  });

  it("une sous-phase inventée est refusée", () => {
    expect(passageSousPhasePermis("5a", "5z")).toBe(false);
    expect(estSousPhase("5z")).toBe(false);
    expect(SOUS_PHASES_ORDONNEES.every((s) => estSousPhase(s))).toBe(true);
  });

  it("chaque sous-phase porte un mot lisible", () => {
    for (const sousPhase of SOUS_PHASES_ORDONNEES) {
      expect(libelleSousPhase(sousPhase)).not.toBe(sousPhase);
    }
  });
});

describe("ce que le Kbis conditionne", () => {
  it("la dernière étape l'exige", () => {
    /*
     * « KBIS délivré » sans Kbis déposé serait une pastille verte qui ment, et le
     * message de fin promet au client de le trouver dans ses documents.
     */
    expect(passageBloque("5e", false)).toContain("le Kbis");
    expect(passageBloque("5e", true)).toBeNull();

    /*
     * Et il nomme le document du dossier, non le Kbis de tout le monde : une société
     * qu'on ferme ne s'immatricule pas, elle se radie.
     */
    expect(passageBloque("5e", false, "Attestation de radiation")).toBe(
      "Déposez l\u2019attestation de radiation avant de marquer le dossier comme terminé"
    );
    expect(passageBloque("5e", false, "Récépissé de dépôt")).toContain("le récépissé de dépôt");
  });

  it("les autres étapes n'exigent rien", () => {
    for (const sousPhase of ["5a", "5b", "5c", "5d"]) {
      expect(passageBloque(sousPhase, false)).toBeNull();
    }
  });
});

describe("l'étape redescend quand le travail se défait", () => {
  /*
   * L'avancement ne savait que monter : reprendre un acte le remettait en relecture
   * pendant que le suivi du client continuait d'annoncer « Vérifié ». On lui écrivait
   * par courriel qu'on retirait ses documents, et son étape disait que tout allait
   * bien.
   */
  it("« Vérifié » et « Révision » se rendent", () => {
    expect(descentePermise("5b")).toBe(true);
    expect(descentePermise("5c")).toBe(true);
  });

  /* Un dépôt au guichet est un fait du dehors : reprendre un acte ne le rappelle pas. */
  it("le dépôt et la fin ne se défont pas d'un clic", () => {
    expect(descentePermise("5d")).toBe(false);
    expect(descentePermise("5e")).toBe(false);
  });

  /* « Transmis » est le plancher : un dossier pris reste pris. */
  it("on ne redescend pas en deçà de la prise", () => {
    expect(descentePermise("5a")).toBe(false);
    expect(sousPhasePrecedente("5a")).toBeNull();
    expect(sousPhasePrecedente(null)).toBeNull();
  });

  it("le cran précédent est celui d'avant, et le passage en arrière est permis", () => {
    expect(sousPhasePrecedente("5c")).toBe("5b");
    expect(passageSousPhasePermis("5c", "5b")).toBe(true);
    /* Un cran, pas deux : redescendre de « Vérifié » à « Transmis » saute une étape. */
    expect(passageSousPhasePermis("5c", "5a")).toBe(false);
  });
});
