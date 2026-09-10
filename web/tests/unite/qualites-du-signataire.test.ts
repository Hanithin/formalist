import { describe, it, expect } from "vitest";
import { qualitesDuSignataire } from "@/domain/modification/types";

describe("les qualités du signataire", () => {
  it("n'offre que le gérant à une société par parts", () => {
    expect(qualitesDuSignataire("SARL")).toEqual([
      "gérant",
      "gérante",
      "représentant légal",
      "représentante légale",
    ]);
    expect(qualitesDuSignataire("SCI")).toContain("gérante");
    expect(qualitesDuSignataire("SARL")).not.toContain("président");
  });

  it("offre le président et le directeur général à une société par actions", () => {
    expect(qualitesDuSignataire("SAS")).toEqual([
      "président",
      "présidente",
      "directeur général",
      "directrice générale",
      "représentant légal",
      "représentante légale",
    ]);
    expect(qualitesDuSignataire("SASU")).not.toContain("gérant");
    expect(qualitesDuSignataire("SELAS")).toContain("président");
  });

  it("ne retranche rien tant que la forme est inconnue", () => {
    for (const forme of [null, undefined, "", "  ", "GMBH"]) {
      const qualites = qualitesDuSignataire(forme);
      expect(qualites).toContain("gérant");
      expect(qualites).toContain("président");
    }
  });

  it("accepte la forme quelle que soit sa casse", () => {
    expect(qualitesDuSignataire("sas")).toEqual(qualitesDuSignataire("SAS"));
  });
});
