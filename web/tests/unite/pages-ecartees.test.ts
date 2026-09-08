import { describe, it, expect } from "vitest";
import { phraseDesPagesEcartees } from "@/domain/modification/edition";

/*
 * La phrase nomme les pages plutôt que de les compter.
 *
 * L'avocat retire une page des statuts - une annexe périmée, une page blanche - et le
 * document produit ne la reprendra pas. Lui dire « 1 page écartée » l'oblige à
 * retrouver laquelle ; lui dire « la page 4 » lui épargne le détour.
 */
describe("les pages écartées du document produit", () => {
  it("ne dit rien quand rien n'est écarté", () => {
    expect(phraseDesPagesEcartees([])).toBe("");
  });

  it("nomme la page au singulier", () => {
    expect(phraseDesPagesEcartees([4])).toBe("La page 4 ne sera pas reprise.");
  });

  it("énumère deux pages avec « et »", () => {
    expect(phraseDesPagesEcartees([4, 7])).toBe("Les pages 4 et 7 ne seront pas reprises.");
  });

  it("sépare par des virgules au-delà de deux", () => {
    expect(phraseDesPagesEcartees([4, 7, 9])).toBe("Les pages 4, 7 et 9 ne seront pas reprises.");
  });

  /* Les pages se retirent dans l'ordre où l'on les visite, non dans celui du document. */
  it("remet les pages dans l'ordre", () => {
    expect(phraseDesPagesEcartees([9, 4, 7])).toBe("Les pages 4, 7 et 9 ne seront pas reprises.");
  });
});
