import { describe, it, expect } from "vitest";
import {
  MODIFICATIONS,
  definitionModification,
  gabaritProcesVerbal,
  documentsModification,
  verifierModification,
} from "@/domain/formalite/modifications";

describe("gabarit de procès-verbal", () => {
  it("une société à plusieurs associés emploie le gabarit de sa forme", () => {
    expect(gabaritProcesVerbal("SARL")).toBe("modif-pv-transfert-siege-sarl.docx");
    expect(gabaritProcesVerbal("SAS")).toBe("modif-pv-transfert-siege-sas.docx");
    expect(gabaritProcesVerbal("SCI")).toBe("modif-pv-transfert-siege-sci.docx");
  });

  it("une société à associé unique emploie la variante unipersonnelle", () => {
    // Sans assemblée, la décision est prise seul : le gabarit « sasu » porte
    // cette formulation. Une EURL l'emploie donc aussi, là où sa création
    // utilise les gabarits SARL.
    expect(gabaritProcesVerbal("SASU")).toBe("modif-pv-transfert-siege-sasu.docx");
    expect(gabaritProcesVerbal("EURL")).toBe("modif-pv-transfert-siege-sasu.docx");
  });

  it("une forme inconnue ne rend aucun gabarit", () => {
    expect(gabaritProcesVerbal("SNC")).toBeNull();
    expect(gabaritProcesVerbal(null)).toBeNull();
  });
});

describe("documents produits", () => {
  it("toute modification produit un procès-verbal", () => {
    const documents = documentsModification("denomination", "SARL");
    expect(documents[0].titre).toContain("Procès-verbal");
  });

  it("un changement de capital ajoute un avenant aux statuts", () => {
    const gabarits = documentsModification("augmentation_capital", "SARL").map((d) => d.gabarit);
    expect(gabarits).toContain("modif-avenant-statuts.docx");
  });

  it("une cession ajoute l'acte de cession", () => {
    const gabarits = documentsModification("cession_parts", "SARL").map((d) => d.gabarit);
    expect(gabarits).toContain("modif-acte-cession.docx");
  });

  it("un type inconnu ne produit rien plutôt qu'un gabarit inventé", () => {
    expect(documentsModification("changement_de_couleur", "SARL")).toEqual([]);
  });
});

describe("champs requis", () => {
  it("un transfert de siège demande la nouvelle adresse complète", () => {
    const anomalies = verifierModification("transfert_siege", {});
    expect(anomalies.map((a) => a.champ)).toEqual([
      "nouvelleAdresse",
      "nouveauCodePostal",
      "nouvelleVille",
    ]);
  });

  it("le code postal suit la même règle qu'à la création", () => {
    const anomalies = verifierModification("transfert_siege", {
      nouvelleAdresse: "1 rue Neuve",
      nouveauCodePostal: "750",
      nouvelleVille: "Paris",
    });
    expect(anomalies[0].message).toContain("cinq chiffres");
  });

  it("un montant nul ou négatif est refusé", () => {
    expect(verifierModification("augmentation_capital", { nouveauCapital: 0 })).toHaveLength(1);
    expect(verifierModification("augmentation_capital", { nouveauCapital: -100 })).toHaveLength(1);
    expect(verifierModification("augmentation_capital", { nouveauCapital: 5000 })).toEqual([]);
  });

  it("un champ rempli d'espaces ne compte pas comme renseigné", () => {
    const anomalies = verifierModification("denomination", { nouvelleDenomination: "   " });
    expect(anomalies).toHaveLength(1);
  });

  it("un type inconnu est signalé, pas ignoré", () => {
    expect(verifierModification("inconnu", {})[0].champ).toBe("type");
  });
});

describe("intégrité du catalogue", () => {
  it("chaque modification a un libellé, une description et au moins un champ", () => {
    for (const m of MODIFICATIONS) {
      expect(m.libelle).not.toBe("");
      expect(m.description).not.toBe("");
      expect(m.champs.length).toBeGreaterThan(0);
    }
  });

  it("aucun code en double", () => {
    const codes = MODIFICATIONS.map((m) => m.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("chaque code se retrouve par sa définition", () => {
    for (const m of MODIFICATIONS) {
      expect(definitionModification(m.code)?.libelle).toBe(m.libelle);
    }
  });
});
