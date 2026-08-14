import { describe, it, expect } from "vitest";
import {
  JOURS,
  nomDuJour,
  RACCOURCIS,
  PLAGES_PAR_DEFAUT,
  refusDePlage,
  messageDeRefus,
  parJournee,
} from "@/domain/consultation/disponibilites";
import { creneauxLibres } from "@/domain/consultation/creneaux";

const plage = (jourSemaine: number, debut: string, fin: string, duree = 30) => ({
  jourSemaine,
  debut,
  fin,
  dureeCreneauMinutes: duree,
});

describe("les jours de la semaine", () => {
  it("commencent le lundi et finissent le dimanche", () => {
    expect(JOURS.map((j) => j.nom)[0]).toBe("Lundi");
    expect(JOURS.map((j) => j.nom)[6]).toBe("Dimanche");
  });

  it("gardent la numérotation de Date.getDay()", () => {
    /*
     * Dimanche vaut 0 même s'il est affiché en dernier : renuméroter pour
     * l'affichage décalerait tous les calculs de créneaux d'un jour.
     */
    expect(JOURS.find((j) => j.nom === "Dimanche")?.valeur).toBe(0);
    expect(JOURS.find((j) => j.nom === "Lundi")?.valeur).toBe(1);
    expect(nomDuJour(3)).toBe("Mercredi");
    expect(nomDuJour(9)).toBe("");
  });

  it("les raccourcis ne désignent que des jours existants", () => {
    for (const raccourci of RACCOURCIS) {
      for (const jour of raccourci.jours) {
        expect(JOURS.some((j) => j.valeur === jour)).toBe(true);
      }
    }
  });
});

describe("les plages par défaut d'un nouvel avocat", () => {
  it("couvrent les jours ouvrés, matin et après-midi", () => {
    expect(PLAGES_PAR_DEFAUT).toHaveLength(10);
    expect(PLAGES_PAR_DEFAUT.every((p) => p.jourSemaine >= 1 && p.jourSemaine <= 5)).toBe(true);
  });

  it("ne se chevauchent pas entre elles", () => {
    // Sinon un avocat créé avec ces valeurs partirait avec des créneaux en double.
    const posees: typeof PLAGES_PAR_DEFAUT = [];
    for (const p of PLAGES_PAR_DEFAUT) {
      expect(refusDePlage(p, posees)).toBeNull();
      posees.push(p);
    }
  });

  it("produisent effectivement des créneaux", () => {
    /*
     * C'est tout l'intérêt du défaut : un avocat créé apparaît tout de suite. Une
     * plage mal formée ne produirait rien, et il resterait invisible sans qu'on
     * comprenne pourquoi.
     */
    const lundi = new Date("2026-08-17T00:00:00");
    const veille = new Date("2026-08-16T08:00:00");
    const creneaux = creneauxLibres(PLAGES_PAR_DEFAUT, [], [], lundi, lundi, veille);

    // 9 h - 12 h et 14 h - 18 h par tranches de 30 minutes : 6 + 8.
    expect(creneaux).toHaveLength(14);
  });
});

describe("ce qu'une plage doit respecter", () => {
  it("accepte une plage cohérente", () => {
    expect(refusDePlage(plage(2, "09:00", "12:00"), [])).toBeNull();
  });

  it("refuse une heure illisible", () => {
    expect(refusDePlage(plage(2, "9h", "12:00"), [])).toBe("heures-illisibles");
  });

  it("refuse une fin avant le début", () => {
    expect(refusDePlage(plage(2, "12:00", "09:00"), [])).toBe("fin-avant-debut");
    expect(refusDePlage(plage(2, "09:00", "09:00"), [])).toBe("fin-avant-debut");
  });

  it("refuse une plage trop courte pour un seul créneau", () => {
    expect(refusDePlage(plage(2, "09:00", "09:20", 30), [])).toBe("trop-courte");
    // Une plage juste assez longue pour un créneau passe.
    expect(refusDePlage(plage(2, "09:00", "09:30", 30), [])).toBeNull();
  });

  it("refuse un chevauchement le même jour", () => {
    /*
     * Deux plages superposées produisent des créneaux en double, qu'un client peut
     * réserver deux fois. La page d'origine vérifiait cela dans le navigateur, ce
     * qu'un appel direct à l'API contournait.
     */
    const existantes = [plage(2, "09:00", "12:00")];
    expect(refusDePlage(plage(2, "11:00", "14:00"), existantes)).toBe("chevauchement");
    expect(refusDePlage(plage(2, "10:00", "11:00"), existantes)).toBe("chevauchement");
    expect(refusDePlage(plage(2, "08:00", "13:00"), existantes)).toBe("chevauchement");
  });

  it("accepte deux plages qui se touchent bout à bout", () => {
    // 9 h - 12 h et 12 h - 14 h sont compatibles : c'est la règle des rendez-vous.
    expect(refusDePlage(plage(2, "12:00", "14:00"), [plage(2, "09:00", "12:00")])).toBeNull();
  });

  it("le même horaire un autre jour n'est pas un chevauchement", () => {
    expect(refusDePlage(plage(3, "09:00", "12:00"), [plage(2, "09:00", "12:00")])).toBeNull();
  });

  it("chaque refus a son mot", () => {
    expect(messageDeRefus("chevauchement")).toContain("chevauche");
    expect(messageDeRefus("fin-avant-debut")).toContain("fin");
    expect(messageDeRefus("trop-courte")).toContain("courte");
    expect(messageDeRefus("heures-illisibles")).toContain("09:30");
  });
});

describe("le rangement pour l'affichage", () => {
  it("groupe par jour, dans l'ordre de la semaine puis de l'horaire", () => {
    const journees = parJournee([
      plage(0, "10:00", "12:00"),
      plage(2, "14:00", "18:00"),
      plage(2, "09:00", "12:00"),
      plage(1, "09:00", "12:00"),
    ]);

    expect(journees.map((j) => j.nom)).toEqual(["Lundi", "Mardi", "Dimanche"]);
    expect(journees[1].plages.map((p) => p.debut)).toEqual(["09:00", "14:00"]);
  });

  it("les jours sans plage ne s'affichent pas", () => {
    expect(parJournee([plage(1, "09:00", "12:00")]).map((j) => j.nom)).toEqual(["Lundi"]);
  });

  it("aucune plage ne rend aucune journée", () => {
    expect(parJournee([])).toEqual([]);
  });
});
