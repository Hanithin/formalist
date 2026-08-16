import { describe, it, expect } from "vitest";
import {
  avisAPublier,
  sirenLisible,
  formeEnToutesLettres,
  signature,
} from "@/domain/modification/annonce";

/**
 * L'avis de modification.
 *
 * C'est le cabinet qui publie, et un support habilité facture au caractère : le
 * texte doit être juste du premier coup. L'avocat n'a qu'à le copier.
 */

const SOCIETE = {
  denomination: "Sterling Peak",
  forme: "SAS",
  siren: "899979934",
  adresse: "34 rue Laugier",
  codePostal: "75017",
  ville: "Paris",
  capital: 10000,
  villeRcs: "Paris",
};

const TRANSFERT = {
  nouvelleAdresse: "5 avenue Victor Hugo",
  nouvelleVille: "Lyon",
  nouveauCodePostal: "69003",
  dateEffetTransfert: "2026-09-15",
};

describe("la mise en forme", () => {
  it("le SIREN se lit par groupes de trois", () => {
    expect(sirenLisible("899979934")).toBe("899 979 934");
    // Un SIREN incomplet n'est pas découpé au hasard.
    expect(sirenLisible("8999")).toBe("8999");
  });

  it("la forme s'écrit en toutes lettres", () => {
    expect(formeEnToutesLettres("SAS")).toBe("Société par actions simplifiée");
    expect(formeEnToutesLettres("SCI")).toBe("Société civile immobilière");
  });

  it("l'avis est signé par l'organe, non par le nom du dirigeant", () => {
    /*
     * Un changement de dirigeant rendrait l'avis faux au moment de sa parution s'il
     * portait un nom.
     */
    expect(signature("SAS")).toBe("Pour avis, le Président.");
    expect(signature("SARL")).toBe("Pour avis, la Gérance.");
  });
});

describe("l'avis d'une modification simple", () => {
  const avis = avisAPublier({
    societe: SOCIETE,
    codes: ["denomination"],
    valeurs: { nouvelleDenomination: "STERLING GROUPE", dateEffetDenomination: "2026-09-15" },
    dateAssemblee: "2026-09-01",
    ressortActuel: "Paris",
  });

  it("n'en produit qu'un", () => {
    expect(avis).toHaveLength(1);
    expect(avis[0].ressort).toBe("Paris");
  });

  it("porte l'identité de la société telle qu'elle est encore inscrite", () => {
    expect(avis[0].texte).toContain("STERLING PEAK");
    expect(avis[0].texte).toContain("Société par actions simplifiée au capital de 10 000 euros");
    expect(avis[0].texte).toContain("34 rue Laugier, 75017 Paris");
    expect(avis[0].texte).toContain("899 979 934 RCS Paris");
  });

  it("dit ce qui a été décidé, et quand", () => {
    expect(avis[0].texte).toContain("1er septembre 2026");
    expect(avis[0].texte).toContain("STERLING GROUPE");
    expect(avis[0].texte).toContain("Pour avis, le Président.");
  });
});

describe("plusieurs décisions dans la même assemblée", () => {
  it("tiennent dans un seul avis, énumérées", () => {
    // Un support habilité facture à l'avis : en publier deux coûterait le double.
    const avis = avisAPublier({
      societe: SOCIETE,
      codes: ["denomination", "augmentation_capital"],
      valeurs: {
        nouvelleDenomination: "STERLING GROUPE",
        capitalActuelAugm: 10000,
        nouveauCapitalAugm: 50000,
        modeAugmentation: "Apport en numéraire",
      },
      dateAssemblee: "2026-09-01",
      ressortActuel: "Paris",
    });

    expect(avis).toHaveLength(1);
    expect(avis[0].texte).toContain("STERLING GROUPE");
    expect(avis[0].texte).toContain("porté de 10 000 euros à 50 000 euros");
    expect(avis[0].texte).toContain(" et ");
  });
});

