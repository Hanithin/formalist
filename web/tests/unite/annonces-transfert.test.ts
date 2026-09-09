import { describe, it, expect } from "vitest";
import {
  changeDeDepartement,
  departementDuCodePostal,
  publicationsAPrevoir,
} from "@/domain/modification/formalites";
import { avisAPublier } from "@/domain/modification/annonce";

/**
 * Combien d'avis publie un transfert de siège, et ce qu'ils disent.
 *
 * Deux critères, deux effets. Un support d'annonces légales est habilité par
 * département : celui de départ n'atteint pas les tiers de celui d'arrivée, et c'est
 * donc le département qui décide du nombre de parutions - article R. 210-3 du code de
 * commerce pour l'avis au département du siège, article R. 210-11 pour celui du
 * nouveau siège lorsque la société change de ressort.
 *
 * Le ressort, lui, décide de ce que les avis disent : en changer radie la société d'un
 * registre pour l'immatriculer à un autre. Les deux ne vont pas toujours ensemble.
 */

const SOCIETE = {
  denomination: "BLUE SHARK ADVISORY",
  forme: "SAS",
  siren: "100442326",
  adresse: "34 rue Laugier",
  codePostal: "75017",
  ville: "Paris",
  capital: 100,
  villeRcs: "Paris",
};

function avis(sur: {
  codePostal: string;
  nouveauCodePostal: string;
  ressortActuel: string;
  ressortNouveau: string;
}) {
  return avisAPublier({
    societe: { ...SOCIETE, codePostal: sur.codePostal },
    assemblee: { date: "2026-09-04", associes: [] },
    codes: ["transfert_siege"],
    valeurs: {
      nouvelleAdresse: "12 rue Bleue",
      nouveauCodePostal: sur.nouveauCodePostal,
      nouvelleVille: "Ailleurs",
    },
    ressortActuel: sur.ressortActuel,
    ressortNouveau: sur.ressortNouveau,
  } as never);
}

describe("le département d'un code postal", () => {
  it("se lit sur deux chiffres en métropole", () => {
    expect(departementDuCodePostal("75017")).toBe("75");
    expect(departementDuCodePostal("69003")).toBe("69");
  });

  /* Outre-mer, il en faut trois : 971 la Guadeloupe, 976 Mayotte. */
  it("se lit sur trois chiffres outre-mer", () => {
    expect(departementDuCodePostal("97400")).toBe("974");
    expect(departementDuCodePostal("98800")).toBe("988");
  });

  /* La Corse-du-Sud et la Haute-Corse partagent le « 20 » : la seconde ouvre à 20200. */
  it("sépare les deux Corse", () => {
    expect(departementDuCodePostal("20000")).toBe("2A");
    expect(departementDuCodePostal("20260")).toBe("2B");
    expect(changeDeDepartement("20000", "20260")).toBe(true);
  });

  it("ne tranche pas sur un code illisible", () => {
    expect(departementDuCodePostal("")).toBe("");
    expect(changeDeDepartement("75017", "")).toBe(false);
  });
});

describe("le nombre d'avis d'un transfert de siège", () => {
  it("un seul quand le département ne change pas", () => {
    const publications = publicationsAPrevoir({
      codes: ["transfert_siege"],
      ressortActuel: "Paris",
      ressortNouveau: "Paris",
      codePostalActuel: "75017",
      codePostalNouveau: "75008",
    });
    expect(publications).toHaveLength(1);
  });

  it("deux quand il change", () => {
    const publications = publicationsAPrevoir({
      codes: ["transfert_siege"],
      ressortActuel: "Paris",
      ressortNouveau: "Lyon",
      codePostalActuel: "75017",
      codePostalNouveau: "69003",
    });
    expect(publications).toHaveLength(2);
    expect(publications[0].motif).toContain("département de départ");
    expect(publications[1].motif).toContain("département d'arrivée");
  });

  /*
   * Lille vers Douai : deux tribunaux de commerce, un seul département - le Nord. Un
   * support habilité dans le Nord atteint les tiers des deux villes, et une seule
   * parution suffit.
   */
  it("un seul quand on change de tribunal sans changer de département", () => {
    const publications = publicationsAPrevoir({
      codes: ["transfert_siege"],
      ressortActuel: "Lille",
      ressortNouveau: "Douai",
      codePostalActuel: "59000",
      codePostalNouveau: "59500",
    });
    expect(publications).toHaveLength(1);
  });

  /* Un changement qui n'est pas un transfert ne publie qu'une fois, où qu'il soit. */
  it("un seul pour un changement de dénomination", () => {
    expect(
      publicationsAPrevoir({
        codes: ["denomination"],
        ressortActuel: "Paris",
        ressortNouveau: "Lyon",
        codePostalActuel: "75017",
        codePostalNouveau: "69003",
      })
    ).toHaveLength(1);
  });
});

describe("ce que les avis d'un transfert disent", () => {
  /*
   * Les deux avis portent la même mention finale.
   *
   * Chacun n'en disait que la moitié - radiation ici, immatriculation là. Les deux
   * greffes lisent pourtant le même fait, et l'avis de départ doit dire où la société
   * se retrouve après sa radiation.
   */
  it("deux départements et deux ressorts : les deux nomment les deux registres", () => {
    const rendus = avis({
      codePostal: "75017",
      nouveauCodePostal: "69003",
      ressortActuel: "Paris",
      ressortNouveau: "Lyon",
    });

    expect(rendus).toHaveLength(2);
    for (const un of rendus) {
      expect(un.texte).toContain("Radiation au RCS de Paris et réimmatriculation au RCS de Lyon.");
    }
  });

  /*
   * Deux départements, un seul greffe : la société ne se radie de rien, et l'annoncer
   * serait faux. Les deux avis disent la même chose, chacun dans son département.
   */
  it("deux départements, un seul ressort : aucune radiation annoncée", () => {
    const rendus = avis({
      codePostal: "78000",
      nouveauCodePostal: "92000",
      ressortActuel: "Versailles",
      ressortNouveau: "Versailles",
    });

    expect(rendus).toHaveLength(2);
    for (const un of rendus) {
      expect(un.texte).not.toContain("radiée");
      expect(un.texte).toContain("Les statuts à jour seront déposés au greffe");
    }
  });

  /*
   * Un seul département, deux greffes : une parution, mais elle porte les mentions de
   * l'article R. 210-11 - la société quitte un registre pour un autre.
   */
  it("un département, deux ressorts : un avis qui dit la radiation et la nouvelle immatriculation", () => {
    const rendus = avis({
      codePostal: "59000",
      nouveauCodePostal: "59500",
      ressortActuel: "Lille",
      ressortNouveau: "Douai",
    });

    expect(rendus).toHaveLength(1);
    expect(rendus[0].texte).toContain("Radiation au RCS de Lille et réimmatriculation au RCS de Douai.");
    expect(rendus[0].texte).toContain("déposés au greffe du tribunal de commerce de Douai");
  });

  it("ni département ni ressort : un avis, et le dépôt au greffe d'origine", () => {
    const rendus = avis({
      codePostal: "75017",
      nouveauCodePostal: "75008",
      ressortActuel: "Paris",
      ressortNouveau: "Paris",
    });

    expect(rendus).toHaveLength(1);
    expect(rendus[0].texte).not.toContain("radiée");
    expect(rendus[0].texte).toContain("déposés au greffe du tribunal de commerce de Paris");
  });
});
