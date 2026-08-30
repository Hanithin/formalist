import { describe, it, expect } from "vitest";
import { colonneDeFermeture, type DonneesDeLaColonne } from "@/domain/fermeture/colonne";

/** Ce que la colonne dit d'une ligne, sans avoir à parcourir le tableau. */
function ligne(donnees: DonneesDeLaColonne, cle: string): string | null | undefined {
  return colonneDeFermeture(donnees).lignes.find((l) => l.cle === cle)?.valeur;
}

const AMIABLE: DonneesDeLaColonne = {
  voie: "liquidation-amiable",
  phase: "dissolution",
  societe: { denomination: "ATELIER MERIDIEN", forme: "SARL", siren: "842019336" },
  associes: [{}, {}],
  valeurs: {
    dateDissolution: "2026-05-15",
    liquidateurCivilite: "Madame",
    liquidateurPrenom: "Claire",
    liquidateurNom: "MARCHAND",
    siegeDeLaLiquidation: "8 quai de la Gare, 75013 Paris",
  },
};

describe("où l'on en est", () => {
  /*
   * La fermeture est le seul parcours en deux temps séparés par des mois : on rouvre
   * son dossier longtemps après l'avoir quitté, et la première question est laquelle
   * des deux phases est en cours.
   */
  it("la phase et la voie se lisent sous la dénomination", () => {
    expect(colonneDeFermeture(AMIABLE).phase).toBe("Dissolution · liquidation amiable");
    expect(colonneDeFermeture({ ...AMIABLE, phase: "cloture" }).phase).toBe(
      "Clôture de la liquidation · liquidation amiable"
    );
    expect(colonneDeFermeture({ ...AMIABLE, voie: "tup" }).phase).toBe(
      "Dissolution · transmission universelle"
    );
  });

  it("sans voie choisie, la phase se dit seule", () => {
    expect(colonneDeFermeture({}).phase).toBe("Dissolution");
  });

  it("la date de clôture n'apparaît qu'en seconde phase", () => {
    expect(ligne(AMIABLE, "cloture")).toBeUndefined();
    expect(
      ligne(
        { ...AMIABLE, phase: "cloture", valeurs: { ...AMIABLE.valeurs, dateCloture: "2026-11-30" } },
        "cloture"
      )
    ).toBe("30 novembre 2026");
  });
});

describe("une liquidation amiable", () => {
  it("nomme son liquidateur et son siège", () => {
    expect(ligne(AMIABLE, "siren")).toBe("842 019 336");
    expect(ligne(AMIABLE, "dissolution")).toBe("15 mai 2026");
    expect(ligne(AMIABLE, "liquidateur")).toBe("Madame Claire MARCHAND");
    expect(ligne(AMIABLE, "siege")).toBe("8 quai de la Gare, 75013 Paris");
  });

  it("un liquidateur à moitié saisi ne laisse pas d'espaces en trop", () => {
    expect(
      ligne({ ...AMIABLE, valeurs: { liquidateurNom: "MARCHAND" } }, "liquidateur")
    ).toBe("MARCHAND");
    expect(ligne({ ...AMIABLE, valeurs: {} }, "liquidateur")).toBeNull();
  });
});

describe("une transmission universelle", () => {
  const TUP: DonneesDeLaColonne = { ...AMIABLE, voie: "tup" };

  /*
   * Le patrimoine passe d'un bloc à l'associé unique : il n'y a rien à liquider, donc
   * personne à nommer pour le faire. Les lignes auraient dit « à renseigner » de cases
   * qui n'existent nulle part dans ce parcours.
   */
  it("n'a ni liquidateur ni siège de liquidation", () => {
    expect(ligne(TUP, "liquidateur")).toBeUndefined();
    expect(ligne(TUP, "siege")).toBeUndefined();
  });

  it("nomme l'associé qui recueille", () => {
    expect(
      ligne({ ...TUP, valeurs: { associeDenomination: "HOLDING MERIDIEN" } }, "associe")
    ).toBe("HOLDING MERIDIEN");
  });
});

describe("l'échéance en pied", () => {
  it("le terme du mandat, trois ans jour pour jour", () => {
    expect(colonneDeFermeture(AMIABLE).echeance).toEqual({
      libelle: "Fin du mandat",
      valeur: "15 mai 2029",
    });
  });

  /*
   * Le délai d'opposition tient la suite du dossier : rien ne se dépose avant son
   * terme. Il l'emporte donc sur le mandat, qui court encore pendant des années.
   */
  it("le délai d'opposition l'emporte dès que le BODACC a paru", () => {
    const colonne = colonneDeFermeture({
      ...AMIABLE,
      valeurs: { ...AMIABLE.valeurs, publicationBodacc: "2026-05-20" },
    });
    expect(colonne.echeance?.libelle).toBe("Fin des oppositions");
  });

  it("une transmission universelle n'a pas de mandat à borner", () => {
    expect(colonneDeFermeture({ ...AMIABLE, voie: "tup" }).echeance).toBeNull();
  });

  it("rien à annoncer sans date de dissolution", () => {
    expect(colonneDeFermeture({ voie: "liquidation-amiable" }).echeance).toBeNull();
  });
});

describe("le total annoncé", () => {
  it("une transmission universelle ne coûte pas le prix d'une liquidation", () => {
    const amiable = colonneDeFermeture(AMIABLE).total;
    const tup = colonneDeFermeture({ ...AMIABLE, voie: "tup" }).total;

    expect(amiable).not.toBe(tup);
    expect(amiable).toMatch(/€/);
  });

  /* L'associé unique qui dirige paie moins au greffe : la colonne le répercute. */
  it("un associé unique paie moins", () => {
    const seul = colonneDeFermeture({ ...AMIABLE, associes: [{}] }).total;
    expect(seul).not.toBe(colonneDeFermeture(AMIABLE).total);
  });
});
