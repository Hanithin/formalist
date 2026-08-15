import { describe, it, expect } from "vitest";
import {
  DROITS,
  DROITS_PAR_DEFAUT,
  choixDeRole,
  pouvoirDuRole,
  resumeDesDroits,
  droitsDemandes,
  joursRestants,
  delaiLisible,
  type Droits,
} from "@/domain/equipe/droits";
import type { Equipe } from "@/domain/equipe/invitations";

const equipeCliente: Equipe = { id: 1, type: "client" };
const cabinet: Equipe = { id: 2, type: "cabinet" };

const droits = (modifications: Partial<Droits> = {}): Droits => ({
  ...DROITS_PAR_DEFAUT,
  ...modifications,
});

describe("les droits d'un membre", () => {
  it("chacun dit ce qui se passe quand on ne l'a pas", () => {
    /*
     * « Voir tous les dossiers » ne dit pas ce qu'on voit sans ce droit, et c'est
     * exactement ce qu'on veut savoir avant de décocher.
     */
    for (const droit of DROITS) {
      expect(droit.explication).toMatch(/^Sans ce droit/);
    }
  });

  it("un nouvel arrivant crée, sans rien voir de plus", () => {
    expect(DROITS_PAR_DEFAUT).toEqual({
      voitTousLesDossiers: false,
      peutModifier: false,
      peutCreer: true,
    });
  });

  it("le résumé dit toujours ce qu'on voit, même quand c'est peu", () => {
    // Une liste vide ferait croire à un oubli d'affichage plutôt qu'à un accès réduit.
    expect(resumeDesDroits(droits({ peutCreer: false }))).toEqual(["Voit ses dossiers"]);
    expect(resumeDesDroits(droits({ voitTousLesDossiers: true, peutModifier: true }))).toEqual([
      "Voit tous les dossiers",
      "Modifie",
      "Crée des formalités",
    ]);
  });
});

describe("la lecture d'une demande", () => {
  it("un droit absent garde sa valeur", () => {
    /*
     * Un panneau qui n'expose que le rôle ne doit pas remettre les trois cases à zéro
     * en passant : l'absence n'est pas un refus.
     */
    const actuels = droits({ voitTousLesDossiers: true, peutModifier: true });
    expect(droitsDemandes({}, actuels)).toEqual(actuels);
  });

  it("un droit à faux est bien retiré", () => {
    // false et undefined ne se confondent pas : le premier est une décision.
    const actuels = droits({ voitTousLesDossiers: true });
    expect(droitsDemandes({ voitTousLesDossiers: false }, actuels).voitTousLesDossiers).toBe(false);
  });
});

describe("le rôle et son pouvoir", () => {
  it("le rôle qui dirige annonce qu'il gère l'équipe", () => {
    expect(pouvoirDuRole(equipeCliente, "admin")).toContain("Gère l'équipe");
    expect(pouvoirDuRole(cabinet, "avocat")).toContain("Gère l'équipe");
  });

  it("dans un cabinet, administrateur ne veut pas dire dirigeant", () => {
    // La responsabilité professionnelle reste à l'avocat : le libellé ne ment pas.
    expect(pouvoirDuRole(cabinet, "admin")).not.toContain("Gère l'équipe");
  });

  it("les choix offerts portent chacun leur explication", () => {
    const choix = choixDeRole(cabinet);
    expect(choix.map((c) => c.valeur)).toContain("avocat");
    expect(choix.every((c) => c.libelle.length > 0 && c.pouvoir.length > 0)).toBe(true);
  });

  it("une équipe cliente ne propose pas le rôle d'avocat", () => {
    expect(choixDeRole(equipeCliente).map((c) => c.valeur)).not.toContain("avocat");
  });
});

describe("le délai d'une invitation", () => {
  const maintenant = new Date("2026-08-16T12:00:00Z");

  it("s'arrondit vers le haut", () => {
    // Un lien valable encore trois heures expire aujourd'hui, pas dans zéro jour.
    expect(joursRestants(new Date("2026-08-16T15:00:00Z"), maintenant)).toBe(1);
  });

  it("se dit en français", () => {
    expect(delaiLisible(new Date("2026-08-21T12:00:00Z"), maintenant)).toBe("expire dans 5 jours");
    expect(delaiLisible(new Date("2026-08-17T12:00:00Z"), maintenant)).toBe("expire demain");
  });

  it("un délai passé ne compte pas à rebours", () => {
    expect(joursRestants(new Date("2026-08-10T12:00:00Z"), maintenant)).toBe(0);
    expect(delaiLisible(new Date("2026-08-10T12:00:00Z"), maintenant)).toBe("expire aujourd'hui");
  });
});
