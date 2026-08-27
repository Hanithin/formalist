import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import { documentsAProduire } from "@/domain/formalite/documents";
import {
  documentsModification,
  MODIFICATIONS,
  formesAvecGabaritHistorique,
} from "@/domain/formalite/modifications";
import { FORMES_PROPOSEES } from "@/domain/formalite/formes";

/**
 * Chaque gabarit annoncé doit exister sur le disque.
 *
 * Sans ce test, une forme proposée sans gabarit ne se découvre qu'au moment où un
 * client valide son dossier - c'est ainsi que la SCI s'est retrouvée à réclamer
 * une liste de souscripteurs qui n'existe pas, et que la SA était proposée sans
 * qu'aucun document puisse être produit.
 */
const GABARITS = path.join(process.cwd(), "..", "templates");

function absents(gabarits: string[]): string[] {
  return gabarits.filter((g) => !existsSync(path.join(GABARITS, g)));
}

describe("gabarits de création", () => {
  for (const forme of FORMES_PROPOSEES) {
    it("chaque document annoncé pour une " + forme + " a son gabarit", () => {
      const documents = documentsAProduire({ forme, conjointMarie: true });
      expect(documents.length).toBeGreaterThan(0);
      expect(absents(documents.map((d) => d.gabarit))).toEqual([]);
    });
  }
});

describe("gabarits de modification", () => {
  for (const forme of formesAvecGabaritHistorique()) {
    it("chaque modification d'une " + forme + " a ses gabarits", () => {
      for (const modification of MODIFICATIONS) {
        const documents = documentsModification(modification.code, forme);
        expect(documents.length, modification.code).toBeGreaterThan(0);
        expect(absents(documents.map((d) => d.gabarit)), modification.code).toEqual([]);
      }
    });
  }
});
