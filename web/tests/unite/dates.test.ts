import { describe, it, expect } from "vitest";
import { dateEnTete, formaterDate } from "@/lib/dates";

describe("la date en tête de page", () => {
  it("porte la capitale initiale", () => {
    // Intl rend « jeudi 13 août 2026 » : correct au fil d'une phrase, pas en tête de
    // page. La règle vivait en deux copies, dont une seule capitalisait.
    expect(dateEnTete(new Date(2026, 7, 13, 12))).toBe("Jeudi 13 août 2026");
  });

  it("capitalise quel que soit le jour", () => {
    expect(dateEnTete(new Date(2026, 7, 10, 12))).toBe("Lundi 10 août 2026");
    expect(dateEnTete(new Date(2026, 0, 1, 12))).toBe("Jeudi 1 janvier 2026");
  });

  it("la date longue, elle, reste au fil du texte", () => {
    expect(formaterDate(new Date(2026, 7, 13, 12))).toBe("13 août 2026");
  });
});
