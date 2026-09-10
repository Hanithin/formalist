import { describe, it, expect } from "vitest";
import { effetDeLaDivision } from "@/domain/modification/air";

describe("ce que la division du nominal change", () => {
  it("multiplie les actions et divise le nominal, sans toucher au capital", () => {
    const effet = effetDeLaDivision(1000, 1000, 10)!;

    expect(effet.nominalAvant).toBe(1);
    expect(effet.nominalApres).toBeCloseTo(0.1, 10);
    expect(effet.actionsAvant).toBe(1000);
    expect(effet.actionsApres).toBe(10000);
    // Le capital est l'invariant : c'est tout l'intérêt de l'opération.
    expect(effet.actionsApres * effet.nominalApres).toBeCloseTo(1000, 6);
  });

  it("rend le nominal actuel quand on ne divise pas", () => {
    const effet = effetDeLaDivision(37500, 2500, 1)!;
    expect(effet.nominalAvant).toBe(15);
    expect(effet.nominalApres).toBe(15);
    expect(effet.actionsApres).toBe(2500);
  });

  it("tient les nominaux qui ne tombent pas juste", () => {
    const effet = effetDeLaDivision(1000, 3, 100)!;
    expect(effet.nominalAvant).toBeCloseTo(333.3333, 4);
    expect(effet.nominalApres).toBeCloseTo(3.333333, 6);
    expect(effet.actionsApres).toBe(300);
  });

  it("ne calcule rien sans capital ni sans actions", () => {
    expect(effetDeLaDivision(0, 1000, 10)).toBeNull();
    expect(effetDeLaDivision(1000, 0, 10)).toBeNull();
    expect(effetDeLaDivision(-1000, 1000, 10)).toBeNull();
    expect(effetDeLaDivision(Number.NaN, 1000, 10)).toBeNull();
    expect(effetDeLaDivision(1000, 1000, 0)).toBeNull();
  });
});
