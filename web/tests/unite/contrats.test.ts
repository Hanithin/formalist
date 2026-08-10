import { describe, it, expect } from "vitest";
import {
  CONTRATS,
  definitionContrat,
  verifierContrat,
  transitionPermise,
} from "@/domain/contrat/catalogue";

describe("catalogue", () => {
  it("chaque contrat a un libellé, une description et des champs", () => {
    for (const c of CONTRATS) {
      expect(c.libelle).not.toBe("");
      expect(c.description).not.toBe("");
      expect(c.champs.length).toBeGreaterThan(0);
    }
  });

  it("aucun code en double", () => {
    const codes = CONTRATS.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("un type inconnu ne rend pas de définition", () => {
    expect(definitionContrat("contrat_de_mariage")).toBeNull();
  });
});

describe("vérification", () => {
  const bail = {
    partieA: "SARL Exemple",
    partieB: "Monsieur Durand",
    adresseLocal: "12 rue des Lilas, Paris",
    loyerMensuel: 1200,
    dateDebut: "2026-09-01",
  };

  it("accepte un contrat complet", () => {
    expect(verifierContrat("bail_commercial", bail)).toEqual([]);
  });

  it("signale chaque champ manquant", () => {
    const champs = verifierContrat("bail_commercial", {}).map((a) => a.champ);
    expect(champs).toContain("partieA");
    expect(champs).toContain("loyerMensuel");
  });

  it("un montant nul ou négatif est refusé", () => {
    expect(verifierContrat("bail_commercial", { ...bail, loyerMensuel: 0 })).toHaveLength(1);
    expect(verifierContrat("bail_commercial", { ...bail, loyerMensuel: -50 })).toHaveLength(1);
  });

  it("une date mal formée est refusée", () => {
    const anomalies = verifierContrat("bail_commercial", { ...bail, dateDebut: "01/09/2026" });
    expect(anomalies[0].champ).toBe("dateDebut");
  });

  it("un champ facultatif peut rester vide", () => {
    const prestation = {
      partieA: "A",
      partieB: "B",
      mission: "Refonte du site",
      montant: 5000,
      dateDebut: "2026-09-01",
    };
    expect(verifierContrat("prestation", prestation)).toEqual([]);
  });

  it("un contrat ne peut pas finir avant de commencer", () => {
    const cdd = {
      partieA: "A",
      partieB: "B",
      poste: "Développeur",
      remuneration: 45000,
      dateDebut: "2026-09-01",
      dateFin: "2026-08-01",
      motif: "Remplacement",
    };
    const anomalies = verifierContrat("cdd", cdd);
    expect(anomalies.some((a) => a.champ === "dateFin")).toBe(true);
  });

  it("un type inconnu est signalé plutôt qu'accepté", () => {
    expect(verifierContrat("inconnu", {})[0].champ).toBe("type");
  });
});

describe("cycle de vie", () => {
  it("un brouillon se génère", () => {
    expect(transitionPermise("brouillon", "genere")).toBe(true);
  });

  it("un contrat généré repart en brouillon ou passe en validation", () => {
    expect(transitionPermise("genere", "brouillon")).toBe(true);
    expect(transitionPermise("genere", "en_validation")).toBe(true);
  });

  it("on ne saute pas d'étape", () => {
    expect(transitionPermise("brouillon", "signe")).toBe(false);
    expect(transitionPermise("genere", "valide")).toBe(false);
  });

  it("un contrat signé ne revient jamais en arrière", () => {
    // Il engage les parties : le modifier après coup n'aurait aucune valeur.
    for (const etat of ["brouillon", "genere", "en_validation", "valide"]) {
      expect(transitionPermise("signe", etat)).toBe(false);
    }
  });

  it("un état inconnu n'autorise rien", () => {
    expect(transitionPermise("inconnu", "signe")).toBe(false);
  });
});