describe("le transfert hors ressort", () => {
  const avis = avisAPublier({
    societe: SOCIETE,
    codes: ["transfert_siege"],
    valeurs: TRANSFERT,
    dateAssemblee: "2026-09-01",
    ressortActuel: "Paris",
    ressortNouveau: "Lyon",
  });

  it("donne deux avis, un par ressort", () => {
    expect(avis.map((a) => a.ressort)).toEqual(["Paris", "Lyon"]);
  });

  it("les deux textes diffèrent : radiation d'un côté, immatriculation de l'autre", () => {
    /*
     * Publier deux fois le même texte est la faute courante. Le greffe de départ
     * attend l'annonce de la radiation, celui d'arrivée celle de l'immatriculation.
     */
    expect(avis[0].texte).toContain("radiée du registre du commerce et des sociétés de Paris");
    expect(avis[1].texte).toContain("immatriculée au registre du commerce et des sociétés de Lyon");
    expect(avis[0].texte).not.toBe(avis[1].texte);
  });

  it("les deux portent la même décision", () => {
    for (const un of avis) {
      expect(un.texte).toContain("34 rue Laugier, 75017 Paris");
      expect(un.texte).toContain("5 avenue Victor Hugo, 69003 Lyon");
      expect(un.texte).toContain("15 septembre 2026");
    }
  });
});

describe("un transfert dans le même ressort", () => {
  it("ne donne qu'un avis, sans radiation", () => {
    const avis = avisAPublier({
      societe: SOCIETE,
      codes: ["transfert_siege"],
      valeurs: { ...TRANSFERT, nouvelleVille: "Paris", nouveauCodePostal: "75008" },
      dateAssemblee: "2026-09-01",
      ressortActuel: "Paris",
      ressortNouveau: "Paris",
    });

    expect(avis).toHaveLength(1);
    expect(avis[0].texte).not.toContain("radiée");
    expect(avis[0].texte).toContain("statuts à jour seront déposés");
  });
});

describe("ce qui n'appelle pas d'avis", () => {
  it("une cession de parts n'en produit aucun", () => {
    // Elle ne modifie aucune mention publiée : publier ferait payer pour rien.
    const avis = avisAPublier({
      societe: SOCIETE,
      codes: ["cession_parts"],
      valeurs: { cedantNom: "DUPONT", cessionnaireNom: "MARTIN", nbPartsCedees: 50 },
      dateAssemblee: "2026-09-01",
      ressortActuel: "Paris",
    });
    expect(avis).toEqual([]);
  });
});

describe("le changement de dirigeant", () => {
  it("nomme la personne et sa fonction", () => {
    const avis = avisAPublier({
      societe: SOCIETE,
      codes: ["dirigeant"],
      valeurs: {
        typeChangementDirigeant: "Nomination",
        fonctionDirigeant: "Président",
        dateEffetDirigeant: "2026-09-15",
        nouveauDirigeantCivilite: "Monsieur",
        nouveauDirigeantPrenom: "Paul",
        nouveauDirigeantNom: "BERNARD",
        nouveauDirigeantAdresse: "3 rue des Lilas, 33000 Bordeaux",
      },
      dateAssemblee: "2026-09-01",
      ressortActuel: "Paris",
    });

    expect(avis[0].texte).toContain("Monsieur Paul BERNARD, demeurant 3 rue des Lilas");
    expect(avis[0].texte).toContain("a été nommé président");
  });

  it("une démission se dit autrement qu'une nomination", () => {
    const avis = avisAPublier({
      societe: SOCIETE,
      codes: ["dirigeant"],
      valeurs: {
        typeChangementDirigeant: "Démission",
        fonctionDirigeant: "Président",
        dirigeantDemissionnaireNom: "Jean DUPONT",
        dateEffetDirigeant: "2026-09-15",
      },
      dateAssemblee: "2026-09-01",
      ressortActuel: "Paris",
    });

    expect(avis[0].texte).toContain("Jean DUPONT");
    expect(avis[0].texte).toContain("démissionné");
    expect(avis[0].texte).not.toContain("nommé");
  });
});
