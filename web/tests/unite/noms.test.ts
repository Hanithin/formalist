import { describe, it, expect } from "vitest";
import { separerLIdentite, identiteSurUneLigne } from "@/domain/formalite/noms";

/**
 * La séparation d'une identité saisie sur une ligne.
 *
 * Elle finit dans un acte : le procès-verbal nomme les présents, l'acte de cession
 * désigne le cédant, et le greffe lit les deux séparément. Un prénom pris pour un nom
 * ne fait rien échouer - il nomme quelqu'un d'autre.
 */
describe("séparer un nom d'un prénom", () => {
  it("se fie aux capitales, qui sont la convention des actes", () => {
    expect(separerLIdentite("Jean DUPONT")).toEqual({
      civilite: "",
      prenom: "Jean",
      nom: "DUPONT",
    });
  });

  it("ne coupe pas un prénom composé en deux", () => {
    /*
     * La règle d'avant - premier mot le prénom, le reste le nom - donnait ici un nom
     * « Claire DUPONT », et l'acte nommait une personne qui n'existe pas.
     */
    expect(separerLIdentite("Marie Claire DUPONT")).toEqual({
      civilite: "",
      prenom: "Marie Claire",
      nom: "DUPONT",
    });
  });

  it("garde entier un nom à particule", () => {
    expect(separerLIdentite("Jean DE LA TOUR")).toEqual({
      civilite: "",
      prenom: "Jean",
      nom: "DE LA TOUR",
    });
  });

  it("retire la civilité, quelle que soit sa forme", () => {
    for (const saisi of ["Monsieur Jean DUPONT", "M. Jean DUPONT", "M Jean DUPONT"]) {
      expect(separerLIdentite(saisi).civilite, saisi).toBe("Monsieur");
      expect(separerLIdentite(saisi).nom, saisi).toBe("DUPONT");
    }
    expect(separerLIdentite("Mme Claire MARTIN").civilite).toBe("Madame");
    // « Mademoiselle » ne s'emploie plus dans les actes depuis 2012.
    expect(separerLIdentite("Mademoiselle Claire MARTIN").civilite).toBe("Madame");
  });

  it("accepte l'ordre inverse, nom puis prénom", () => {
    expect(separerLIdentite("DUPONT Jean")).toEqual({
      civilite: "",
      prenom: "Jean",
      nom: "DUPONT",
    });
  });

  it("prend le dernier mot pour nom quand rien n'est en capitales", () => {
    expect(separerLIdentite("jean dupont")).toEqual({
      civilite: "",
      prenom: "jean",
      nom: "dupont",
    });
    expect(separerLIdentite("Marie Claire Dupont")).toEqual({
      civilite: "",
      prenom: "Marie Claire",
      nom: "Dupont",
    });
  });

  it("prend le dernier mot pour nom quand tout est en capitales", () => {
    expect(separerLIdentite("JEAN DUPONT")).toEqual({
      civilite: "",
      prenom: "JEAN",
      nom: "DUPONT",
    });
  });

  it("reconnaît les capitales accentuées", () => {
    expect(separerLIdentite("Hélène DE L'ÉTANG").nom).toBe("DE L'ÉTANG");
    expect(separerLIdentite("Hélène DE L'ÉTANG").prenom).toBe("Hélène");
  });

  it("supporte un seul mot, et une saisie vide", () => {
    expect(separerLIdentite("DUPONT")).toEqual({ civilite: "", prenom: "", nom: "DUPONT" });
    expect(separerLIdentite("Jean")).toEqual({ civilite: "", prenom: "Jean", nom: "" });
    expect(separerLIdentite("   ")).toEqual({ civilite: "", prenom: "", nom: "" });
    expect(separerLIdentite("Monsieur")).toEqual({ civilite: "Monsieur", prenom: "", nom: "" });
  });

  it("se recompose sans perte", () => {
    /*
     * L'écran réaffiche la ligne à partir des trois champs : si la recomposition ne
     * rend pas la saisie, le curseur saute et l'on ne peut plus taper.
     */
    for (const saisi of [
      "Monsieur Jean DUPONT",
      "Marie Claire DE LA TOUR",
      "DUPONT",
      "Jean",
    ]) {
      expect(identiteSurUneLigne(separerLIdentite(saisi)), saisi).toBe(saisi);
    }
  });
});
