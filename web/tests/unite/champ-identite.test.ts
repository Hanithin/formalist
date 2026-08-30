import { describe, it, expect } from "vitest";
import { separerLIdentite, identiteSurUneLigne } from "@/domain/formalite/noms";

describe("la frappe d'un nom d'associé", () => {
  /*
   * Le champ recomposait son texte à chaque lettre. « M » est une civilité : la
   * première lettre de « Monsieur Jean DUPONT » devenait « Monsieur » sous le doigt,
   * et la ligne finissait « Monsieuronsieur Jean DUPONT ».
   *
   * L'écran garde désormais la frappe et ne sépare que la donnée. Ce test tient la
   * raison du garde-fou : la recomposition n'est pas stable lettre à lettre, et rien
   * ne doit la remettre sur le chemin de la saisie.
   */
  function commeAvant(saisi: string): string {
    let affiche = "";
    for (const lettre of saisi) affiche = identiteSurUneLigne(separerLIdentite(affiche + lettre));
    return affiche;
  }

  it("se perdait à recomposer le champ lettre à lettre", () => {
    expect(commeAvant("Monsieur Jean DUPONT")).toBe("MonsieuronsieurJeanDUPONT");
  });

  it("se sépare correctement quand elle est prise d'un coup", () => {
    expect(separerLIdentite("Monsieur Jean DUPONT")).toEqual({
      civilite: "Monsieur",
      prenom: "Jean",
      nom: "DUPONT",
    });
    expect(identiteSurUneLigne(separerLIdentite("Monsieur Jean DUPONT"))).toBe(
      "Monsieur Jean DUPONT"
    );
  });
});
