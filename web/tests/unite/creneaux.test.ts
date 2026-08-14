import { describe, it, expect } from "vitest";
import {
  enMinutes,
  creneauxLibres,
  grouperParJournee,
  etatConsultation,
  etatAffiche,
  libelleEtat,
  libelleEtatDetaille,
  annulable,
  type PlageHebdomadaire,
} from "@/domain/consultation/creneaux";

// Lundi 10 août 2026
const LUNDI = new Date("2026-08-10T00:00:00");
const AVANT = new Date("2026-08-09T08:00:00");

const matin: PlageHebdomadaire = {
  jourSemaine: 1,
  debut: "09:00",
  fin: "11:00",
  dureeCreneauMinutes: 30,
};

describe("lecture d'une heure", () => {
  it("comprend le format habituel", () => {
    expect(enMinutes("09:30")).toBe(570);
    expect(enMinutes("00:00")).toBe(0);
    expect(enMinutes("23:59")).toBe(1439);
  });

  it("refuse ce qui n'est pas une heure", () => {
    expect(enMinutes("9h30")).toBeNull();
    expect(enMinutes("25:00")).toBeNull();
    expect(enMinutes("09:70")).toBeNull();
    expect(enMinutes("")).toBeNull();
  });
});

describe("créneaux libres", () => {
  it("découpe la plage en créneaux de la durée indiquée", () => {
    const libres = creneauxLibres([matin], [], [], LUNDI, LUNDI, AVANT);
    expect(libres).toHaveLength(4); // 9h, 9h30, 10h, 10h30
    expect(libres[0].debut.getHours()).toBe(9);
    expect(libres[3].debut.getHours()).toBe(10);
    expect(libres[3].debut.getMinutes()).toBe(30);
  });

  it("ne propose pas un créneau qui déborde de la plage", () => {
    const plage = { ...matin, fin: "10:20" };
    const libres = creneauxLibres([plage], [], [], LUNDI, LUNDI, AVANT);
    // 9h, 9h30 : 10h se terminerait à 10h30, au-delà de la plage
    expect(libres).toHaveLength(2);
  });

  it("ne propose rien un jour où l'avocat ne reçoit pas", () => {
    const mardi = new Date("2026-08-11T00:00:00");
    expect(creneauxLibres([matin], [], [], mardi, mardi, AVANT)).toEqual([]);
  });

  it("écarte les créneaux déjà pris", () => {
    const pris = [{ debut: new Date("2026-08-10T09:30:00"), dureeMinutes: 30 }];
    const libres = creneauxLibres([matin], [], pris, LUNDI, LUNDI, AVANT);
    expect(libres).toHaveLength(3);
    expect(libres.some((c) => c.debut.getHours() === 9 && c.debut.getMinutes() === 30)).toBe(false);
  });

  it("un rendez-vous long bloque tous les créneaux qu'il couvre", () => {
    const pris = [{ debut: new Date("2026-08-10T09:00:00"), dureeMinutes: 90 }];
    const libres = creneauxLibres([matin], [], pris, LUNDI, LUNDI, AVANT);
    expect(libres).toHaveLength(1); // seul 10h30 reste
  });

  it("deux rendez-vous qui se touchent ne se gênent pas", () => {
    // 9h-9h30 pris : le créneau 9h30-10h reste libre.
    const pris = [{ debut: new Date("2026-08-10T09:00:00"), dureeMinutes: 30 }];
    const libres = creneauxLibres([matin], [], pris, LUNDI, LUNDI, AVANT);
    expect(libres[0].debut.getMinutes()).toBe(30);
  });

  it("écarte les journées bloquées", () => {
    const bloquees = [{ debut: LUNDI, fin: LUNDI }];
    expect(creneauxLibres([matin], bloquees, [], LUNDI, LUNDI, AVANT)).toEqual([]);
  });

  it("ne propose jamais un créneau déjà passé", () => {
    const maintenant = new Date("2026-08-10T09:45:00");
    const libres = creneauxLibres([matin], [], [], LUNDI, LUNDI, maintenant);
    expect(libres).toHaveLength(2); // 10h et 10h30
  });

  it("une plage mal saisie ne produit rien plutôt que n'importe quoi", () => {
    const absurdes: PlageHebdomadaire[] = [
      { jourSemaine: 1, debut: "11:00", fin: "09:00", dureeCreneauMinutes: 30 },
      { jourSemaine: 1, debut: "09:00", fin: "11:00", dureeCreneauMinutes: 0 },
      { jourSemaine: 1, debut: "pas une heure", fin: "11:00", dureeCreneauMinutes: 30 },
    ];
    expect(creneauxLibres(absurdes, [], [], LUNDI, LUNDI, AVANT)).toEqual([]);
  });

  it("couvre plusieurs jours et les rend dans l'ordre", () => {
    const semaine = new Date("2026-08-17T00:00:00");
    const libres = creneauxLibres([matin], [], [], LUNDI, semaine, AVANT);
    expect(libres).toHaveLength(8); // deux lundis
    expect(libres[0].debut.getTime()).toBeLessThan(libres[7].debut.getTime());
  });
});

