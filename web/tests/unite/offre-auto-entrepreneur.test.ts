import { describe, it, expect } from "vitest";
import {
  PRIX_HT_CENTIMES,
  PRIX_TTC_CENTIMES,
  tvaDe,
  montantLisible,
  detailDuPrix,
  PRESTATIONS,
  FRANCHISE,
  FRAIS_ANNONCES,
  FRAIS_AGENT_COMMERCIAL,
  etatDuPaiement,
} from "@/domain/auto-entrepreneur/offre";

describe("le prix", () => {
  it("149 euros hors taxes, 178,80 TTC", () => {
    expect(PRIX_HT_CENTIMES).toBe(14_900);
    expect(tvaDe(PRIX_HT_CENTIMES)).toBe(2_980);
    expect(PRIX_TTC_CENTIMES).toBe(17_880);
  });

  it("s'écrit sans centimes quand il est rond", () => {
    // « 149 € » plutôt que « 149,00 € » : les zéros donnent l'air d'un devis.
    expect(montantLisible(14_900)).toBe("149 €");
    expect(montantLisible(17_880)).toBe("178,80 €");
  });

  it("le détail rend les trois montants prêts à afficher", () => {
    const prix = detailDuPrix();
    expect(prix.ht).toBe("149 €");
    expect(prix.tva).toBe("29,80 €");
    expect(prix.ttc).toBe("178,80 €");
  });
});

describe("ce que l'offre dit", () => {
  it("chaque ligne est un travail, non une promesse", () => {
    /*
     * « Dépôt au guichet unique » se constate ; « accompagnement personnalisé » ne
     * veut rien dire et ne s'oppose à personne.
     */
    expect(PRESTATIONS.length).toBeGreaterThan(3);
    for (const prestation of PRESTATIONS) {
      expect(prestation).not.toMatch(/personnalisé|sur mesure|premium/i);
    }
  });

  it("elle ne cache pas que la démarche est gratuite", () => {
    // Qui l'apprend après coup ne revient pas.
    expect(FRANCHISE).toContain("gratuite");
    expect(FRANCHISE).toContain("INPI");
  });

  it("elle annonce les frais, y compris le seul cas payant", () => {
    /*
     * L'immatriculation d'un micro-entrepreneur est gratuite, sans frais de greffe ni
     * annonce légale. L'agent commercial est la seule exception, et c'est le greffe
     * qui perçoit ce droit - pas nous.
     */
    expect(FRAIS_ANNONCES).toContain("Aucun frais");
    expect(FRAIS_AGENT_COMMERCIAL).toContain("agent commercial");
    expect(FRAIS_AGENT_COMMERCIAL).toContain("greffe");
  });
});

describe("l'état du règlement", () => {
  it("distingue à payer, en cours et payé", () => {
    // Une session ouverte n'est pas un paiement : le client peut fermer l'onglet.
    expect(etatDuPaiement(null, false)).toBe("a_payer");
    expect(etatDuPaiement("cs_123", false)).toBe("en_cours");
    expect(etatDuPaiement("cs_123", true)).toBe("paye");
  });

  it("un dossier payé le reste, quelle que soit sa référence", () => {
    expect(etatDuPaiement(null, true)).toBe("paye");
  });
});
