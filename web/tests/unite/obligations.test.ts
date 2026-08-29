import { describe, it, expect } from "vitest";
import {
  obligationsDeLaSociete,
  derniereCloture,
  delaiLisible,
  enRetard,
} from "@/domain/societe/obligations";
import { natureDuDossier, type Societe } from "@/domain/societe/portefeuille";

/**
 * Les obligations d'une société.
 *
 * L'onglet annonçait « Prochaine échéance » et affichait un tiret partout : les
 * échéances ne se calculaient que depuis un dossier déjà ouvert, si bien qu'une société
 * créée n'en avait jamais. Le rappel arrivait après le geste qu'il devait provoquer.
 */

const societe = (p: Partial<Societe> & { clotureDuPremierExercice?: string | null } = {}) =>
  ({
    cle: "ATELIER",
    denomination: "ATELIER MERIDIEN",
    forme: "SARL",
    siren: null,
    clotureDuPremierExercice: "2027-12-31",
    dossiers: [],
    enCours: 0,
    majLe: new Date("2026-08-29T10:00:00Z"),
    ...p,
  }) as Societe & { clotureDuPremierExercice?: string | null };

const dossier = (p: Record<string, unknown>) =>
  ({
    id: 1,
    type: "comptes",
    societe: "ATELIER MERIDIEN",
    forme: "SARL",
    siren: null,
    status: "terminee",
    offre: "starter",
    etapeAffichee: 1,
    majLe: new Date(),
    ...p,
  }) as never;

describe("les obligations d'une société", () => {
  it("ne dit rien tant que le premier exercice n'est pas clos", () => {
    /*
     * Le fait est vrai - l'exercice se referme au 31 décembre 2027 - mais ce n'est pas
     * une échéance : il n'y a aucun compte à approuver avant qu'il y ait un exercice.
     */
    expect(obligationsDeLaSociete(societe(), new Date("2026-08-29"))).toEqual([]);
  });

  it("demande d'approuver puis de déposer, une fois l'exercice clos", () => {
    const suite = obligationsDeLaSociete(societe(), new Date("2028-02-01"));

    expect(suite.map((o) => o.nature)).toEqual(["approbation", "depot"]);
    /*
     * Six mois pour approuver, puis un mois pour déposer - de quantième à quantième,
     * non jusqu'à la fin du mois. Un exercice clos le 31 décembre s'approuve au plus
     * tard le 30 juin, et se dépose le 30 juillet.
     */
    expect(suite[0].limite).toBe("2028-06-30");
    expect(suite[1].limite).toBe("2028-07-30");
    expect(suite[0].exercice).toBe(2027);
  });

  it("dit le retard plutôt que de le taire", () => {
    const [approbation] = obligationsDeLaSociete(societe(), new Date("2028-09-01"));

    expect(enRetard(approbation, new Date("2028-09-01"))).toBe(true);
    // Le jour même n'est pas dépassé : on a jusqu'au soir.
    expect(enRetard(approbation, new Date("2028-06-30"))).toBe(false);
  });

  it("n'impose aucun dépôt à une société civile", () => {
    /*
     * Aucun texte ne l'y oblige, quel que soit son régime fiscal. Et son approbation
     * n'a pas de date légale : ce sont ses statuts qui la fixent, ce que le fondement
     * explique au lieu de laisser croire à un oubli.
     */
    const suite = obligationsDeLaSociete(
      societe({ forme: "SCI" }),
      new Date("2028-02-01")
    );

    expect(suite.map((o) => o.nature)).toEqual(["approbation"]);
    expect(suite[0].limite).toBeNull();
    expect(suite[0].fondement).toMatch(/société civile|statuts/i);
  });

  it("ne suppose rien d'une forme qu'il ne reconnaît pas", () => {
    expect(obligationsDeLaSociete(societe({ forme: "ZZZ" }), new Date("2028-02-01"))).toEqual(
      []
    );
    expect(obligationsDeLaSociete(societe({ forme: null }), new Date("2028-02-01"))).toEqual([]);
  });

  it("ne réclame rien sans date de clôture", () => {
    expect(
      obligationsDeLaSociete(societe({ clotureDuPremierExercice: null }), new Date("2028-02-01"))
    ).toEqual([]);
  });

  it("se tait sur un exercice déjà déposé", () => {
    const faite = societe({
      dossiers: [dossier({ clotureDeclaree: "2027-12-31", status: "terminee" })],
    });

    expect(obligationsDeLaSociete(faite, new Date("2028-02-01"))).toEqual([]);
  });

  it("ne tient pas quitte pour un dépôt d'un autre exercice", () => {
    const autre = societe({
      dossiers: [dossier({ clotureDeclaree: "2026-12-31", status: "terminee" })],
    });

    expect(obligationsDeLaSociete(autre, new Date("2028-02-01"))).toHaveLength(2);
  });

  it("ne tient pas quitte pour un dépôt commencé mais pas fini", () => {
    const encours = societe({
      dossiers: [dossier({ clotureDeclaree: "2027-12-31", status: "en_cours" })],
    });

    expect(obligationsDeLaSociete(encours, new Date("2028-02-01"))).toHaveLength(2);
  });

  it("ne réclame rien à une société qui n'est pas encore immatriculée", () => {
    /*
     * Tant que la création n'est pas terminée, il n'y a pas de personne morale : ni
     * comptes à approuver, ni dépôt à faire. Réclamer un dépôt à qui attend son Kbis
     * ferait douter de tout le reste.
     */
    const enCreation = societe({
      dossiers: [dossier({ type: "Création SARL", status: "en_cours" })],
    });

    expect(obligationsDeLaSociete(enCreation, new Date("2028-02-01"))).toEqual([]);
  });

  it("ne réclame plus rien à une société radiée", () => {
    const radiee = societe({
      dossiers: [dossier({ type: "fermeture", status: "terminee" })],
    });

    expect(obligationsDeLaSociete(radiee, new Date("2028-02-01"))).toEqual([]);
  });

  it("passe à l'exercice suivant l'année d'après", () => {
    const suite = obligationsDeLaSociete(societe(), new Date("2029-03-01"));

    expect(suite[0].exercice).toBe(2028);
    expect(suite[0].limite).toBe("2029-06-30");
  });
});