describe("regroupement par journée", () => {
  it("réunit les créneaux d'un même jour", () => {
    const semaine = new Date("2026-08-17T00:00:00");
    const journees = grouperParJournee(creneauxLibres([matin], [], [], LUNDI, semaine, AVANT));
    expect(journees).toHaveLength(2);
    expect(journees[0].creneaux).toHaveLength(4);
  });
});

describe("état d'une consultation", () => {
  it("traduit les valeurs stockées", () => {
    expect(etatConsultation("scheduled")).toBe("confirmee");
    expect(etatConsultation("done")).toBe("faite");
    expect(etatConsultation("cancelled")).toBe("annulee");
    expect(etatConsultation("no_show")).toBe("annulee");
    expect(etatConsultation(null)).toBe("demandee");
  });

  it("réservée mais sans lien de visio : le client attend encore", () => {
    /*
     * Le statut en base dit « confirmee » dès le paiement. Ce n'est pas ce que le
     * client attend : il attend le lien que l'avocat envoie. Annoncer « confirmée »
     * avant ce lien lui ferait croire qu'il n'a plus rien à recevoir.
     */
    expect(etatAffiche({ etat: "confirmee", lienVisio: null })).toBe("attente");
    expect(etatAffiche({ etat: "confirmee", lienVisio: "https://visio.example/abc" })).toBe(
      "confirmee"
    );
  });

  it("une consultation faite ou annulée l'est, lien ou pas", () => {
    expect(etatAffiche({ etat: "faite", lienVisio: null })).toBe("faite");
    expect(etatAffiche({ etat: "annulee", lienVisio: "https://visio.example/abc" })).toBe(
      "annulee"
    );
  });

  it("chaque état a son mot, court en liste et explicite en détail", () => {
    expect(libelleEtat("attente")).toBe("En attente");
    expect(libelleEtatDetaille("attente")).toBe("En attente de confirmation");
    expect(libelleEtat("confirmee")).toBe("Confirmée");
    expect(libelleEtatDetaille("confirmee")).toContain("lien");
  });
});

describe("annulation", () => {
  const maintenant = new Date("2026-08-10T12:00:00");

  it("un rendez-vous à venir s'annule", () => {
    expect(annulable("confirmee", new Date("2026-08-11T09:00:00"), maintenant)).toBe(true);
  });

  it("un rendez-vous passé ne s'annule plus", () => {
    expect(annulable("confirmee", new Date("2026-08-09T09:00:00"), maintenant)).toBe(false);
  });

  it("un rendez-vous déjà fait ou annulé non plus", () => {
    const demain = new Date("2026-08-11T09:00:00");
    expect(annulable("faite", demain, maintenant)).toBe(false);
    expect(annulable("annulee", demain, maintenant)).toBe(false);
  });
});
