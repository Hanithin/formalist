import { describe, it, expect } from "vitest";
import {
  colonneDeLaDeclaration,
  nomDeLaPersonne,
} from "@/domain/auto-entrepreneur/colonne";
import type { Declaration } from "@/domain/auto-entrepreneur/declaration";

/** Ce que la colonne dit d'une ligne, sans avoir à parcourir le tableau. */
function ligne(
  declaration: Declaration,
  cle: string,
  pieces: { type?: string | null }[] = []
): string | null | undefined {
  return colonneDeLaDeclaration(declaration, pieces).lignes.find((l) => l.cle === cle)?.valeur;
}

const CLAIRE: Declaration = {
  civilite: "Madame",
  prenoms: "Claire",
  nomNaissance: "MARCHAND",
  adresseVoie: "8 quai de la Gare",
  codePostal: "75013",
  ville: "Paris",
  natureActivite: "artisanale",
  dateDebut: "2026-09-01",
  versementLiberatoire: true,
  acre: true,
};

describe("la colonne d'une déclaration neuve", () => {
  it("ne dit rien qu'elle ne sache", () => {
    const colonne = colonneDeLaDeclaration({});

    expect(colonne.nom).toBeNull();
    expect(colonne.regime).toBeNull();
    expect(colonne.activite).toBeNull();
    for (const cle of ["adresse", "debut", "plafond", "versement", "acre"]) {
      expect(ligne({}, cle)).toBeNull();
    }
  });

  it("mais annonce le montant, qui ne dépend d'aucune saisie", () => {
    // 149 € HT, TVA comprise.
    expect(colonneDeLaDeclaration({}).total).toContain("178,80");
  });

  /*
   * Trois pièces sont attendues de tout le monde : les deux faces de la pièce
   * d'identité et un justificatif de domicile. Le compte a donc un sens dès le départ.
   */
  it("le compte des pièces part de zéro sur trois", () => {
    expect(ligne({}, "pieces")).toBe("0 sur 3");
  });
});

describe("le nom sous lequel on déclare", () => {
  it("le nom d'usage l'emporte sur celui de naissance", () => {
    // C'est celui que porteront les factures.
    expect(nomDeLaPersonne({ prenoms: "Claire", nomNaissance: "MARCHAND" })).toBe(
      "Claire MARCHAND"
    );
    expect(
      nomDeLaPersonne({ prenoms: "Claire", nomNaissance: "MARCHAND", nomUsage: "DUPONT" })
    ).toBe("Claire DUPONT");
  });

  it("un nom à moitié saisi ne laisse pas d'espaces en trop", () => {
    expect(nomDeLaPersonne({ prenoms: "Claire" })).toBe("Claire");
    expect(nomDeLaPersonne({ nomNaissance: "MARCHAND" })).toBe("MARCHAND");
    expect(nomDeLaPersonne({ civilite: "Madame" })).toBeNull();
  });
});

describe("ce que l'activité décide", () => {
  const pour = (nature: string) => colonneDeLaDeclaration({ natureActivite: nature });

  /*
   * Le régime, le plafond et le taux ne sont demandés nulle part : ils découlent de la
   * nature choisie. C'est pourtant le chiffre qu'on cherche - jusqu'où puis-je
   * facturer - et il n'était écrit nulle part une fois l'étape passée.
   */
  it("le régime fiscal et le plafond suivent la nature", () => {
    expect(pour("commerciale").regime).toBe("Micro-BIC");
    expect(ligne({ natureActivite: "commerciale" }, "plafond")).toBe("188 700 €");

    expect(pour("artisanale").regime).toBe("Micro-BIC");
    expect(ligne({ natureActivite: "artisanale" }, "plafond")).toBe("77 700 €");

    expect(pour("liberale").regime).toBe("Micro-BNC");
    expect(ligne({ natureActivite: "liberale" }, "plafond")).toBe("77 700 €");
  });

  it("une nature inconnue ne fait rien inventer", () => {
    expect(pour("n_importe_quoi").regime).toBeNull();
    expect(ligne({ natureActivite: "n_importe_quoi" }, "plafond")).toBeNull();
  });

  it("le taux du versement libératoire est celui de la nature", () => {
    expect(ligne(CLAIRE, "versement")).toBe("libératoire, 1,7 %");
    expect(
      ligne({ natureActivite: "commerciale", versementLiberatoire: true }, "versement")
    ).toBe("libératoire, 1 %");
  });

  it("un refus est une réponse, une absence n'en est pas une", () => {
    expect(ligne({ ...CLAIRE, versementLiberatoire: false }, "versement")).toBe("non");
    expect(ligne({ ...CLAIRE, acre: false }, "acre")).toBe("non demandée");
    expect(ligne({ natureActivite: "artisanale" }, "versement")).toBeNull();
    expect(ligne({ natureActivite: "artisanale" }, "acre")).toBeNull();
  });
});

describe("l'adresse", () => {
  it("se coupe entre la voie et la commune", () => {
    expect(ligne(CLAIRE, "adresse")).toBe("8 quai de la Gare\n75013 Paris");
  });

  /*
   * C'est l'adresse de l'entreprise qui figure au répertoire : afficher le domicile
   * quand les deux diffèrent ferait vérifier la mauvaise.
   */
  it("celle de l'entreprise l'emporte quand elle est distincte", () => {
    const colonne = {
      ...CLAIRE,
      adresseEntrepriseDistincte: true,
      entrepriseVoie: "3 rue de la Forge",
      entrepriseCodePostal: "69003",
      entrepriseVille: "Lyon",
    };
    expect(ligne(colonne, "adresse")).toBe("3 rue de la Forge\n69003 Lyon");
  });

  it("une voie seule se lit quand même", () => {
    expect(ligne({ adresseVoie: "8 quai de la Gare" }, "adresse")).toBe("8 quai de la Gare");
  });
});

describe("le compte des pièces", () => {
  it("ne compte que celles qui sont attendues", () => {
    const deposees = [{ type: "identite-recto" }, { type: "domicile" }, { type: "autre" }];
    expect(ligne(CLAIRE, "pieces", deposees)).toBe("2 sur 3");
  });

  /*
   * Le justificatif de qualification n'est réclamé qu'à qui a reconnu son métier dans
   * la liste de l'article L121-1 : le dénominateur change avec la réponse.
   */
  it("un métier réglementé en attend une quatrième", () => {
    const reglemente = {
      ...CLAIRE,
      reponseReglementation: "oui",
      categorieReglementee: "batiment",
    };
    expect(ligne(reglemente, "pieces")).toBe("0 sur 4");
    expect(ligne({ ...CLAIRE, reponseReglementation: "je ne sais pas" }, "pieces")).toBe(
      "0 sur 3"
    );
  });

  it("un dépôt sans type ne compte pour rien", () => {
    // La base tolère un type nul : le lire comme une pièce déposée fausserait le compte.
    expect(ligne(CLAIRE, "pieces", [{ type: null }])).toBe("0 sur 3");
  });
});
