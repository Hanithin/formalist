import { describe, it, expect } from "vitest";
import {
  ETATS,
  transitionPermise,
  etatsSuivants,
  libelleEtat,
  monteeEnOffrePermise,
  OFFRES,
} from "@/domain/formalite/transitions";

describe("transitions d'état", () => {
  it("un dossier en cours part en validation", () => {
    expect(transitionPermise("en_cours", "en_attente_validation")).toBe(true);
  });

  it("l'avocat peut demander des corrections, valider ou refuser", () => {
    expect(etatsSuivants("en_attente_validation")).toEqual([
      "corrections_demandees",
      "valide",
      "rejete",
    ]);
  });

  it("un refus n'est pas définitif : le dossier repart", () => {
    expect(transitionPermise("rejete", "en_cours")).toBe(true);
  });

  it("un dossier immatriculé ne revient jamais en arrière", () => {
    for (const etat of ETATS) {
      expect(transitionPermise("terminee", etat)).toBe(false);
    }
  });

  it("on ne saute pas d'étape", () => {
    expect(transitionPermise("en_cours", "valide")).toBe(false);
    expect(transitionPermise("en_cours", "terminee")).toBe(false);
  });

  it("un état inconnu n'autorise rien, dans un sens comme dans l'autre", () => {
    expect(transitionPermise("inconnu", "valide")).toBe(false);
    expect(transitionPermise("en_cours", "inconnu")).toBe(false);
    expect(etatsSuivants("inconnu")).toEqual([]);
  });

  it("chaque état a un libellé lisible", () => {
    for (const etat of ETATS) {
      expect(libelleEtat(etat)).not.toBe(etat);
    }
  });

  it("un état inconnu s'affiche tel quel plutôt que d'être masqué", () => {
    expect(libelleEtat("etat_futur")).toBe("etat_futur");
  });
});

describe("montée en offre", () => {
  it("on monte d'un cran ou de plusieurs", () => {
    expect(monteeEnOffrePermise("starter", "business")).toBe(true);
    expect(monteeEnOffrePermise("starter", "premium")).toBe(true);
  });

  it("on ne redescend pas", () => {
    // Le travail déjà fait n'est pas défait, et le remboursement n'est pas prévu.
    expect(monteeEnOffrePermise("premium", "business")).toBe(false);
    expect(monteeEnOffrePermise("business", "starter")).toBe(false);
  });

  it("on ne reprend pas la même offre", () => {
    expect(monteeEnOffrePermise("business", "business")).toBe(false);
  });

  it("sans offre de départ, toute offre est une montée", () => {
    expect(monteeEnOffrePermise(null, "starter")).toBe(true);
  });

  it("une offre inventée est refusée", () => {
    expect(monteeEnOffrePermise("starter", "platine")).toBe(false);
  });

  it("les offres sont classées de la plus légère à la plus complète", () => {
    expect(OFFRES).toEqual(["starter", "business", "premium"]);
  });
});