describe("la dernière clôture survenue", () => {
  it("rend null tant que la première n'est pas passée", () => {
    expect(derniereCloture("2027-12-31", new Date("2026-08-29"))).toBeNull();
  });

  it("rend la première le jour même", () => {
    expect(derniereCloture("2027-12-31", new Date("2027-12-31"))).toBe("2027-12-31");
  });

  it("remonte d'année en année", () => {
    expect(derniereCloture("2020-06-30", new Date("2026-08-29"))).toBe("2026-06-30");
    expect(derniereCloture("2020-06-30", new Date("2026-06-29"))).toBe("2025-06-30");
  });

  it("recule au dernier jour du mois quand le quantième n'existe pas", () => {
    // Un exercice clos le 29 février se referme le 28 les années ordinaires.
    expect(derniereCloture("2024-02-29", new Date("2025-06-01"))).toBe("2025-02-28");
  });

  it("ignore une date qui n'en est pas une", () => {
    expect(derniereCloture("", new Date("2026-08-29"))).toBeNull();
    expect(derniereCloture("31/12/2027", new Date("2028-01-01"))).toBeNull();
  });
});

describe("le délai en toutes lettres", () => {
  const jour = new Date("2026-08-29");

  it("compte les jours de près, les mois de loin", () => {
    expect(delaiLisible("2026-08-29", jour)).toBe("aujourd'hui");
    expect(delaiLisible("2026-08-30", jour)).toBe("demain");
    expect(delaiLisible("2026-09-05", jour)).toBe("dans 7 jours");
    expect(delaiLisible("2027-02-28", jour)).toBe("dans 6 mois");
  });

  it("compte le retard en jours : c'est à ce grain qu'il se rattrape", () => {
    expect(delaiLisible("2026-08-28", jour)).toBe("en retard d'un jour");
    expect(delaiLisible("2026-08-19", jour)).toBe("en retard de 10 jours");
  });
});

describe("la nature d'un dossier, quel que soit son libellé", () => {
  it("reconnaît le texte libre des dossiers repris", () => {
    // C'est ce qui faisait dire « Active » à une société en cours d'immatriculation.
    expect(natureDuDossier("Création SAS")).toBe("creation");
    expect(natureDuDossier("creation")).toBe("creation");
    expect(natureDuDossier("Dépôt des comptes")).toBe("comptes");
    expect(natureDuDossier("comptes")).toBe("comptes");
    expect(natureDuDossier("Modification de siège")).toBe("modification");
  });

  it("ne conclut rien de ce qu'il ne reconnaît pas", () => {
    expect(natureDuDossier("")).toBe("autre");
    expect(natureDuDossier(null)).toBe("autre");
    expect(natureDuDossier("chose inconnue")).toBe("autre");
  });
});
