import { describe, it, expect } from "vitest";
import {
  valeursParDefaut,
  clotureCourante,
  optionFiscaleCourante,
  DUREE_DE_VIE_ANS,
} from "@/domain/formalite/valeurs-par-defaut";

const LE_15_AOUT = new Date("2026-08-15T12:00:00");

describe("l'option fiscale proposée", () => {
  it("l'impôt sur les sociétés, quelle que soit la forme", () => {
    // Le régime de la quasi-totalité des dossiers, et la liste reste ouverte.
    expect(optionFiscaleCourante()).toBe("IS");
    for (const forme of ["SASU", "SAS", "EURL", "SARL", "SA", "SCI"]) {
      expect(valeursParDefaut({ forme }, LE_15_AOUT).optionFiscale).toBe("IS");
    }
  });
});

describe("la clôture du premier exercice", () => {
  it("l'année en cours quand l'activité démarre au premier semestre", () => {
    expect(clotureCourante(new Date("2026-02-10T12:00:00"))).toBe("2026-12-31");
    expect(clotureCourante(new Date("2026-06-30T12:00:00"))).toBe("2026-12-31");
  });

  it("l'année suivante quand elle démarre au second", () => {
    /*
     * Une société créée en octobre aurait autrement un premier exercice de deux
     * mois, qui oblige à produire des comptes complets pour presque rien.
     */
    expect(clotureCourante(new Date("2026-07-01T12:00:00"))).toBe("2027-12-31");
    expect(clotureCourante(new Date("2026-10-20T12:00:00"))).toBe("2027-12-31");
  });

  it("le premier exercice reste sous les vingt-quatre mois", () => {
    for (const mois of ["01", "04", "07", "10", "12"]) {
      const debut = new Date("2026-" + mois + "-01T12:00:00");
      const cloture = new Date(clotureCourante(debut) + "T12:00:00");
      const jours = (cloture.getTime() - debut.getTime()) / 86_400_000;
      expect(jours).toBeGreaterThan(0);
      expect(jours).toBeLessThan(730);
    }
  });
});

describe("ce qui est écrit d'avance", () => {
  it("un brouillon vide reçoit les trois réponses courantes", () => {
    const ajouts = valeursParDefaut({ forme: "SASU" }, LE_15_AOUT);

    expect(ajouts.dureeDeVie).toBe(DUREE_DE_VIE_ANS);
    expect(ajouts.optionFiscale).toBe("IS");
    // Le 15 août : le second semestre, donc l'année suivante.
    expect(ajouts.dateCloturePremierExercice).toBe("2027-12-31");
  });

  it("une réponse déjà donnée n'est jamais remplacée", () => {
    const ajouts = valeursParDefaut(
      {
        forme: "SASU",
        dureeDeVie: 50,
        optionFiscale: "IR",
        dateCloturePremierExercice: "2026-06-30",
      },
      LE_15_AOUT
    );
    expect(ajouts).toEqual({});
  });

  it("une durée de zéro an est une réponse, pas une absence", () => {
    // `0` est faux en JavaScript : le tester comme tel l'écraserait par 99.
    expect(valeursParDefaut({ dureeDeVie: 0 }, LE_15_AOUT).dureeDeVie).toBeUndefined();
  });

  it("la clôture suit la date de début quand elle est donnée", () => {
    const ajouts = valeursParDefaut({ dateDebutActivite: "2027-03-01" }, LE_15_AOUT);
    expect(ajouts.dateCloturePremierExercice).toBe("2027-12-31");
  });

  it("une date de début illisible ne fait pas tomber le calcul", () => {
    const ajouts = valeursParDefaut({ dateDebutActivite: "n'importe quoi" }, LE_15_AOUT);
    expect(ajouts.dateCloturePremierExercice).toBe("2027-12-31");
  });

  it("ce qui n'a pas de réponse courante n'en reçoit pas", () => {
    /*
     * Le mode de domiciliation, la banque, la date de début et le régime de TVA
     * dépendent de la situation : en inventer un reviendrait à décider à la place
     * de quelqu'un.
     */
    const ajouts = valeursParDefaut({ forme: "SASU" }, LE_15_AOUT);
    expect(ajouts.modeDomiciliation).toBeUndefined();
    expect(ajouts.banque).toBeUndefined();
    expect(ajouts.dateDebutActivite).toBeUndefined();
    expect(ajouts.regimeTva).toBeUndefined();
  });
});
