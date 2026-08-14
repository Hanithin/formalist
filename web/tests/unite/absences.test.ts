import { describe, it, expect } from "vitest";
import {
  enJour,
  depuisJour,
  jourSuivant,
  nombreDeJours,
  grilleDuMois,
  nomDuMois,
  choisir,
  dansLaPeriode,
  dejaBloque,
  recouvre,
  resumeDePeriode,
  periodeDuRaccourci,
  periodeDuMois,
} from "@/domain/consultation/absences";

describe("un jour s'écrit sans passer par UTC", () => {
  it("garde le quantième local", () => {
    /*
     * toISOString() sur un minuit local rend la veille sous nos latitudes : c'est
     * exactement ce décalage qui avait fait enregistrer une absence le mauvais jour.
     */
    expect(enJour(new Date(2026, 7, 17, 0, 0, 0))).toBe("2026-08-17");
    expect(enJour(new Date(2026, 7, 17, 23, 59, 59))).toBe("2026-08-17");
    expect(enJour(new Date(2026, 0, 1, 0, 30))).toBe("2026-01-01");
  });

  it("fait l'aller-retour sans bouger", () => {
    for (const jour of ["2026-01-01", "2026-03-29", "2026-08-17", "2026-10-25", "2026-12-31"]) {
      expect(enJour(depuisJour(jour))).toBe(jour);
    }
  });

  it("traverse les changements d'heure sans changer de jour", () => {
    // Les dates sont posées à midi pour cela : à minuit, une heure de décalage
    // saisonnier bascule sur la veille.
    expect(jourSuivant("2026-03-28")).toBe("2026-03-29");
    expect(jourSuivant("2026-03-29")).toBe("2026-03-30");
    expect(jourSuivant("2026-10-24")).toBe("2026-10-25");
    expect(jourSuivant("2026-10-25")).toBe("2026-10-26");
  });

  it("compte les jours bornes comprises", () => {
    expect(nombreDeJours("2026-08-17", "2026-08-17")).toBe(1);
    expect(nombreDeJours("2026-08-17", "2026-08-23")).toBe(7);
    expect(nombreDeJours("2026-08-28", "2026-09-02")).toBe(6);
    // Une semaine à cheval sur un changement d'heure fait toujours sept jours.
    expect(nombreDeJours("2026-10-24", "2026-10-30")).toBe(7);
  });
});

describe("la grille d'un mois", () => {
  it("commence un lundi et fait toujours six semaines", () => {
    /*
     * Une grille de hauteur variable ferait sauter tout ce qui la suit d'un mois à
     * l'autre.
     */
    for (const mois of [0, 1, 7, 11]) {
      const grille = grilleDuMois(2026, mois);
      expect(grille).toHaveLength(42);
      expect(depuisJour(grille[0].jour).getDay()).toBe(1);
    }
  });

  it("déborde sur les mois voisins plutôt que de laisser des trous", () => {
    // Août 2026 commence un samedi : la grille ouvre sur la fin de juillet.
    const grille = grilleDuMois(2026, 7);
    expect(grille[0].jour).toBe("2026-07-27");
    expect(grille[0].duMois).toBe(false);
    expect(grille.find((c) => c.jour === "2026-08-01")?.duMois).toBe(true);
    expect(grille.filter((c) => c.duMois)).toHaveLength(31);
  });

  it("nomme le mois en français", () => {
    expect(nomDuMois(2026, 7)).toBe("août 2026");
    expect(nomDuMois(2026, 0)).toBe("janvier 2026");
  });
});

