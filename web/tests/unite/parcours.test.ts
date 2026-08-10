import { describe, it, expect } from "vitest";
import {
  ETAPES,
  verifierEtape,
  premiereEtapeIncomplete,
  etapeAccessible,
  avancementParcours,
  type Brouillon,
} from "@/domain/formalite/parcours";

const societeComplete: Brouillon = {
  forme: "SASU",
  denomination: "ATELIER MERIDIEN",
  activite: "Conseil en design",
  adresse: "12 rue des Lilas",
  codePostal: "75011",
  ville: "Paris",
};

const complet: Brouillon = {
  ...societeComplete,
  associes: [{ prenom: "Camille", nom: "Durand", apport: 1000 }],
  dirigeants: [{ prenom: "Camille", nom: "Durand" }],
  capital: 1000,
  capitalLibere: 1000,
  offre: "starter",
};

describe("étape 1, informations de la société", () => {
  it("un brouillon vide manque de tout", () => {
    const anomalies = verifierEtape(1, {});
    expect(anomalies.map((a) => a.champ)).toContain("forme");
    expect(anomalies.map((a) => a.champ)).toContain("denomination");
  });

  it("complète, elle ne signale rien", () => {
    expect(verifierEtape(1, societeComplete)).toEqual([]);
  });

  it("un code postal à quatre chiffres est refusé", () => {
    const anomalies = verifierEtape(1, { ...societeComplete, codePostal: "7501" });
    expect(anomalies[0].champ).toBe("codePostal");
  });

  it("un nom fait d'espaces ne compte pas comme renseigné", () => {
    const anomalies = verifierEtape(1, { ...societeComplete, denomination: "   " });
    expect(anomalies.map((a) => a.champ)).toContain("denomination");
  });
});

describe("étape 2, associés", () => {
  it("une SASU refuse deux associés", () => {
    const anomalies = verifierEtape(2, {
      ...societeComplete,
      associes: [{ prenom: "A", nom: "A" }, { prenom: "B", nom: "B" }],
    });
    expect(anomalies.map((a) => a.champ)).toContain("associes");
  });

  it("un associé sans nom est signalé, avec son rang", () => {
    const anomalies = verifierEtape(2, { ...societeComplete, associes: [{ prenom: "Camille" }] });
    expect(anomalies[0].message).toContain("associé 1");
  });
});

describe("étape 3, dirigeants", () => {
  it("le mot employé suit la forme juridique", () => {
    expect(verifierEtape(3, { forme: "SARL" })[0].message).toContain("gérant");
    expect(verifierEtape(3, { forme: "SASU" })[0].message).toContain("président");
  });
});

describe("étape 4, capital", () => {
  it("la répartition doit couvrir le capital", () => {
    const anomalies = verifierEtape(4, {
      ...complet,
      capital: 2000,
      capitalLibere: 2000,
      associes: [{ prenom: "A", nom: "A", apport: 1500 }],
    });
    expect(anomalies.some((a) => a.champ === "repartition")).toBe(true);
  });

  it("cohérente, elle passe", () => {
    expect(verifierEtape(4, complet)).toEqual([]);
  });
});

describe("progression dans le parcours", () => {
  it("un brouillon vide bloque à la première étape", () => {
    expect(premiereEtapeIncomplete({})).toBe(1);
  });

  it("aucune étape vide ne se déclare complète", () => {
    // Sans forme juridique, les étapes 2 et 4 passaient à travers les règles de
    // forme et se disaient faites alors que rien n'était saisi.
    expect(verifierEtape(2, {}).length).toBeGreaterThan(0);
    expect(verifierEtape(4, {}).length).toBeGreaterThan(0);
  });

  it("la société renseignée fait avancer d'un cran", () => {
    expect(premiereEtapeIncomplete(societeComplete)).toBe(2);
  });

  it("un brouillon complet ne bloque plus", () => {
    expect(premiereEtapeIncomplete(complet)).toBeNull();
  });

  it("on ne saute pas par-dessus une étape incomplète", () => {
    // Demander l'étape 4 sans associés ramène à l'étape 2
    expect(etapeAccessible(4, societeComplete)).toBe(2);
  });

  it("revenir en arrière reste libre", () => {
    expect(etapeAccessible(1, societeComplete)).toBe(1);
  });

  it("une étape hors bornes est ramenée dans le parcours", () => {
    expect(etapeAccessible(99, complet)).toBe(ETAPES.length);
    expect(etapeAccessible(-3, complet)).toBe(1);
  });

  it("l'avancement se compte en étapes complètes", () => {
    // Seule l'étape des pièces ne bloque pas : elle se vérifie au dépôt.
    expect(avancementParcours({})).toBe(17);
    expect(avancementParcours(complet)).toBe(100);
  });
});
