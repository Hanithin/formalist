import { describe, it, expect } from "vitest";
import {
  statutDocument,
  statutContrat,
  etatDocument,
  filtreValide,
  FILTRES_DOCUMENTS,
  FILTRES_CONTRATS,
} from "@/domain/document/statuts";

describe("libellés de documents", () => {
  it("traduit les valeurs techniques", () => {
    expect(statutDocument("generated").libelle).toBe("Généré");
    expect(statutDocument("verified").libelle).toBe("Vérifié");
  });

  it("distingue ce qui est abouti de ce qui attend", () => {
    expect(statutDocument("verified").ton).toBe("abouti");
    expect(statutDocument("uploaded").ton).toBe("attente");
  });

  it("affiche un statut inconnu plutôt que de le masquer", () => {
    expect(statutDocument("statut_inedit").libelle).toBe("statut_inedit");
  });

  it("un statut absent ne casse pas l'affichage", () => {
    expect(statutDocument(null).libelle).toBe("Inconnu");
  });
});

describe("libellés de contrats", () => {
  it("traduit toute la chaîne de validation", () => {
    expect(statutContrat("brouillon").libelle).toBe("Brouillon");
    expect(statutContrat("en_validation").libelle).toBe("En validation");
    expect(statutContrat("signe").libelle).toBe("Signé");
  });
});

describe("document rejeté", () => {
  it("le rejet prime sur le statut : c'est lui qui demande une action", () => {
    const etat = etatDocument({ status: "uploaded", rejection_reason: "Illisible" });
    expect(etat.libelle).toBe("À remplacer");
    expect(etat.motif).toBe("Illisible");
  });

  it("sans rejet, le statut normal s'applique", () => {
    const etat = etatDocument({ status: "verified", rejection_reason: null });
    expect(etat.libelle).toBe("Vérifié");
    expect(etat.motif).toBeNull();
  });
});

describe("filtres", () => {
  it("un filtre connu est conservé", () => {
    expect(filtreValide(FILTRES_CONTRATS, "signe")).toBe("signe");
  });

  it("un filtre inventé retombe sur « tous »", () => {
    // La valeur vient de l'adresse : elle n'est jamais crue sur parole.
    expect(filtreValide(FILTRES_CONTRATS, "n-importe-quoi")).toBe("tous");
    expect(filtreValide(FILTRES_DOCUMENTS, undefined)).toBe("tous");
  });

  it("chaque liste propose « tous » en premier", () => {
    for (const liste of [FILTRES_DOCUMENTS, FILTRES_CONTRATS]) {
      expect(liste[0].valeur).toBe("tous");
    }
  });
});
