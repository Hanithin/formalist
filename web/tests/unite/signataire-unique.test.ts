import { describe, it, expect } from "vitest";
import {
  pourquoiUnSeulSignataire,
  qualitesDuSignataire,
} from "@/domain/modification/types";

/**
 * Un seul signataire, et la phrase qui l'explique.
 *
 * Le bloc du représentant légal ne décrit pas la direction de la société : il désigne
 * qui signera le pouvoir donné au cabinet. Devant trois cogérants, on cherchait où
 * saisir les deux autres, et l'on croyait le formulaire incomplet.
 */

describe("pourquoi un seul signataire suffit", () => {
  it("cite le texte qui le dit, dans une société à parts sociales", () => {
    for (const forme of ["SARL", "EURL", "SCI", "SNC"]) {
      const phrase = pourquoiUnSeulSignataire(forme);
      expect(phrase).toContain("plusieurs gérants");
      expect(phrase).toContain("L. 223-18");
    }
  });

  it("ne cite pas ce texte là où il ne s'applique pas", () => {
    // L'article est écrit pour la SARL : l'invoquer sous une SAS serait un contresens.
    for (const forme of ["SAS", "SASU", "SA"]) {
      const phrase = pourquoiUnSeulSignataire(forme);
      expect(phrase).not.toContain("223-18");
      expect(phrase).toMatch(/une seule signature suffit/i);
    }
  });

  it("répond aussi quand la forme n'est pas encore choisie", () => {
    // C'est l'état de tout dossier à sa première étape : le bloc s'affiche déjà.
    for (const forme of [null, undefined, "", "FORME INCONNUE"]) {
      expect(pourquoiUnSeulSignataire(forme).length).toBeGreaterThan(0);
    }
  });
});

describe("les qualités proposées au signataire", () => {
  it("offre la co-gérance là où elle existe", () => {
    // Des statuts qui instituent plusieurs gérants les nomment « cogérants », et c'est
    // cette qualité que le pouvoir doit porter mot pour mot.
    expect(qualitesDuSignataire("SARL")).toContain("cogérant");
    expect(qualitesDuSignataire("SARL")).toContain("cogérante");
    expect(qualitesDuSignataire("SCI")).toContain("cogérant");
  });

  it("ne l'offre pas à une société par actions", () => {
    expect(qualitesDuSignataire("SAS")).not.toContain("cogérant");
    expect(qualitesDuSignataire("SAS")).toContain("président");
  });

  it("ne retranche rien tant que la forme est inconnue", () => {
    const toutes = qualitesDuSignataire(null);
    expect(toutes).toContain("cogérant");
    expect(toutes).toContain("président");
  });
});
