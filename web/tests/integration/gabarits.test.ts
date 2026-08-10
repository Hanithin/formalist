import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import { documentsAProduire } from "@/domain/formalite/documents";
import { FORMES_PROPOSEES } from "@/domain/formalite/formes";

/**
 * Chaque gabarit annoncé doit exister sur le disque.
 *
 * Sans ce test, une forme proposée sans gabarit ne se découvre qu'au moment où un
 * client valide son dossier - c'est ainsi que la SCI s'est retrouvée à réclamer
 * une liste de souscripteurs qui n'existe pas.
 */
const GABARITS = path.join(process.cwd(), "..", "templates");

describe("gabarits de documents", () => {
  for (const forme of FORMES_PROPOSEES) {
    it("chaque document annoncé pour une " + forme + " a son gabarit", () => {
      const documents = documentsAProduire({ forme, conjointMarie: true });
      expect(documents.length).toBeGreaterThan(0);

      const absents = documents
        .map((d) => d.gabarit)
        .filter((g) => !existsSync(path.join(GABARITS, g)));

      expect(absents).toEqual([]);
    });
  }
});
