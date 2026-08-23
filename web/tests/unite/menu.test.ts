import { describe, it, expect } from "vitest";
import {
  MENU,
  menuPour,
  entreesDuMenu,
  entreeActive,
  estRubrique,
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

describe("rubriques", () => {
  const rubriquesDe = (roles: Parameters<typeof menuPour>[0]) =>
    menuPour(roles)
      .filter(estRubrique)
      .map((r) => r.rubrique);

  it("un client voit les trois rubriques qui le concernent, pas celle du cabinet", () => {
    expect(rubriquesDe(["user"])).toEqual(["Formalités", "Mon espace", "Compte"]);
  });

  it("un avocat et un administrateur voient aussi le cabinet", () => {
    expect(rubriquesDe(["avocat"])).toContain("Cabinet");
    expect(rubriquesDe(["admin"])).toContain("Cabinet");
  });

  it("aucune rubrique ne coiffe le vide", () => {
    /*
     * Une rubrique vaut par ce qui la suit. « Cabinet » laissée en bas de colonne
     * d'un client, sans aucune entrée dessous, annoncerait un groupe inexistant.
     */
    for (const roles of [["user"], ["avocat"], ["admin"]] as const) {
      const menu = menuPour([...roles]);
      expect(menu[menu.length - 1], roles.join()).not.toSatisfy(estRubrique);

      for (const [i, element] of menu.entries()) {
        if (!estRubrique(element)) continue;
        const suivant = menu[i + 1];
        expect(suivant && !estRubrique(suivant), element.rubrique).toBe(true);
      }
    }
  });

  it("le tableau de bord reste seul en tête, sans rubrique", () => {
    const menu = menuPour(["user"]);
    expect(estRubrique(menu[0])).toBe(false);
    expect(estRubrique(menu[1])).toBe(true);
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
  it("il n'en reste aucune", () => {
    /*
     * Le badge « Bientôt » a fondu au fil des mises en service : auto-entreprise,
     * modification, dépôt des comptes, puis fermeture. Le test reste, à l'envers : il
     * dit désormais que rien n'est annoncé sans être ouvert, et il redeviendra utile le
     * jour où une entrée sera ajoutée avant son parcours.
     */
    const bientot = entreesDuMenu(MENU)
      .filter((e) => e.bientot)
      .map((e) => e.libelle);

    expect(bientot).toEqual([]);
  });

  it("la fermeture est ouverte, et mène à son parcours", () => {
    const entree = entreesDuMenu(menuPour(["user"])).find((e) => e.lien === "/fermeture");
    expect(entree, "l'entrée doit exister").toBeTruthy();
    expect(entree?.bientot).toBeUndefined();
  });

  it("la modification est ouverte, et mène à son parcours", () => {
    // Le badge est tombé avec la mise en service du parcours : le laisser aurait
    // grisé une page qui fonctionne.
    const entree = entreesDuMenu(menuPour(["user"])).find((e) => e.lien === "/modification");
    expect(entree?.bientot).toBeUndefined();
  });
});
