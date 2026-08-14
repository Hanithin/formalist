import { describe, it, expect } from "vitest";
import {
  MATIERES,
  MATIERES_COURANTES,
  matiereValide,
  nomDeMatiere,
  ongletValide,
  ongletDe,
  dansLOnglet,
  comptesParOnglet,
  delaiAvant,
  type ConsultationRangee,
} from "@/domain/consultation/matieres";

const maintenant = new Date("2026-08-14T12:00:00Z");

const rdv = (p: Partial<ConsultationRangee> = {}): ConsultationRangee => ({
  etat: "confirmee",
  debut: new Date("2026-08-20T10:00:00Z"),
  ...p,
});

describe("les matières", () => {
  it("les huit de la page d'origine, dans son ordre", () => {
    expect(MATIERES.map((m) => m.cle)).toEqual([
      "droit_societes",
      "fiscalite",
      "contrats",
      "droit_travail",
      "propriete_intellectuelle",
      "immobilier",
      "litige",
      "autre",
    ]);
  });

  it("les quatre proposées d'emblée font partie des huit", () => {
    for (const cle of MATIERES_COURANTES) {
      expect(MATIERES.some((m) => m.cle === cle)).toBe(true);
    }
  });

  it("une matière inventée n'en est pas une", () => {
    expect(matiereValide("droit_societes")).toBe("droit_societes");
    expect(matiereValide("astrologie")).toBeNull();
    expect(matiereValide(null)).toBeNull();
  });

  it("une matière inconnue se lit « Autre » plutôt que sa clé", () => {
    // Une consultation enregistrée avec une matière retirée depuis reste lisible.
    expect(nomDeMatiere("fiscalite")).toBe("Fiscalité");
    expect(nomDeMatiere("matiere_retiree")).toBe("Autre");
    expect(nomDeMatiere(null)).toBe("Autre");
  });
});

describe("le classement des consultations", () => {
  it("« à venir » se juge sur l'heure, pas sur l'état", () => {
    /*
     * Un rendez-vous confirmé dont l'heure est passée n'est plus à venir, même si
     * personne ne l'a encore marqué fait : le client ne doit pas l'attendre.
     */
    expect(ongletDe(rdv({ debut: new Date("2026-08-20T10:00:00Z") }), maintenant)).toBe("avenir");
    expect(ongletDe(rdv({ debut: new Date("2026-08-13T10:00:00Z") }), maintenant)).toBe("passees");
  });

  it("une annulation prime sur l'heure", () => {
    const futur = rdv({ etat: "annulee", debut: new Date("2026-08-20T10:00:00Z") });
    expect(ongletDe(futur, maintenant)).toBe("annulees");
  });

  it("une consultation faite est passée, quelle que soit l'heure", () => {
    const bizarre = rdv({ etat: "faite", debut: new Date("2026-08-20T10:00:00Z") });
    expect(ongletDe(bizarre, maintenant)).toBe("passees");
  });

  it("« toutes » ne cache rien", () => {
    expect(dansLOnglet(rdv({ etat: "annulee" }), "toutes", maintenant)).toBe(true);
  });

  it("chaque onglet annonce ce qu'il contient", () => {
    const comptes = comptesParOnglet(
      [
        rdv({ debut: new Date("2026-08-20T10:00:00Z") }),
        rdv({ debut: new Date("2026-08-21T10:00:00Z") }),
        rdv({ etat: "faite", debut: new Date("2026-08-01T10:00:00Z") }),
        rdv({ etat: "annulee", debut: new Date("2026-08-02T10:00:00Z") }),
      ],
      maintenant
    );

    expect(comptes).toEqual({ toutes: 4, avenir: 2, passees: 1, annulees: 1 });
  });

  it("un onglet inventé retombe sur « toutes »", () => {
    expect(ongletValide("n-importe-quoi")).toBe("toutes");
    expect(ongletValide("avenir")).toBe("avenir");
  });
});

describe("le délai avant un rendez-vous", () => {
  it("se dit en minutes, en heures, puis en jours", () => {
    expect(delaiAvant(new Date("2026-08-14T12:30:00Z"), maintenant)).toBe("dans 30 min");
    expect(delaiAvant(new Date("2026-08-14T18:00:00Z"), maintenant)).toBe("dans 6 h");
    expect(delaiAvant(new Date("2026-08-17T12:00:00Z"), maintenant)).toBe("dans 3 jours");
  });

  it("« demain » se dit plutôt que « dans 1 jour »", () => {
    expect(delaiAvant(new Date("2026-08-15T12:00:00Z"), maintenant)).toBe("demain");
  });

  it("on compte en jours jusqu'au mois, en mois au-delà", () => {
    // Trente jours restent trente jours : « dans un mois » serait moins précis.
    expect(delaiAvant(new Date("2026-09-13T12:00:00Z"), maintenant)).toBe("dans 30 jours");
    expect(delaiAvant(new Date("2026-09-20T12:00:00Z"), maintenant)).toBe("dans un mois");
    expect(delaiAvant(new Date("2026-10-13T12:00:00Z"), maintenant)).toBe("dans 2 mois");
  });

  it("un rendez-vous dépassé le dit", () => {
    expect(delaiAvant(new Date("2026-08-14T11:00:00Z"), maintenant)).toBe("passé");
  });
});
