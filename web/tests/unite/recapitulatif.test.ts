import { describe, it, expect } from "vitest";
import { recapitulatifDuBrouillon } from "@/domain/formalite/recapitulatif";
import type { Brouillon } from "@/domain/formalite/parcours";

/**
 * Le récapitulatif du parcours de création.
 *
 * Le formulaire tient sur sept étapes : arrivé au capital, on ne sait plus quelle
 * forme on a choisie deux écrans plus tôt. La colonne le rappelle, et ne dit que ce
 * qui est saisi - ce qui manque se dit manquant, c'est la liste de ce qu'il reste à
 * faire.
 */

const ligne = (brouillon: Brouillon, cle: string) =>
  recapitulatifDuBrouillon(brouillon).lignes.find((l) => l.cle === cle);

const personne = (prenom: string, nom: string) => ({
  type: "physique" as const,
  personne: { prenom, nom },
});

describe("le récapitulatif d'un brouillon", () => {
  it("ne dit rien d'un brouillon vide", () => {
    const recap = recapitulatifDuBrouillon({});

    expect(recap.forme).toBeNull();
    expect(recap.denomination).toBeNull();
    expect(recap.lignes.every((l) => l.valeur === null)).toBe(true);
  });

  it("garde l'ordre des champs de la première étape", () => {
    // La colonne se lit en vis-à-vis du formulaire : l'œil ne doit pas chercher.
    expect(recapitulatifDuBrouillon({}).lignes.map((l) => l.cle)).toEqual([
      "siege",
      "capital",
      "associes",
      "dirigeant",
      "cloture",
    ]);
  });
});

describe("le dirigeant", () => {
  it("porte le titre que sa forme lui donne", () => {
    expect(ligne({ forme: "SAS" }, "dirigeant")?.libelle).toBe("Président");
    expect(ligne({ forme: "SARL" }, "dirigeant")?.libelle).toBe("Gérant");
  });

  it("n'en porte aucun tant que la forme n'est pas choisie", () => {
    // Supposer une SARL écrirait « Gérant » sur ce qui deviendra une SAS.
    expect(ligne({}, "dirigeant")?.libelle).toBe("Dirigeant");
    expect(ligne({ forme: "ZZZ" }, "dirigeant")?.libelle).toBe("Dirigeant");
  });

  it("prend le nom de l'associé qu'il reprend", () => {
    const brouillon: Brouillon = {
      forme: "SARL",
      associes: [personne("Claire", "Vasseur"), personne("Marc", "Doucet")],
      dirigeants: [{ associe: 1 }],
    };

    expect(ligne(brouillon, "dirigeant")?.valeur).toBe("Marc Doucet");
  });

  it("porte le sien quand ce n'est pas un associé", () => {
    const brouillon: Brouillon = {
      forme: "SARL",
      associes: [personne("Claire", "Vasseur")],
      dirigeants: [{ personne: { prenom: "Yann", nom: "Le Guen" } }],
    };

    expect(ligne(brouillon, "dirigeant")?.valeur).toBe("Yann Le Guen");
  });
});

describe("les associés", () => {
  it("se nomment tant qu'ils sont deux au plus", () => {
    /*
     * « Associés » suivi de « 2 associés » écrit deux fois la même chose. Le nom, lui,
     * dit qui est au capital - ce que la colonne est là pour rappeler.
     */
    expect(ligne({ forme: "SARL", associes: [personne("Claire", "Vasseur")] }, "associes")?.valeur)
      .toBe("Claire Vasseur");

    expect(
      ligne(
        { forme: "SARL", associes: [personne("Claire", "Vasseur"), personne("Marc", "Doucet")] },
        "associes"
      )?.valeur
    ).toBe("Claire Vasseur, Marc Doucet");
  });

  it("se comptent au-delà, avec le mot de leur forme", () => {
    const trois = [personne("A", "Un"), personne("B", "Deux"), personne("C", "Trois")];

    expect(ligne({ forme: "SARL", associes: trois }, "associes")?.valeur).toBe("3 associés");
    // Le mot est le même pour toutes les formes : l. 227-1 dit « associés ».
    expect(ligne({ forme: "SAS", associes: trois }, "associes")?.valeur).toBe("3 associés");
  });

  it("ne compte pas une ligne encore vide", () => {
    // Ajouter une ligne au tableau n'est pas renseigner un associé.
    const brouillon: Brouillon = {
      forme: "SARL",
      associes: [personne("Claire", "Vasseur"), { type: "physique", personne: {} }],
    };

    expect(ligne(brouillon, "associes")?.valeur).toBe("Claire Vasseur");
  });

  it("s'intitule au singulier quand la forme n'en admet qu'un", () => {
    expect(ligne({ forme: "EURL" }, "associes")?.libelle).toBe("Associé");
    expect(ligne({ forme: "SARL" }, "associes")?.libelle).toBe("Associés");
    expect(ligne({ forme: "SAS" }, "associes")?.libelle).toBe("Associés");
  });
});

describe("le siège, le capital et la clôture", () => {
  it("écrit le siège sur deux lignes, comme une enveloppe", () => {
    const brouillon: Brouillon = {
      adresse: "8 quai de la Gare",
      codePostal: "75013",
      ville: "Paris",
    };

    expect(ligne(brouillon, "siege")?.valeur).toBe("8 quai de la Gare\n75013 Paris");
  });

  it("se contente de ce qui est saisi", () => {
    expect(ligne({ adresse: "8 quai de la Gare" }, "siege")?.valeur).toBe("8 quai de la Gare");
    expect(ligne({ ville: "Paris" }, "siege")?.valeur).toBe("Paris");
    expect(ligne({}, "siege")?.valeur).toBeNull();
  });

  it("met le capital en euros", () => {
    expect(ligne({ capital: 30000 }, "capital")?.valeur).toMatch(/^30\s000\s€$/);
  });

  it("ne prend pas un champ vidé pour un capital nul", () => {
    // Le formulaire écrit zéro quand on efface le champ : ce n'est pas une saisie.
    expect(ligne({ capital: 0 }, "capital")?.valeur).toBeNull();
  });

  it("écrit la clôture en toutes lettres", () => {
    expect(ligne({ dateCloturePremierExercice: "2027-12-31" }, "cloture")?.valeur).toBe(
      "31 décembre 2027"
    );
  });

  it("laisse telle quelle une date qui n'en est pas une", () => {
    expect(ligne({ dateCloturePremierExercice: "31/12/2027" }, "cloture")?.valeur).toBe(
      "31/12/2027"
    );
  });
});
