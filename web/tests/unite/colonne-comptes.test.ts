import { describe, it, expect } from "vitest";
import { colonneDesComptes, type DonneesDeLaColonne } from "@/domain/comptes/colonne";

/** Ce que la colonne dit d'une ligne, sans avoir à parcourir le tableau. */
function ligne(donnees: DonneesDeLaColonne, cle: string): string | null {
  const trouvee = colonneDesComptes(donnees).lignes.find((l) => l.cle === cle);
  if (!trouvee) throw new Error("ligne inconnue : " + cle);
  return trouvee.valeur;
}

const SARL: DonneesDeLaColonne = {
  societe: { denomination: "ATELIER MERIDIEN", forme: "SARL", siren: "842019336" },
  valeurs: { dateOuverture: "2025-01-01", dateCloture: "2025-12-31" },
};

describe("la colonne d'un dépôt tout neuf", () => {
  it("ne dit rien qu'elle ne sache", () => {
    const colonne = colonneDesComptes({});

    expect(colonne.forme).toBeNull();
    expect(colonne.denomination).toBeNull();
    expect(colonne.exercice).toBeNull();
    expect(colonne.echeance).toBeNull();
    for (const cle of ["siren", "exercice", "assemblee", "resultat", "dividendes"]) {
      expect(ligne({}, cle)).toBeNull();
    }
  });

  it("mais annonce le montant, qui ne dépend d'aucune saisie", () => {
    // 149 € HT d'honoraires, 45 € TTC de greffe : 223,80 €.
    expect(colonneDesComptes({}).total).toContain("223,80");
  });

  /*
   * Une convention absente et une confidentialité non demandée sont des réponses.
   *
   * Le formulaire ne les distingue pas d'un silence - une liste vide reste vide - et
   * les afficher « à renseigner » ferait chercher une case qui n'existe pas.
   */
  it("l'absence de convention est une réponse, non un manque", () => {
    expect(ligne({}, "conventions")).toBe("aucune");
    expect(ligne({}, "confidentialite")).toBe("non demandée");
  });
});

describe("l'identité de la société", () => {
  it("le SIREN se lit par tranches de trois", () => {
    expect(ligne(SARL, "siren")).toBe("842 019 336");
  });

  it("l'exercice se coupe entre ses deux bornes", () => {
    expect(ligne(SARL, "exercice")).toBe("du 1er janvier 2025\nau 31 décembre 2025");
    expect(colonneDesComptes(SARL).exercice).toBe("Exercice clos le 31 décembre 2025");
  });

  it("une clôture seule se lit quand même", () => {
    expect(ligne({ valeurs: { dateCloture: "2025-12-31" } }, "exercice")).toBe(
      "clos le 31 décembre 2025"
    );
  });
});

describe("le résultat de l'exercice", () => {
  const avec = (resultat: string) => ligne({ valeurs: { resultat } }, "resultat");

  it("un bénéfice, une perte, un équilibre", () => {
    expect(avec("12500")).toBe("12 500 € de bénéfice");
    expect(avec("-3200")).toBe("3 200 € de perte");
    expect(avec("0")).toBe("à l'équilibre");
  });

  it("les centimes ne s'écrivent que s'il y en a", () => {
    // « 12 500,00 € » fait lire deux chiffres pour rien, neuf fois sur dix.
    expect(avec("12500,50")).toBe("12 500,50 € de bénéfice");
  });
});

describe("l'affectation", () => {
  const affectation = {
    reserveLegaleCentimes: 62_500,
    autresReservesCentimes: 0,
    dividendesCentimes: 500_000,
    reportANouveauCentimes: 0,
  };

  it("le dividende décidé", () => {
    expect(ligne({ valeurs: { resultat: "12500" }, affectation }, "dividendes")).toBe(
      "5 000 €"
    );
  });

  it("aucun dividende, une fois le résultat connu", () => {
    expect(
      ligne(
        { valeurs: { resultat: "12500" }, affectation: { ...affectation, dividendesCentimes: 0 } },
        "dividendes"
      )
    ).toBe("aucun");
  });

  it("rien tant que le résultat manque", () => {
    /*
     * Une affectation vide sur un dossier vide dirait « aucun » - une décision, là où
     * il n'y a que du vide.
     */
    expect(
      ligne({ affectation: { ...affectation, dividendesCentimes: 0 } }, "dividendes")
    ).toBeNull();
  });
});

describe("les conventions réglementées", () => {
  const avec = (nombre: number) =>
    ligne({ conventions: Array.from({ length: nombre }, () => ({}) as never) }, "conventions");

  it("s'accordent en nombre", () => {
    expect(avec(1)).toBe("1 convention");
    expect(avec(2)).toBe("2 conventions");
  });
});

describe("la date limite de dépôt", () => {
  it("se compte depuis l'assemblée quand elle est fixée", () => {
    const colonne = colonneDesComptes({
      ...SARL,
      valeurs: { ...SARL.valeurs, dateAssemblee: "2026-06-30" },
    });
    expect(colonne.echeance).toBe("30 juillet 2026");
  });

  it("se compte sinon depuis la limite d'approbation", () => {
    /*
     * Six mois après le 31 décembre 2025 : le 30 juin, et non un 31 juin qui n'existe
     * pas. Puis un mois : le 30 juillet. C'est la borne qu'on ne peut pas dépasser.
     */
    expect(colonneDesComptes(SARL).echeance).toBe("30 juillet 2026");
  });

  it("un mois trop court recule au dernier jour", () => {
    /*
     * Un exercice clos le 31 août s'approuve au 28 février, non au 3 mars : la date
     * limite de dépôt suit.
     */
    const colonne = colonneDesComptes({
      societe: { forme: "SARL" },
      valeurs: { dateCloture: "2025-08-31" },
    });
    expect(colonne.echeance).toBe("28 mars 2026");
  });

  it("rien à annoncer sans clôture", () => {
    expect(colonneDesComptes({ societe: { forme: "SARL" } }).echeance).toBeNull();
  });
});

describe("le montant annoncé", () => {
  it("une société civile ne paie pas le dépôt au greffe", () => {
    // 149 € HT seuls, soit 178,80 € TTC.
    expect(colonneDesComptes({ societe: { forme: "SCI" } }).total).toContain("178,80");
  });

  it("la confidentialité se lit dans la colonne", () => {
    const colonne = colonneDesComptes({ ...SARL, demandeLaConfidentialite: true });
    expect(colonne.lignes.find((l) => l.cle === "confidentialite")?.valeur).toBe("demandée");
  });
});
