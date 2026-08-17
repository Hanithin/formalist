import { describe, it, expect } from "vitest";
import {
  agrementDeDroit,
  cessionVide,
  nomDeLAssocie,
  prixParPart,
  repartitionApres,
  totalDesParts,
  verifierCessions,
  type Cession,
} from "@/domain/modification/cession";
import type { AssociePresent } from "@/domain/modification/gabarit";

/**
 * Les cessions de parts.
 *
 * Le formulaire demandait « Nom du cédant » dans un champ vide, alors que l'étape
 * suivante faisait saisir les mêmes personnes avec leurs parts : on pouvait céder cinq
 * cents parts quand on en détenait cent, et l'acte sortait ainsi.
 */

const ASSOCIES: AssociePresent[] = [
  { prenom: "Jean", nom: "DUPONT", parts: 500 },
  { prenom: "Marie", nom: "MARTIN", parts: 300 },
  { nature: "morale", denomination: "ACME HOLDING", parts: 200 },
];

const cession = (modifications: Partial<Cession> = {}): Cession => ({
  ...cessionVide(),
  cedant: 0,
  parts: 100,
  prix: 10000,
  date: "2026-09-15",
  vers: "tiers",
  nom: "Paul BERNARD",
  ...modifications,
});

describe("nommer les associés", () => {
  it("une personne par son nom, une société par sa dénomination", () => {
    expect(nomDeLAssocie(ASSOCIES[0], 0)).toBe("Jean DUPONT");
    expect(nomDeLAssocie(ASSOCIES[2], 2)).toBe("ACME HOLDING");
  });

  it("un associé encore anonyme reste désignable", () => {
    // Sans cela, la liste déroulante offrirait des lignes vides qu'on ne peut pas viser.
    expect(nomDeLAssocie({}, 3)).toBe("Associé 4");
    expect(nomDeLAssocie(undefined, 1)).toBe("Associé 2");
  });
});

describe("la répartition après cession", () => {
  it("retire au cédant et donne au tiers, qui entre au capital", () => {
    const lignes = repartitionApres(ASSOCIES, [cession()]);

    expect(lignes.find((l) => l.nom === "Jean DUPONT")).toMatchObject({ avant: 500, apres: 400 });
    expect(lignes.find((l) => l.nom === "Paul BERNARD")).toMatchObject({
      avant: 0,
      apres: 100,
      entrant: true,
    });
  });

  it("le total ne bouge pas : une cession ne crée pas de parts", () => {
    const lignes = repartitionApres(ASSOCIES, [cession(), cession({ cedant: 1, parts: 50 })]);
    const apres = lignes.reduce((t, l) => t + l.apres, 0);
    expect(apres).toBe(totalDesParts(ASSOCIES));
  });

  it("deux cessions au même acquéreur ne font qu'un associé", () => {
    const lignes = repartitionApres(ASSOCIES, [
      cession({ parts: 100 }),
      cession({ cedant: 1, parts: 50, nom: "paul bernard" }),
    ]);
    const paul = lignes.filter((l) => l.entrant);
    expect(paul).toHaveLength(1);
    expect(paul[0].apres).toBe(150);
  });

  it("un associé qui cède tout est signalé comme sortant", () => {
    const lignes = repartitionApres(ASSOCIES, [cession({ cedant: 1, parts: 300 })]);
    expect(lignes.find((l) => l.nom === "Marie MARTIN")).toMatchObject({ apres: 0, sortant: true });
  });

  it("entre associés, rien n'entre ni ne sort", () => {
    const lignes = repartitionApres(ASSOCIES, [
      cession({ vers: "associe", cessionnaire: 1, nom: null }),
    ]);
    expect(lignes).toHaveLength(3);
    expect(lignes[1]).toMatchObject({ avant: 300, apres: 400 });
  });
});

describe("ce qui empêche une cession de tenir", () => {
  it("on ne cède pas plus qu'on ne détient", () => {
    const anomalies = verifierCessions(ASSOCIES, [cession({ parts: 900 })]);
    expect(anomalies.map((a) => a.message).join(" ")).toContain("ne détient que 500 parts");
  });

  it("deux cessions qui, ensemble, vident au-delà du compte", () => {
    /*
     * Chacune tient prise à part : c'est le cumul qui déborde, et lui seul le dit.
     */
    const anomalies = verifierCessions(ASSOCIES, [
      cession({ parts: 300 }),
      cession({ parts: 300 }),
    ]);
    expect(anomalies.map((a) => a.message).join(" ")).toContain("au total plus de parts");
  });

  it("le cédant et le cessionnaire ne sont pas la même personne", () => {
    const anomalies = verifierCessions(ASSOCIES, [
      cession({ vers: "associe", cessionnaire: 0, nom: null }),
    ]);
    expect(anomalies.map((a) => a.message).join(" ")).toContain("la même personne");
  });

  it("chaque manque se pose sous sa cession, non en tête de page", () => {
    const anomalies = verifierCessions(ASSOCIES, [cession(), cession({ parts: null })]);
    expect(anomalies.map((a) => a.champ)).toContain("cession-1-parts");
  });

  it("une cession complète ne soulève rien", () => {
    expect(verifierCessions(ASSOCIES, [cession()])).toEqual([]);
  });

  it("sans aucune cession, on demande de la renseigner, non d'en ajouter une", () => {
    // L'écran en montre déjà une, vide : « ajoutez » désignerait un bouton absent.
    expect(verifierCessions(ASSOCIES, [])).toEqual([
      { champ: "cessions", message: "Renseignez la cession" },
    ]);
  });
});

describe("ce qui se calcule et ce qui se déduit", () => {
  it("le prix par part", () => {
    expect(prixParPart(cession({ parts: 100, prix: 10000 }))).toBe(100);
    expect(prixParPart(cession({ parts: 0 }))).toBeNull();
  });

  it("l'agrément suit la forme et le destinataire", () => {
    /*
     * Dans une SARL, la loi l'exige pour une cession à un tiers (art. L. 223-14) ;
     * entre associés elle ne l'impose pas. Dans une société par actions, rien n'est de
     * droit : tout dépend d'une clause.
     */
    expect(agrementDeDroit("SARL", "tiers").requis).toBe(true);
    expect(agrementDeDroit("SARL", "associe").requis).toBe(false);
    expect(agrementDeDroit("SAS", "tiers").requis).toBe(false);
    expect(agrementDeDroit("SCI", "tiers").requis).toBe(true);
    expect(agrementDeDroit("SAS", "tiers").motif).toContain("clause");
  });
});
