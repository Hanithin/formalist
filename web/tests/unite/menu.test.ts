import { describe, it, expect } from "vitest";
import { MENU, menuPour, entreeActive } from "@/domain/navigation/menu";

describe("menu selon les rôles", () => {
  it("un client ne voit ni l'espace avocat ni l'administration", () => {
    const liens = menuPour(["user"]).flatMap((g) => g.entrees.map((e) => e.lien));
    expect(liens).not.toContain("/avocat");
    expect(liens).not.toContain("/administration");
    expect(liens).toContain("/tableau-de-bord");
  });

  it("un avocat voit l'espace avocat, pas l'administration", () => {
    const liens = menuPour(["avocat"]).flatMap((g) => g.entrees.map((e) => e.lien));
    expect(liens).toContain("/avocat");
    expect(liens).not.toContain("/administration");
  });

  it("un administrateur voit tout", () => {
    const liens = menuPour(["admin"]).flatMap((g) => g.entrees.map((e) => e.lien));
    expect(liens).toContain("/avocat");
    expect(liens).toContain("/administration");
  });

  it("aucun groupe vide n'est affiché", () => {
    for (const groupe of menuPour(["user"])) {
      expect(groupe.entrees.length).toBeGreaterThan(0);
    }
  });

  it("les rôles cumulés additionnent les entrées, sans doublon", () => {
    const liens = menuPour(["avocat", "admin"]).flatMap((g) => g.entrees.map((e) => e.lien));
    expect(liens).toContain("/administration");
    expect(new Set(liens).size).toBe(liens.length);
  });
});

describe("entrée active", () => {
  const groupes = menuPour(["admin"]);

  it("marque la page courante", () => {
    expect(entreeActive("/documents", groupes)).toBe("/documents");
  });

  it("marque encore la rubrique sur une sous-page", () => {
    expect(entreeActive("/formalites/12", groupes)).toBe("/formalites");
  });

  it("ignore les paramètres d'adresse dans la comparaison", () => {
    expect(entreeActive("/creation", groupes)).toBe("/creation");
  });

  it("ne marque rien sur une page hors menu", () => {
    expect(entreeActive("/page-inconnue", groupes)).toBeNull();
  });

  it("choisit l'entrée la plus précise", () => {
    // /avocat ne doit pas être marquée quand on est sur /avocat-quelque-chose
    expect(entreeActive("/avocat-autre-chose", groupes)).toBeNull();
  });
});

describe("intégrité du menu", () => {
  it("aucun lien ne pointe encore vers une page .html", () => {
    const liens = MENU.flatMap((g) => g.entrees.map((e) => e.lien));
    expect(liens.filter((l) => l.includes(".html"))).toEqual([]);
  });

  it("aucun lien en double", () => {
    const liens = MENU.flatMap((g) => g.entrees.map((e) => e.lien.split("?")[0]));
    expect(new Set(liens).size).toBe(liens.length);
  });
});
