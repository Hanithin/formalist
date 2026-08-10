import { describe, it, expect } from "vitest";
import {
  prefixeGabarit,
  documentsAProduire,
  piecesAttendues,
} from "@/domain/formalite/documents";

describe("choix du gabarit", () => {
  it("chaque forme a son préfixe", () => {
    expect(prefixeGabarit("SASU")).toBe("sasu");
    expect(prefixeGabarit("SAS")).toBe("sas");
    expect(prefixeGabarit("SARL")).toBe("sarl");
    expect(prefixeGabarit("SCI")).toBe("sci");
  });

  it("une EURL reprend les gabarits SARL", () => {
    // Une EURL est une SARL à associé unique : il n'existe pas d'autre jeu.
    expect(prefixeGabarit("EURL")).toBe("sarl");
  });

  it("une forme inconnue ne produit aucun gabarit", () => {
    expect(prefixeGabarit("SNC")).toBeNull();
    expect(prefixeGabarit(null)).toBeNull();
  });
});

describe("documents à produire", () => {
  it("les documents de base sont toujours produits", () => {
    const types = documentsAProduire({ forme: "SASU" }).map((d) => d.type);
    expect(types).toContain("statuts");
    expect(types).toContain("liste-souscripteurs");
    expect(types).toContain("declaration-non-condamnation");
  });

  it("le nom du gabarit suit la forme", () => {
    const statuts = documentsAProduire({ forme: "SARL" }).find((d) => d.type === "statuts");
    expect(statuts?.gabarit).toBe("sarl-statuts.docx");
  });

  it("une EURL produit les gabarits SARL", () => {
    const statuts = documentsAProduire({ forme: "EURL" }).find((d) => d.type === "statuts");
    expect(statuts?.gabarit).toBe("sarl-statuts.docx");
  });

  it("l'attestation du conjoint n'est produite que si elle a lieu d'être", () => {
    expect(documentsAProduire({ forme: "SARL" }).some((d) => d.type === "conjoint")).toBe(false);
    expect(
      documentsAProduire({ forme: "SARL", conjointMarie: true }).some((d) => d.type === "conjoint")
    ).toBe(true);
  });

  it("une forme inconnue ne produit rien plutôt qu'un gabarit inventé", () => {
    expect(documentsAProduire({ forme: "SNC" })).toEqual([]);
  });
});

describe("pièces attendues du client", () => {
  it("identité et domicile sont toujours demandées", () => {
    const ids = piecesAttendues("SASU").map((p) => p.identifiant);
    expect(ids).toContain("identite");
    expect(ids).toContain("domicile");
  });

  it("l'attestation de dépôt n'est demandée que si la forme en exige un", () => {
    expect(piecesAttendues("SASU").map((p) => p.identifiant)).toContain("depot-capital");
    // Une SCI ne dépose pas de capital : la demander n'a pas de sens.
    expect(piecesAttendues("SCI").map((p) => p.identifiant)).not.toContain("depot-capital");
  });

  it("l'attestation de dépôt n'accepte que le PDF", () => {
    const piece = piecesAttendues("SASU").find((p) => p.identifiant === "depot-capital");
    expect(piece?.formats).toEqual([".pdf"]);
  });
});
