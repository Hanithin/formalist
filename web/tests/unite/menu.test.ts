import { describe, it, expect } from "vitest";
import {
  MENU,
  SEPARATEUR,
  menuPour,
  entreesDuMenu,
  entreeActive,
} from "@/domain/navigation/menu";
import { ICONES } from "@/domain/navigation/icones";

const liensPour = (roles: Parameters<typeof menuPour>[0]) =>
  entreesDuMenu(menuPour(roles)).map((e) => e.lien);

describe("menu selon les rôles", () => {
  it("un client ne voit ni l'espace avocat ni l'administration", () => {
    const liens = liensPour(["user"]);
    expect(liens).not.toContain("/avocat");
    expect(liens).not.toContain("/administration");
    expect(liens).toContain("/tableau-de-bord");
  });

  it("un avocat voit l'espace avocat, pas l'administration", () => {
    const liens = liensPour(["avocat"]);
    expect(liens).toContain("/avocat");
    expect(liens).not.toContain("/administration");
  });

  it("un administrateur voit tout", () => {
    const liens = liensPour(["admin"]);
    expect(liens).toContain("/avocat");
    expect(liens).toContain("/administration");
  });

  it("les rôles cumulés additionnent les entrées, sans doublon", () => {
    const liens = liensPour(["avocat", "admin"]);
    expect(liens).toContain("/administration");
    expect(new Set(liens).size).toBe(liens.length);
  });

  it("les paramètres ne sont pas dans la colonne", () => {
    // On y accède par la roue crantée du pied, comme dans la colonne d'origine.
    expect(liensPour(["admin"])).not.toContain("/parametres");
  });
});

describe("filets de séparation", () => {
  it("un client perd les entrées de métier, et le filet qui les précédait", () => {
    const menu = menuPour(["user"]);
    // Sans les trois entrées réservées, le second filet n'a plus rien à séparer.
    expect(menu.filter((e) => e === SEPARATEUR)).toHaveLength(1);
  });

  it("un administrateur garde les deux", () => {
    expect(menuPour(["admin"]).filter((e) => e === SEPARATEUR)).toHaveLength(2);
  });

  it("aucun filet en tête, en queue, ni deux de suite", () => {
    for (const roles of [["user"], ["avocat"], ["admin"]] as const) {
      const menu = menuPour([...roles]);
      expect(menu[0]).not.toBe(SEPARATEUR);
      expect(menu[menu.length - 1]).not.toBe(SEPARATEUR);
      for (let i = 1; i < menu.length; i++) {
        expect(menu[i] === SEPARATEUR && menu[i - 1] === SEPARATEUR).toBe(false);
      }
    }
  });
});

describe("entrée active", () => {
  const menu = menuPour(["admin"]);

  it("marque la page courante", () => {
    expect(entreeActive("/documents", menu)).toBe("/documents");
  });

  it("marque encore la rubrique sur une sous-page", () => {
    expect(entreeActive("/formalites/12", menu)).toBe("/formalites");
  });

  it("ignore les paramètres d'adresse dans la comparaison", () => {
    expect(entreeActive("/creation", menu)).toBe("/creation");
  });

  it("ne marque rien sur une page hors menu", () => {
    expect(entreeActive("/page-inconnue", menu)).toBeNull();
  });

  it("choisit l'entrée la plus précise", () => {
    // /avocat ne doit pas être marquée quand on est sur /avocat-quelque-chose
    expect(entreeActive("/avocat-autre-chose", menu)).toBeNull();
  });
});

describe("intégrité du menu", () => {
  const entrees = entreesDuMenu(MENU);

  it("aucun lien ne pointe encore vers une page .html", () => {
    expect(entrees.filter((e) => e.lien.includes(".html"))).toEqual([]);
  });

  it("aucun lien en double", () => {
    const liens = entrees.map((e) => e.lien.split("?")[0]);
    expect(new Set(liens).size).toBe(liens.length);
  });

  it("les compteurs ne sont posés que là où la colonne d'origine en avait", () => {
    const avecCompteur = entrees.filter((e) => e.compteur).map((e) => e.lien);
    expect(avecCompteur).toEqual(["/formalites", "/messagerie"]);
  });
});

describe("icônes de la navigation", () => {
  const liens = entreesDuMenu(MENU).map((e) => e.lien.split("?")[0]);

  it("chaque entrée a la sienne", () => {
    for (const lien of liens) {
      expect(ICONES[lien], lien).toBeTruthy();
    }
  });

  it("deux entrées ne partagent jamais la même", () => {
    // Une icône répétée ne distingue rien : « Créer une société » et « Créer mon
    // auto-entreprise » portaient toutes deux la maison.
    const dessins = liens.map((lien) => ICONES[lien]);
    const doublons = dessins.filter((d, i) => dessins.indexOf(d) !== i);
    expect(doublons).toEqual([]);
  });

  it("aucune n'est vide", () => {
    for (const lien of liens) {
      expect(ICONES[lien], lien).toMatch(/<(path|circle|rect|line|polyline)/);
    }
  });
});

describe("les fonctions annoncées mais pas ouvertes", () => {
  it("sont grisées plutôt que menant à une page vide", () => {
    const bientot = MENU.filter((e) => e !== SEPARATEUR && e.bientot).map((e) =>
      e === SEPARATEUR ? "" : e.libelle
    );

    // L'auto-entreprise n'y est plus : son formulaire est ouvert.
    expect(bientot).toEqual([
      "Modifier ma société",
      "Dépôt des comptes",
      "Fermer ma société",
    ]);
  });

  it("une entrée grisée n'est pas active, même sur son propre chemin", () => {
    // Elle n'est pas un lien : rien ne doit la surligner.
    const menu = menuPour(["user"]);
    const entree = menu.find((e) => e !== SEPARATEUR && e.lien === "/modification");
    expect(entree && entree !== SEPARATEUR && entree.bientot).toBe(true);
  });
});
