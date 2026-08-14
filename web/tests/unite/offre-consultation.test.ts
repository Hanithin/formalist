import { describe, it, expect } from "vitest";
import {
  PRIX_HT_CENTIMES,
  PRIX_TTC_CENTIMES,
  TAUX_TVA_POURCENT,
  tvaDe,
  ttcDe,
  montantLisible,
  detailDuPrix,
} from "@/domain/consultation/offre";

describe("le prix d'une consultation", () => {
  it("est annoncé hors taxes", () => {
    expect(PRIX_HT_CENTIMES).toBe(9900);
    expect(montantLisible(PRIX_HT_CENTIMES)).toBe("99 €");
  });

  it("porte la TVA à 20 %", () => {
    expect(TAUX_TVA_POURCENT).toBe(20);
    expect(tvaDe(9900)).toBe(1980);
    expect(ttcDe(9900)).toBe(11880);
    expect(PRIX_TTC_CENTIMES).toBe(11880);
  });

  it("calcule la TVA en nombres entiers", () => {
    /*
     * 9900 * 0.2 ne vaut pas exactement 1980 en virgule flottante. Un centime perdu
     * ici serait un centime d'écart entre le total affiché et le montant encaissé.
     */
    expect(Number.isInteger(tvaDe(9900))).toBe(true);
    expect(Number.isInteger(tvaDe(3333))).toBe(true);
    expect(tvaDe(3333)).toBe(667);
  });

  it("le total est ce qui sera encaissé, pas le prix affiché", () => {
    const detail = detailDuPrix();
    expect(detail.ht + detail.tva).toBe(detail.ttc);
    expect(detail.ttc).toBe(PRIX_TTC_CENTIMES);
  });
});

describe("l'écriture d'un montant", () => {
  it("n'écrit les centimes que s'il y en a", () => {
    expect(montantLisible(9900)).toBe("99 €");
    expect(montantLisible(11880)).toBe("118,80 €");
    expect(montantLisible(0)).toBe("0 €");
  });

  it("garde les deux décimales quand elles comptent", () => {
    // 118,8 € se lit mal sur une ligne de total : on écrit 118,80 €.
    expect(montantLisible(11880)).not.toBe("118,8 €");
  });
});
