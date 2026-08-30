import { describe, it, expect } from "vitest";
import { nomDeLApporteur } from "@/domain/modification/traite-apport";
import { MODIFICATIONS } from "@/domain/modification/types";

describe("le nom de l'apporteur", () => {
  it("se compose des trois champs du formulaire", () => {
    expect(
      nomDeLApporteur({
        apporteurCivilite: "Madame",
        apporteurPrenom: "Claire",
        apporteurNom: "MARTIN",
      })
    ).toBe("Madame Claire MARTIN");
  });

  it("se relit sur un dossier d'avant, qui n'avait qu'une case", () => {
    /*
     * Le champ unique - « Civilité, prénom et nom » - est encore ce que portent les
     * dossiers ouverts avant. Le rendre tel quel vaut mieux que de le laisser vide : il
     * a été rempli à la main, il se lit.
     */
    expect(nomDeLApporteur({ apporteurNomComplet: "Monsieur Jean DUPONT" })).toBe(
      "Monsieur Jean DUPONT"
    );
  });

  it("préfère les trois champs quand les deux sont là", () => {
    expect(
      nomDeLApporteur({
        apporteurNomComplet: "Monsieur Jean DUPONT",
        apporteurCivilite: "Madame",
        apporteurPrenom: "Claire",
        apporteurNom: "MARTIN",
      })
    ).toBe("Madame Claire MARTIN");
  });

  it("ne rend rien quand rien n'est saisi", () => {
    expect(nomDeLApporteur({})).toBe("");
  });
});

const CHAMPS_APPORT = MODIFICATIONS.find((m) => m.code === "apport_titres")!.champs;

describe("les trois champs tiennent sur une ligne", () => {
  it("occupent chacun deux colonnes sur six", () => {
    /*
     * La grille du formulaire compte six colonnes et un champ en prend trois par
     * défaut : sans le dire, les trois se seraient rangés deux par ligne, le nom seul
     * en dessous.
     */
    const trois = ["apporteurCivilite", "apporteurPrenom", "apporteurNom"];
    for (const identifiant of trois) {
      const champ = CHAMPS_APPORT.find((c) => c.identifiant === identifiant);
      expect(champ, identifiant).toBeDefined();
      expect(champ!.colonnes, identifiant).toBe(2);
      expect(champ!.pleineLargeur, identifiant).toBeFalsy();
    }
  });

  it("se suivent, pour que la ligne soit celle qu'on croit", () => {
    const rangs = ["apporteurCivilite", "apporteurPrenom", "apporteurNom"].map((i) =>
      CHAMPS_APPORT.findIndex((c) => c.identifiant === i)
    );
    expect(rangs).toEqual([rangs[0], rangs[0] + 1, rangs[0] + 2]);
  });
});
