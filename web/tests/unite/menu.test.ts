import { describe, it, expect } from "vitest";
import {
  MENU,
  menuPour,
  entreesDuMenu,
  entreeActive,
  estRubrique,
} from "@/domain/navigation/menu";
import { FAMILLES, PARCOURS } from "@/domain/navigation/parcours";
import { OFFRES } from "@/domain/formalite/offres";
import { PRIX_HT_CENTIMES as AUTO_ENTREPRISE_HT } from "@/domain/auto-entrepreneur/offre";
import { PRIX_HT_CENTIMES as CONSULTATION_HT } from "@/domain/consultation/offre";
import { ICONES } from "@/domain/navigation/icones";
import { COLONNE_VIDE, libelleDeLEntree } from "@/domain/navigation/colonne";

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

  it("les paramètres sont dans la colonne, et plus seulement sous la roue crantée", () => {
    /*
     * Ils n'y étaient pas, par fidélité à la colonne d'origine. Une cible de seize
     * pixels en pied de page ne se trouve pas : ils ont une entrée, et la roue reste
     * en raccourci.
     */
    expect(liensPour(["user"])).toContain("/parametres");
  });
});

describe("rubriques", () => {
  const rubriquesDe = (roles: Parameters<typeof menuPour>[0]) =>
    menuPour(roles)
      .filter(estRubrique)
      .map((r) => r.rubrique);

  it("un client voit les trois rubriques qui le concernent, pas celle du cabinet", () => {
    expect(rubriquesDe(["user"])).toEqual([
      "Mon activité",
      "Services juridiques",
      "Mon compte",
    ]);
  });

  it("« Mes sociétés » se met au singulier quand il n'y en a qu'une", () => {
    /*
     * « Mes sociétés » à quelqu'un qui n'en a qu'une se lit comme une promesse d'en
     * avoir plusieurs, ou comme un menu qui ne le concerne pas.
     */
    const resume = { ...COLONNE_VIDE };
    expect(libelleDeLEntree("/societes", "Mes sociétés", { ...resume, nombreDeSocietes: 1 })).toBe(
      "Ma société"
    );
    expect(libelleDeLEntree("/societes", "Mes sociétés", { ...resume, nombreDeSocietes: 3 })).toBe(
      "Mes sociétés"
    );
    // Les autres entrées ne bougent pas.
    expect(libelleDeLEntree("/documents", "Mes documents", resume)).toBe("Mes documents");
  });

  it("aucune rubrique ne coiffe moins de deux entrées", () => {
    /*
     * Un titre pour une seule entrée pèse plus lourd que ce qu'il annonce : il double
     * la hauteur de la ligne sans rien apprendre.
     */
    for (const roles of [["user"], ["avocat"], ["admin"]] as const) {
      const menu = menuPour([...roles]);
      for (const [i, element] of menu.entries()) {
        if (!estRubrique(element)) continue;
        const suite = menu.slice(i + 1);
        const fin = suite.findIndex(estRubrique);
        const groupe = fin === -1 ? suite : suite.slice(0, fin);
        expect(groupe.length, element.rubrique + " (" + roles.join() + ")").toBeGreaterThan(1);
      }
    }
  });

  it("un avocat et un administrateur voient aussi leur espace", () => {
    expect(rubriquesDe(["avocat"])).toContain("Espace avocat");
    expect(rubriquesDe(["admin"])).toContain("Espace avocat");
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

  it("rattache un parcours à « Mes formalités »", () => {
    /*
     * Les parcours ne sont plus dans la colonne - ils vivent dans le bouton. Sans
     * rattachement, rien n'y serait marqué pendant tout un parcours, et l'on perdrait
     * le seul repère qui dit où l'on est.
     */
    for (const parcours of ["/creation", "/auto-entrepreneur", "/modification", "/fermeture"]) {
      expect(entreeActive(parcours, menu), parcours).toBe("/formalites");
    }
    expect(entreeActive("/fermeture/quelque-chose", menu)).toBe("/formalites");

    // Le dépôt des comptes, lui, a son entrée : il se marque tout seul.
    expect(entreeActive("/depot-des-comptes", menu)).toBe("/depot-des-comptes");
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


  it("les compteurs sont posés là où il y a une charge à annoncer", () => {
    const avecCompteur = entrees.filter((e) => e.compteur).map((e) => e.lien);
    expect(avecCompteur).toEqual(["/formalites", "/messagerie", "/avocat"]);
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

describe("les parcours qu'on peut ouvrir", () => {
  it("aucune entrée de la colonne n'est annoncée sans être ouverte", () => {
    /*
     * Le badge « Bientôt » a fondu au fil des mises en service. Le test reste, à
     * l'envers : il dit désormais que rien n'est annoncé sans être ouvert, et il
     * redeviendra utile le jour où une entrée sera ajoutée avant son parcours.
     */
    const bientot = entreesDuMenu(MENU)
      .filter((e) => e.bientot)
      .map((e) => e.libelle);

    expect(bientot).toEqual([]);
  });

  it("aucun parcours livré ne reste grisé dans la fenêtre de création", () => {
    /*
     * Le défaut a existé : le dépôt des comptes et la fermeture y sont restés
     * « bientôt » après leur mise en production. Une carte inerte y est bien pire
     * qu'ailleurs - c'est le seul endroit d'où l'on démarre une formalité.
     */
    const grises = PARCOURS.filter((p) => p.bientot).map((p) => p.titre);
    expect(grises).toEqual([]);
  });

  it("les formalités ponctuelles ne sont que dans la fenêtre", () => {
    /*
     * Créer, modifier, fermer : trois gestes qu'on fait une fois. Les garder en
     * permanence dans la colonne, c'était proposer deux fois la même chose à deux
     * centimètres d'écart. Le dépôt des comptes et les contrats, eux, reviennent
     * chaque année : ils restent des deux côtés, et c'est voulu.
     */
    const dansLaColonne = entreesDuMenu(MENU).map((e) => e.lien.split("?")[0]);
    for (const ponctuel of ["/creation", "/auto-entrepreneur", "/modification", "/fermeture"]) {
      expect(dansLaColonne, ponctuel).not.toContain(ponctuel);
    }
  });

  it("chaque famille de la fenêtre coiffe au moins un parcours", () => {
    for (const famille of FAMILLES) {
      expect(famille.parcours.length, famille.titre).toBeGreaterThan(0);
    }
    // Et tous les parcours sont rangés : aucun ne se perd hors des familles.
    expect(PARCOURS.length).toBe(FAMILLES.reduce((t, f) => t + f.parcours.length, 0));
  });

  it("chaque parcours annonce son temps et son prix", () => {
    /*
     * L'accueil d'un compte sans dossier les affiche : on y choisit une formalité sans
     * en connaître aucune. Un parcours ajouté au catalogue sans ces deux valeurs y
     * apparaîtrait muet, au milieu de sept cartes qui répondent.
     */
    for (const parcours of PARCOURS) {
      expect(parcours.duree, parcours.titre).toBeTruthy();
      expect(parcours.prix, parcours.titre).toBeTruthy();
    }
  });

  it("les prix annoncés sont ceux des offres, non des chiffres recopiés", () => {
    /*
     * Le défaut a existé, et il a vécu longtemps : l'accueil annonçait une création
     * « à partir de 129 € » quand la formule la moins chère est à 89, une
     * auto-entreprise « gratuite » facturée 149 €, et une consultation à 49 € qui
     * en coûte 99. Les trois venaient d'une liste écrite à la main.
     */
    const prixDe = (lien: string) => PARCOURS.find((p) => p.lien === lien)?.prix;

    const moinsChere = Math.min(...OFFRES.map((o) => o.prix));
    expect(prixDe("/creation?type=creation")).toContain(String(moinsChere));
    expect(prixDe("/auto-entrepreneur")).toContain(String(AUTO_ENTREPRISE_HT / 100));
    expect(prixDe("/consultations")).toContain(String(CONSULTATION_HT / 100));

    // Et aucun ne se dit gratuit : aucune prestation ne l'est.
    for (const parcours of PARCOURS) {
      expect(parcours.prix, parcours.titre).not.toMatch(/gratuit/i);
    }
  });

  it("une seule recommandation, sinon aucune ne l'est", () => {
    expect(PARCOURS.filter((p) => p.recommande).map((p) => p.titre)).toEqual([
      "Créer une société",
    ]);
  });

  it("ses intitulés sont tous des verbes : elle dit ce qu'on fait", () => {
    // La colonne dit où l'on va, la fenêtre ce qu'on entreprend. Deux registres, tenus.
    for (const parcours of PARCOURS) {
      expect(parcours.titre, parcours.lien).toMatch(
        /^(Créer|Modifier|Déposer|Fermer|Rédiger|Consulter|Transférer)\b/
      );
    }
  });
});
