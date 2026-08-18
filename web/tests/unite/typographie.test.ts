import { describe, it, expect } from "vitest";
import {
  FINE,
  INSECABLE,
  fautesDeTypographie,
  guillemets,
  ponctuationDouble,
  tiretsSimples,
  typographier,
  unitesLiees,
} from "@/domain/document/typographie";

/**
 * La typographie d'un acte.
 *
 * Les gabarits sortaient « au capital de 2000 euros », « la société «ACME» » sans le
 * moindre espace dans les guillemets, et « Article 1 — Objet » avec un quadratin
 * qu'aucun autre écrit de l'application n'emploie.
 */

describe("les tirets", () => {
  it("le cadratin et le demi-cadratin deviennent un tiret simple", () => {
    expect(tiretsSimples("Article 1 — Objet")).toBe("Article 1 - Objet");
    expect(tiretsSimples("RCS Antibes – SIREN")).toBe("RCS Antibes - SIREN");
  });
});

describe("la ponctuation double", () => {
  it("reçoit une espace fine insécable", () => {
    expect(ponctuationDouble("Sont présents :")).toBe("Sont présents" + FINE + ":");
    expect(ponctuationDouble("Jean ; Marie")).toBe("Jean" + FINE + "; Marie");
    expect(ponctuationDouble("Vraiment ?")).toBe("Vraiment" + FINE + "?");
  });

  it("remplace une espace ordinaire déjà posée", () => {
    // Sans cela on obtiendrait deux espaces, dont une sécable : le « : » passerait à la ligne.
    expect(ponctuationDouble("Sont présents :")).not.toContain(" :");
  });

  it("laisse l'heure tranquille", () => {
    // « 14:30 » n'est pas de la ponctuation.
    expect(ponctuationDouble("à 14:30")).toBe("à 14:30");
  });
});

describe("les guillemets", () => {
  it("ne collent jamais au mot", () => {
    expect(guillemets("«ACME»")).toBe("«" + FINE + "ACME" + FINE + "»");
  });

  it("une espace ordinaire devient fine", () => {
    expect(guillemets("« ACME »")).toBe("«" + FINE + "ACME" + FINE + "»");
  });
});

describe("les nombres et leurs unités", () => {
  it("ne se coupent pas en fin de ligne", () => {
    expect(unitesLiees("2 000 euros")).toBe("2" + INSECABLE + "000" + INSECABLE + "euros");
    expect(unitesLiees("50 %")).toBe("50" + INSECABLE + "%");
    expect(unitesLiees("99 ans")).toBe("99" + INSECABLE + "ans");
    expect(unitesLiees("200 parts")).toBe("200" + INSECABLE + "parts");
  });
});

describe("tout, en une passe", () => {
  it("un titre et une phrase d'acte", () => {
    const rendu = typographier(
      "RÉSOLUTION UNIQUE — TRANSFERT DU SIÈGE : la société «ACME», au capital de 2 000 euros"
    );
    expect(rendu).toContain("UNIQUE - TRANSFERT");
    expect(rendu).toContain("SIÈGE" + FINE + ":");
    expect(rendu).toContain("«" + FINE + "ACME" + FINE + "»");
    expect(rendu).toContain("2" + INSECABLE + "000" + INSECABLE + "euros");
  });

  it("ne laisse aucune faute derrière elle", () => {
    const rendu = typographier("Article 1 — Objet : «ACME» détient 2 000 parts ; c'est tout !");
    expect(fautesDeTypographie(rendu)).toEqual([]);
  });
});

describe("le relevé des fautes", () => {
  it("dit où elles sont, non seulement qu'il y en a", () => {
    // Sur un acte de trois pages, « il reste un quadratin » ne suffit pas.
    const fautes = fautesDeTypographie("Article 1 — Objet, la société «ACME» présente;");
    expect(fautes.join(" ")).toContain("cadratin");
    expect(fautes.join(" ")).toContain("guillemet collé");
    expect(fautes.join(" ")).toContain("ponctuation collée");
  });
});