describe("choisir une période au clic", () => {
  it("le premier clic pose une journée entière", () => {
    // De quoi valider une absence d'un seul jour sans second clic.
    expect(choisir(null, "2026-08-17", false)).toEqual({
      debut: "2026-08-17",
      fin: "2026-08-17",
    });
  });

  it("le second clic ferme la période", () => {
    const debut = choisir(null, "2026-08-17", false);
    expect(choisir(debut, "2026-08-24", false)).toEqual({
      debut: "2026-08-17",
      fin: "2026-08-24",
    });
  });

  it("un second clic antérieur devient le début", () => {
    // On a désigné les deux bornes dans l'autre sens, rien de plus.
    const debut = choisir(null, "2026-08-17", false);
    expect(choisir(debut, "2026-08-10", false)).toEqual({
      debut: "2026-08-10",
      fin: "2026-08-17",
    });
  });

  it("une période figée repart de zéro au clic suivant", () => {
    const complete = { debut: "2026-08-17", fin: "2026-08-24" };
    expect(choisir(complete, "2026-09-01", true)).toEqual({
      debut: "2026-09-01",
      fin: "2026-09-01",
    });
  });

  it("dit quels jours sont dans la période", () => {
    const periode = { debut: "2026-08-17", fin: "2026-08-20" };
    expect(dansLaPeriode("2026-08-17", periode)).toBe(true);
    expect(dansLaPeriode("2026-08-19", periode)).toBe(true);
    expect(dansLaPeriode("2026-08-20", periode)).toBe(true);
    expect(dansLaPeriode("2026-08-21", periode)).toBe(false);
    expect(dansLaPeriode("2026-08-17", null)).toBe(false);
  });
});

describe("les absences déjà posées", () => {
  const posees = [
    { debut: "2026-08-10", fin: "2026-08-14" },
    { debut: "2026-12-24", fin: "2026-12-31" },
  ];

  it("leurs jours sont reconnus", () => {
    expect(dejaBloque("2026-08-12", posees)).toBe(true);
    expect(dejaBloque("2026-08-10", posees)).toBe(true);
    expect(dejaBloque("2026-08-15", posees)).toBe(false);
  });

  it("une période qui en recouvre une est signalée", () => {
    /*
     * Deux absences superposées bloquent les mêmes journées sans dommage, mais la
     * liste devient illisible : on ne sait plus laquelle retirer pour redevenir
     * disponible.
     */
    expect(recouvre({ debut: "2026-08-12", fin: "2026-08-20" }, posees)).toBe(true);
    expect(recouvre({ debut: "2026-08-01", fin: "2026-08-31" }, posees)).toBe(true);
    expect(recouvre({ debut: "2026-08-15", fin: "2026-08-20" }, posees)).toBe(false);
  });

  it("une période qui touche bout à bout ne recouvre pas", () => {
    expect(recouvre({ debut: "2026-08-15", fin: "2026-08-16" }, posees)).toBe(false);
  });
});

describe("le résumé d'une période", () => {
  it("dit une journée seule sans compter les jours", () => {
    expect(resumeDePeriode({ debut: "2026-08-17", fin: "2026-08-17" })).toBe("Le 17 août 2026");
  });

  it("ne répète pas le mois quand il est le même", () => {
    expect(resumeDePeriode({ debut: "2026-08-17", fin: "2026-08-24" })).toBe(
      "Du 17 au 24 août 2026 · 8 jours"
    );
  });

  it("le répète quand la période change de mois", () => {
    expect(resumeDePeriode({ debut: "2026-08-28", fin: "2026-09-02" })).toBe(
      "Du 28 août au 2 septembre 2026 · 6 jours"
    );
  });
});

describe("les raccourcis", () => {
  it("comptent depuis le début choisi, bornes comprises", () => {
    expect(periodeDuRaccourci(7, "2026-08-17", "2026-08-14")).toEqual({
      debut: "2026-08-17",
      fin: "2026-08-23",
    });
    expect(nombreDeJours("2026-08-17", "2026-08-23")).toBe(7);
  });

  it("partent d'aujourd'hui quand rien n'est choisi", () => {
    // Exiger un premier clic avant de pouvoir s'en servir les viderait de leur intérêt.
    expect(periodeDuRaccourci(14, null, "2026-08-14")).toEqual({
      debut: "2026-08-14",
      fin: "2026-08-27",
    });
  });

  it("le mois entier va du premier au dernier jour", () => {
    expect(periodeDuMois(2026, 7)).toEqual({ debut: "2026-08-01", fin: "2026-08-31" });
    expect(periodeDuMois(2026, 1)).toEqual({ debut: "2026-02-01", fin: "2026-02-28" });
  });
});
