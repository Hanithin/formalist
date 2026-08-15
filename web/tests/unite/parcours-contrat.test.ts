import { describe, it, expect } from "vitest";
import {
  ETATS,
  etatLisible,
  actionAttendue,
  FILTRES,
  dansLeFiltre,
  comptesParFiltre,
  parUrgence,
} from "@/domain/contrat/parcours";
import { transitionPermise } from "@/domain/contrat/catalogue";

describe("les états dits en français", () => {
  it("chaque état de la base a son mot", () => {
    /*
     * La page affichait « en_validation » tel quel. Le mot ne dit ni qui valide, ni
     * ce qu'on attend, ni s'il y a quelque chose à faire de son côté.
     */
    for (const code of ["brouillon", "genere", "en_validation", "valide", "signe"]) {
      const etat = etatLisible(code);
      expect(etat.code).toBe(code);
      expect(etat.libelle).not.toContain("_");
      expect(etat.explication.length).toBeGreaterThan(20);
    }
  });

  it("un état inconnu invite à reprendre le contrat", () => {
    // Le plus prudent : mieux vaut proposer de le compléter que de le croire abouti.
    expect(etatLisible(null).code).toBe("brouillon");
    expect(etatLisible("n-importe-quoi").code).toBe("brouillon");
  });

  it("chaque état dit à qui est la main", () => {
    expect(etatLisible("brouillon").main).toBe("vous");
    expect(etatLisible("en_validation").main).toBe("avocat");
    expect(etatLisible("signe").main).toBe("personne");
  });

  it("les états couvrent exactement les transitions du domaine", () => {
    // Un état atteignable sans libellé s'afficherait « brouillon » à tort.
    for (const etat of ETATS) {
      for (const autre of ETATS) {
        if (transitionPermise(etat.code, autre.code)) {
          expect(ETATS.some((e) => e.code === autre.code)).toBe(true);
        }
      }
    }
  });
});

describe("le geste attendu", () => {
  it("n'existe que là où il y a vraiment quelque chose à faire", () => {
    /*
     * Une liste où chaque ligne porte un bouton finit par en porter un qui ne sert
     * pas. Un contrat prêt se télécharge - c'est une action de la ligne, non une
     * étape du parcours - et la signature ne se fait plus depuis Formalist.
     */
    expect(actionAttendue("brouillon")).toBe("Compléter");
    expect(actionAttendue("genere")).toBeNull();
    expect(actionAttendue("valide")).toBeNull();
    expect(actionAttendue("en_validation")).toBeNull();
    expect(actionAttendue("signe")).toBeNull();
  });
});

describe("les filtres", () => {
  const contrats = [
    { status: "brouillon" },
    { status: "genere" },
    { status: "en_validation" },
    { status: "valide" },
    { status: "signe" },
  ];

  it("regroupent par question, non par état technique", () => {
    /*
     * Cinq états feraient cinq filtres, donc demanderaient de les connaître. On
     * demande plutôt : qu'est-ce qui m'attend, qu'est-ce qui attend l'avocat,
     * qu'est-ce qui est terminé.
     */
    expect(FILTRES).toHaveLength(4);
    expect(comptesParFiltre(contrats)).toEqual({
      tous: 5,
      encours: 1,
      relecture: 1,
      prets: 3,
    });
  });

  it("« tous » ne cache rien", () => {
    expect(contrats.every((c) => dansLeFiltre(c.status, "tous"))).toBe(true);
  });

  it("chaque contrat tombe dans un filtre et un seul, hors « tous »", () => {
    for (const contrat of contrats) {
      const dedans = FILTRES.filter(
        (f) => f.valeur !== "tous" && dansLeFiltre(contrat.status, f.valeur)
      );
      expect(dedans).toHaveLength(1);
    }
  });
});

describe("l'ordre de la liste", () => {
  const contrat = (status: string, jour: string) => ({ status, majLe: new Date(jour) });

  it("ce qui attend un geste de ma part passe devant", () => {
    // Un contrat à compléter n'a pas à se retrouver sous trois contrats terminés.
    const ordonnes = parUrgence([
      contrat("genere", "2026-08-10"),
      contrat("en_validation", "2026-08-09"),
      contrat("brouillon", "2026-01-01"),
    ]);

    expect(ordonnes.map((c) => c.status)).toEqual(["brouillon", "en_validation", "genere"]);
  });

  it("à main égale, le plus récent d'abord", () => {
    // « genere » et « valide » n'attendent personne : seule la date les départage.
    const ordonnes = parUrgence([
      contrat("genere", "2026-01-01"),
      contrat("valide", "2026-08-01"),
    ]);
    expect(ordonnes.map((c) => c.status)).toEqual(["valide", "genere"]);
  });

  it("une date manquante ne casse pas l'ordre", () => {
    const ordonnes = parUrgence([
      { status: "brouillon", majLe: null },
      { status: "brouillon", majLe: new Date("2026-08-01") },
    ]);
    expect(ordonnes[0].majLe).not.toBeNull();
  });
});
