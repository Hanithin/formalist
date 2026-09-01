import { describe, it, expect } from "vitest";
import { PAYS, NOMS_DE_PAYS, NATIONALITES, paysNomme, codeDuPays } from "@/domain/formalite/pays";

/**
 * La table des pays.
 *
 * Elle alimente deux champs qui partent tels quels dans les actes, et un code que le
 * guichet unique refuse s'il est faux. Une entrée mal formée ne se voit ni à l'écran -
 * la liste propose ce qu'elle contient - ni à la relecture d'un dossier : seulement au
 * refus du dépôt, ou dans une pièce déposée au greffe.
 */
describe("la table des pays", () => {
  it("porte les États que l'on rencontre", () => {
    /* 193 membres de l'ONU, deux observateurs, et quelques États reconnus en partie. */
    expect(PAYS.length).toBeGreaterThan(190);
  });

  it("ne nomme jamais deux fois le même pays, ni le même code", () => {
    expect(new Set(NOMS_DE_PAYS).size).toBe(PAYS.length);
    expect(new Set(PAYS.map((p) => p.code)).size).toBe(PAYS.length);
  });

  it("donne à chaque entrée un code ISO et une nationalité", () => {
    for (const pays of PAYS) {
      expect(pays.code, pays.nom).toMatch(/^[A-Z]{3}$/);
      expect(pays.nationalite.length, pays.nom).toBeGreaterThan(2);
      expect(pays.nom.length, pays.code).toBeGreaterThan(2);
    }
  });

  /*
   * La nationalité s'accorde avec le mot « nationalité », non avec la personne : les
   * actes écrivent « Monsieur Bertin, de nationalité française ». Une forme masculine
   * dans la table sortirait telle quelle.
   */
  it("écrit les nationalités au féminin", () => {
    expect(NATIONALITES).toContain("Française");
    expect(NATIONALITES).toContain("Algérienne");
    expect(NATIONALITES).toContain("Allemande");
    expect(NATIONALITES).not.toContain("Français");
    expect(NATIONALITES).not.toContain("Allemand");
  });

  it("range les pays par ordre alphabétique, accents ignorés", () => {
    const rang = (n: string) => NOMS_DE_PAYS.indexOf(n);
    expect(rang("Afghanistan")).toBeLessThan(rang("Algérie"));
    expect(rang("Égypte")).toBeLessThan(rang("Espagne"));
    expect(rang("Zambie")).toBeLessThan(rang("Zimbabwe"));
  });

  /* Les deux Congo portent leur nom d'état civil, non la forme courte de CLDR. */
  it("nomme les deux Congo comme l'état civil les nomme", () => {
    expect(NOMS_DE_PAYS).toContain("République du Congo");
    expect(NOMS_DE_PAYS).toContain("République démocratique du Congo");
  });
});

describe("retrouver un pays", () => {
  it("se moque des accents et de la casse", () => {
    expect(paysNomme("algerie")?.code).toBe("DZA");
    expect(paysNomme("ALGÉRIE")?.code).toBe("DZA");
    expect(paysNomme("  France ")?.code).toBe("FRA");
  });

  /*
   * Rien plutôt qu'un repli sur la France.
   *
   * Le dépôt au guichet écrivait « FRA » quel que soit le pays saisi : une personne née
   * à Alger y était déclarée née en France. Un pays inconnu doit se signaler, non se
   * faire passer pour un autre.
   */
  it("ne devine pas un pays qu'elle ne connaît pas", () => {
    expect(codeDuPays("Yougoslavie")).toBeUndefined();
    expect(codeDuPays("")).toBeUndefined();
    expect(codeDuPays(undefined)).toBeUndefined();
  });

  it("rend le code ISO attendu par le guichet", () => {
    expect(codeDuPays("France")).toBe("FRA");
    expect(codeDuPays("Belgique")).toBe("BEL");
    expect(codeDuPays("Maroc")).toBe("MAR");
    expect(codeDuPays("États-Unis")).toBe("USA");
  });
});
