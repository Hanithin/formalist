import { describe, it, expect } from "vitest";
import { confidentialitePossible, tailleDeLEntreprise } from "@/domain/comptes/confidentialite";
import { regimeDesConventions } from "@/domain/comptes/conventions";

/**
 * La confidentialité des comptes, et le contrôle des conventions.
 *
 * Deux sujets où se tromper ne se voit pas tout de suite. Une déclaration de
 * confidentialité signée à tort est un faux, attesté sur l'honneur, passible d'amende
 * et d'emprisonnement. Une convention réglementée oubliée rend l'approbation
 * irrégulière.
 */

const MICRO = { totalBilanCentimes: 200_000_00, chiffreAffairesCentimes: 400_000_00, effectif: 3 };
const PETITE = { totalBilanCentimes: 3_000_000_00, chiffreAffairesCentimes: 8_000_000_00, effectif: 30 };
const MOYENNE = {
  totalBilanCentimes: 20_000_000_00,
  chiffreAffairesCentimes: 40_000_000_00,
  effectif: 200,
};

describe("la taille de l'entreprise", () => {
  it("se juge sur deux critères, non sur les trois", () => {
    /*
     * L'erreur habituelle est de croire qu'il faut tenir les trois seuils. Une société
     * qui dépasse largement en effectif reste micro si son bilan et son chiffre
     * d'affaires tiennent.
     */
    expect(
      tailleDeLEntreprise({
        totalBilanCentimes: 100_000_00,
        chiffreAffairesCentimes: 200_000_00,
        effectif: 40,
      })
    ).toBe("micro");
  });

  it("classe selon les seuils relevés en 2024", () => {
    expect(tailleDeLEntreprise(MICRO)).toBe("micro");
    expect(tailleDeLEntreprise(PETITE)).toBe("petite");
    expect(tailleDeLEntreprise(MOYENNE)).toBe("moyenne");
  });
});

describe("ce qu'une société peut rendre confidentiel", () => {
  it("tout, pour une micro-entreprise", () => {
    const verdict = confidentialitePossible({ forme: "SASU", chiffres: MICRO, exclusions: [] });

    expect(verdict.portee).toBe("tout");
    expect(verdict.modele).toBe("micro");
  });

  it("le compte de résultat seul, pour une petite entreprise", () => {
    const verdict = confidentialitePossible({ forme: "SAS", chiffres: PETITE, exclusions: [] });

    expect(verdict.portee).toBe("compte-de-resultat");
    expect(verdict.modele).toBe("petite");
  });

  it("rien, au-delà des seuils de la petite entreprise", () => {
    const verdict = confidentialitePossible({ forme: "SA", chiffres: MOYENNE, exclusions: [] });

    expect(verdict.portee).toBe("aucune");
    expect(verdict.modele).toBeNull();
  });

  it("ferme la confidentialité totale à une holding, sans lui fermer celle du résultat", () => {
    /*
     * L'exclusion la moins connue, et celle qui piège le plus : une holding tient
     * souvent les seuils de la micro-entreprise, mais l'article L. 123-16-1 écarte les
     * sociétés qui gèrent des titres de participations. La déclaration le fait attester
     * sur l'honneur - la signer à tort est un faux.
     */
    const verdict = confidentialitePossible({
      forme: "SASU",
      chiffres: MICRO,
      exclusions: ["holding"],
    });

    expect(verdict.portee).toBe("compte-de-resultat");
    expect(verdict.modele).toBe("petite");
  });

  it("ferme tout à une société cotée ou consolidée", () => {
    for (const exclusion of ["cotee", "groupe", "credit", "assurance"] as const) {
      const verdict = confidentialitePossible({
        forme: "SAS",
        chiffres: MICRO,
        exclusions: [exclusion],
      });
      expect(verdict.portee, exclusion).toBe("aucune");
      expect(verdict.modele, exclusion).toBeNull();
    }
  });

  it("ne propose rien à une société civile, qui ne dépose pas", () => {
    const verdict = confidentialitePossible({ forme: "SCI", chiffres: MICRO, exclusions: [] });

    expect(verdict.portee).toBe("aucune");
    expect(verdict.explication).toContain("ne dépose pas ses comptes");
  });
});

describe("le régime des conventions réglementées", () => {
  it("rapport et vote dans une société pluripersonnelle", () => {
    const sas = regimeDesConventions({ forme: "SAS", avecCommissaire: false });
    expect(sas.regime).toBe("rapport-et-vote");
    expect(sas.rapportPar).toBe("président");
    expect(sas.article).toContain("L. 227-10");

    const sarl = regimeDesConventions({ forme: "SARL", avecCommissaire: false });
    expect(sarl.rapportPar).toBe("gérant");
    expect(sarl.article).toContain("L. 223-19");
  });

  it("confie le rapport au commissaire aux comptes quand il y en a un", () => {
    expect(regimeDesConventions({ forme: "SAS", avecCommissaire: true }).rapportPar).toBe(
      "commissaire aux comptes"
    );
  });

  it("réduit la formalité à une mention au registre dans une société unipersonnelle", () => {
    /*
     * Dispense du rapport et du vote, non de la déclaration : c'est la mention au
     * registre qui rend la convention opposable.
     */
    for (const forme of ["SASU", "EURL"]) {
      const regime = regimeDesConventions({ forme, avecCommissaire: false });
      expect(regime.regime, forme).toBe("mention-au-registre");
      expect(regime.rapportPar, forme).toBeNull();
    }
  });

  it("ne soumet pas une société civile patrimoniale au contrôle", () => {
    /*
     * Le modèle dont ce parcours est tiré citait « L. 185-13 » pour la SCI : cet
     * article n'existe pas. Une société civile qui gère son patrimoine n'a aucun
     * régime de conventions réglementées.
     */
    const regime = regimeDesConventions({ forme: "SCI", avecCommissaire: false });

    expect(regime.regime).toBe("sans-objet");
    expect(regime.article).toBe("");
  });

  it("y soumet en revanche la société civile qui a une activité économique", () => {
    const regime = regimeDesConventions({
      forme: "SCI",
      avecCommissaire: false,
      activiteEconomique: true,
    });

    expect(regime.regime).toBe("rapport-et-vote");
    expect(regime.article).toContain("L. 612-5");
  });
});
