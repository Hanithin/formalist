import { describe, it, expect } from "vitest";
import { evaluer, QUOTA_CONTACT, type Quota } from "@/domain/contenu/limitation";

const MAINTENANT = new Date("2026-08-10T12:00:00Z");
const quota: Quota = { maximum: 3, fenetreMs: 60 * 60 * 1000 };

function ilYaMinutes(n: number): Date {
  return new Date(MAINTENANT.getTime() - n * 60_000);
}

describe("limitation de débit", () => {
  it("laisse passer quand rien n'a été tenté", () => {
    const v = evaluer(quota, [], MAINTENANT);
    expect(v.autorise).toBe(true);
    expect(v.restant).toBe(2);
  });

  it("laisse passer la dernière tentative autorisée", () => {
    const v = evaluer(quota, [ilYaMinutes(10), ilYaMinutes(20)], MAINTENANT);
    expect(v.autorise).toBe(true);
    expect(v.restant).toBe(0);
  });

  it("refuse au-delà du quota", () => {
    const v = evaluer(quota, [ilYaMinutes(5), ilYaMinutes(10), ilYaMinutes(20)], MAINTENANT);
    expect(v.autorise).toBe(false);
    expect(v.reessayerLe).toBeInstanceOf(Date);
  });

  it("ignore les tentatives sorties de la fenêtre", () => {
    const v = evaluer(quota, [ilYaMinutes(61), ilYaMinutes(120), ilYaMinutes(5)], MAINTENANT);
    expect(v.autorise).toBe(true);
  });

  it("indique quand une place se libère", () => {
    const v = evaluer(quota, [ilYaMinutes(50), ilYaMinutes(30), ilYaMinutes(10)], MAINTENANT);
    // La plus ancienne des trois sort de la fenêtre dans 10 minutes
    expect(v.reessayerLe?.toISOString()).toBe("2026-08-10T12:10:00.000Z");
  });

  it("le quota de contact est de trois messages par heure", () => {
    expect(QUOTA_CONTACT).toEqual({ maximum: 3, fenetreMs: 3_600_000 });
  });
});
