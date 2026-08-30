import { describe, it, expect } from "vitest";
import { phraseDesAnomalies } from "@/domain/formalite/anomalies";

describe("ce qui manque, dit en une phrase", () => {
  it("ne recolle pas un point à un point", () => {
    /* Le message du code de commerce porte le sien : la phrase en ajoutait un second. */
    expect(
      phraseDesAnomalies([
        "L'affectation ne tombe pas juste : il reste 10 000,00 € à répartir.",
        "La dotation à la réserve légale est inférieure au minimum légal. Une résolution qui l'ignore est nulle (article L. 232-10 du code de commerce).",
      ])
    ).toBe(
      "L'affectation ne tombe pas juste : il reste 10 000,00 € à répartir ; " +
        "La dotation à la réserve légale est inférieure au minimum légal. " +
        "Une résolution qui l'ignore est nulle (article L. 232-10 du code de commerce)."
    );
  });

  it("laisse un fragment tranquille", () => {
    expect(phraseDesAnomalies(["Le nom est requis"])).toBe("Le nom est requis.");
  });

  it("ne dit rien quand il n'y a rien à dire", () => {
    expect(phraseDesAnomalies([])).toBe("");
    expect(phraseDesAnomalies(["", "   "])).toBe("");
  });
});
