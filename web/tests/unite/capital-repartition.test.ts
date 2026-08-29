import { describe, it, expect } from "vitest";
import { repartitionDesTitres } from "@/domain/formalite/capital";
import { elider } from "@/domain/formalite/lettres";

/**
 * Où en est la répartition du capital, dit en français.
 *
 * L'étape posait une barre de progression et un camembert avant les deux champs qui
 * les alimentent : on arrivait sur deux graphiques à zéro pour cent sans savoir que
 * le premier geste était de saisir le nombre de titres émis. La phrase le dit à
 * l'endroit où l'on répartit.
 */

describe("l'élision de « de »", () => {
  it("s'élide devant une voyelle, non devant une consonne", () => {
    // « Nombre total de actions » s'affichait sur toutes les sociétés par actions.
    expect(elider("actions")).toBe("d'actions");
    expect(elider("parts")).toBe("de parts");
  });

  it("ne suppose rien du h, muet ici et aspiré là", () => {
    expect(elider("hangar")).toBe("de hangar");
  });
});

describe("l'état de la répartition", () => {
  it("dit le premier geste tant qu'aucun titre n'est émis", () => {
    const rien = repartitionDesTitres("SAS", 0, 0);

    expect(rien.etat).toBe("vide");
    expect(rien.phrase).toBe("Indiquez d'abord le nombre total d'actions ci-dessus.");
  });

  it("compte ce qui reste, avec le mot de la forme", () => {
    expect(repartitionDesTitres("SAS", 300, 500).phrase).toBe(
      "300 actions sur 500, il en reste 200 à attribuer."
    );
    // Une SARL n'émet pas d'actions mais des parts sociales.
    expect(repartitionDesTitres("SARL", 300, 500).phrase).toBe(
      "300 parts sur 500, il en reste 200 à attribuer."
    );
  });

  it("accorde le dernier titre au féminin : une action, une part", () => {
    expect(repartitionDesTitres("SAS", 499, 500).phrase).toContain("il en reste une à attribuer");
  });

  it("laisse le singulier à zéro attribuée", () => {
    // Zéro prend le singulier : « 0 action sur 500 ».
    expect(repartitionDesTitres("SAS", 0, 500).phrase).toBe(
      "0 action sur 500, il en reste 500 à attribuer."
    );
  });

  it("le dit quand tout est attribué", () => {
    const juste = repartitionDesTitres("SAS", 500, 500);

    expect(juste.etat).toBe("juste");
    expect(juste.phrase).toBe("Les 500 actions sont attribuées.");
  });

  it("ne met pas au pluriel une société à un seul titre", () => {
    expect(repartitionDesTitres("SASU", 1, 1).phrase).toBe("L'unique action est attribuée.");
  });

  it("dit le dépassement plutôt que de le plafonner", () => {
    /*
     * La barre s'arrêtait à cent pour cent quoi qu'on saisisse : on répartissait
     * cinq cents titres de trop sans que rien ne l'indique avant la validation.
     */
    const trop = repartitionDesTitres("SAS", 600, 500);

    expect(trop.etat).toBe("trop");
    expect(trop.reste).toBe(-100);
    expect(trop.phrase).toBe("600 actions attribuées pour 500 émises : 100 de trop.");
  });

  it("sépare les milliers, comme le reste de l'application", () => {
    expect(repartitionDesTitres("SAS", 1500, 2000).phrase).toMatch(/1\s500 actions sur 2\s000/);
  });
});
