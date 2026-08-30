import { describe, it, expect } from "vitest";
import {
  qualitesDuRepresentant,
  regle,
  estUnipersonnelle,
  verifierCapital,
  verifierAssocies,
  verifierRepartition,
  FORMES_PROPOSEES,
  FORMES,
} from "@/domain/formalite/formes";

describe("formes juridiques", () => {
  it("chaque forme proposée est décrite", () => {
    for (const forme of FORMES_PROPOSEES) {
      expect(FORMES[forme]).toBeDefined();
      expect(FORMES[forme].description).not.toBe("");
    }
  });

  it("une forme sans gabarit n'est pas proposée au client", () => {
    // La SA est décrite, ses règles sont prêtes, mais aucun gabarit de statuts
    // n'existe : la proposer mènerait le client dans une impasse.
    expect(FORMES.SA.disponible).toBe(false);
    expect(FORMES_PROPOSEES).not.toContain("SA");
  });

  it("le titre du dirigeant suit la forme : il figure dans les actes", () => {
    expect(regle("SASU")?.titreDirigeant).toBe("Président");
    expect(regle("SARL")?.titreDirigeant).toBe("Gérant");
    expect(regle("SCI")?.titreDirigeant).toBe("Gérant");
  });

  it("une forme inconnue ne rend pas de règle", () => {
    expect(regle("SNC")).toBeNull();
    expect(regle(null)).toBeNull();
  });
});

describe("caractère unipersonnel", () => {
  it("SASU et EURL n'admettent qu'un associé", () => {
    expect(estUnipersonnelle("SASU")).toBe(true);
    expect(estUnipersonnelle("EURL")).toBe(true);
  });

  it("SAS et SARL en demandent plusieurs", () => {
    expect(estUnipersonnelle("SAS")).toBe(false);
    expect(estUnipersonnelle("SARL")).toBe(false);
  });

  it("forme non reconnue : on se rabat sur le nombre saisi", () => {
    expect(estUnipersonnelle("SNC", 1)).toBe(true);
    expect(estUnipersonnelle("SNC", 3)).toBe(false);
  });
});

describe("capital", () => {
  it("une SA exige 37 000 euros", () => {
    const anomalies = verifierCapital("SA", 10_000, 10_000);
    // Le séparateur de milliers français est une espace fine insécable, pas une
    // espace ordinaire : comparer au caractère près casserait à chaque montant.
    expect(anomalies[0].message).toMatch(/37\s000 euros/);
  });

  it("une SASU n'a pas de minimum légal", () => {
    expect(verifierCapital("SASU", 1, 1)).toEqual([]);
  });

  it("un capital nul est refusé quelle que soit la forme", () => {
    expect(verifierCapital("SASU", 0, 0)[0].champ).toBe("capital");
  });

  it("une SARL doit libérer un cinquième", () => {
    expect(verifierCapital("SARL", 10_000, 1_500)[0].message).toContain("20 %");
    expect(verifierCapital("SARL", 10_000, 2_000)).toEqual([]);
  });

  it("une SAS doit libérer la moitié", () => {
    expect(verifierCapital("SAS", 10_000, 4_000)[0].message).toContain("50 %");
    expect(verifierCapital("SAS", 10_000, 5_000)).toEqual([]);
  });

  it("une SCI n'a pas de libération minimale", () => {
    expect(verifierCapital("SCI", 1_000, 0)).toEqual([]);
  });

  it("libérer plus que le capital est refusé", () => {
    expect(verifierCapital("SASU", 1_000, 2_000).some((a) => a.champ === "libere")).toBe(true);
  });
});

describe("nombre d'associés", () => {
  it("une SARL en demande au moins deux", () => {
    expect(verifierAssocies("SARL", 1)[0].message).toContain("2 associés");
    expect(verifierAssocies("SARL", 2)).toEqual([]);
  });

  it("une SARL en admet cent au plus", () => {
    expect(verifierAssocies("SARL", 101)[0].message).toContain("100");
    expect(verifierAssocies("SARL", 100)).toEqual([]);
  });

  it("une SASU n'en admet qu'un", () => {
    expect(verifierAssocies("SASU", 2)[0].champ).toBe("associes");
    expect(verifierAssocies("SASU", 1)).toEqual([]);
  });

  it("une SAS n'a pas de plafond", () => {
    expect(verifierAssocies("SAS", 250)).toEqual([]);
  });
});

describe("répartition du capital", () => {
  it("la somme des parts doit faire le capital", () => {
    expect(verifierRepartition(10_000, [6_000, 4_000])).toEqual([]);
  });

  it("dit ce qu'il reste à répartir", () => {
    expect(verifierRepartition(10_000, [6_000, 3_000])[0].message).toMatch(
      /Il reste 1\s000 euros à répartir/
    );
  });

  it("dit de combien on dépasse", () => {
    expect(verifierRepartition(10_000, [6_000, 5_000])[0].message).toContain("dépasse");
  });

  it("les centimes ne créent pas d'écart fantôme", () => {
    // 0.1 + 0.2 vaut 0.30000000000000004 en virgule flottante : comparer en
    // euros ferait échouer une répartition pourtant juste.
    expect(verifierRepartition(0.3, [0.1, 0.2])).toEqual([]);
  });
});

describe("qui représente une société associée", () => {
  /*
   * Le titre part dans l'acte : « gérant » d'une SAS ou « président » d'une SARL sont
   * des fonctions qui n'existent pas dans ces formes, et le greffe les relève.
   */
  it("propose les titres de la forme, et eux seuls", () => {
    expect(qualitesDuRepresentant("SAS")).toContain("Président");
    expect(qualitesDuRepresentant("SAS")).not.toContain("Gérant");
    expect(qualitesDuRepresentant("SARL")).toContain("Gérant");
    expect(qualitesDuRepresentant("SARL")).not.toContain("Président");
    expect(qualitesDuRepresentant("SCI")).toContain("Gérant");
  });

  /* Celui qui signe peut n'avoir aucun titre : il porte alors un pouvoir. */
  it("prévoit le signataire sans fonction, quelle que soit la forme", () => {
    for (const forme of ["SAS", "SARL", "SCI", "GmbH", null]) {
      expect(qualitesDuRepresentant(forme)).toContain("Mandataire");
      expect(qualitesDuRepresentant(forme)).toContain("Associé");
    }
  });

  /* Forme inconnue - étrangère, rare : on n'exclut aucun titre. */
  it("ne tranche pas sur une forme qu'elle ne connaît pas", () => {
    const inconnue = qualitesDuRepresentant("Limited");
    expect(inconnue).toContain("Président");
    expect(inconnue).toContain("Gérant");
  });
});

describe("le mot et le nombre, dans les messages sur les associés", () => {
  /*
   * « Une SASU ne peut pas dépasser 1 associés » : le pluriel ne s'accordait pas, et le
   * mot ne suivait pas la forme - le reste de l'écran dit « actionnaire » pour une
   * société par actions.
   */
  it("une société par actions a des actionnaires", () => {
    expect(verifierAssocies("SASU", 2)[0].message).toBe(
      "Une SASU ne peut pas dépasser un actionnaire"
    );
    expect(verifierAssocies("SAS", 1)[0].message).toContain("2 actionnaires");
  });

  it("une société de personnes a des associés", () => {
    expect(verifierAssocies("EURL", 2)[0].message).toBe(
      "Une EURL ne peut pas dépasser un associé"
    );
    expect(verifierAssocies("SARL", 1)[0].message).toContain("2 associés");
  });
});
