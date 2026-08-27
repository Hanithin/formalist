import { describe, it, expect } from "vitest";
import {
  comptes,
  depuis,
  estFiltre,
  etatCabinet,
  retenir,
  type DossierCabinet,
} from "@/domain/formalite/avocat";

function dossier(partiel: Partial<DossierCabinet>): DossierCabinet {
  return { status: "en_cours", phase: 1, sousPhase: null, creePar: "client", ...partiel };
}

describe("où en est le travail du cabinet", () => {
  it("la sous-phase prime : c'est elle qui décrit le travail", () => {
    expect(etatCabinet(dossier({ sousPhase: "5a" }))).toEqual({
      libelle: "Transmis",
      teinte: "orange",
    });
    /*
     * La dernière étape se dit « Terminé », non « KBIS » : le greffe ne délivre un
     * Kbis qu'à une immatriculation, quand un dépôt de comptes reçoit un récépissé.
     */
    expect(etatCabinet(dossier({ sousPhase: "5e" })).libelle).toBe("Terminé");
  });

  it("sans sous-phase, le dossier est encore côté client", () => {
    // Tant que le client complète, il n'y a rien à vérifier.
    expect(etatCabinet(dossier({ phase: 2 }))).toEqual({ libelle: "Côté client", teinte: "gray" });
  });

  it("passé la phase 5, il est chez nous", () => {
    expect(etatCabinet(dossier({ phase: 5 })).libelle).toBe("En traitement");
  });

  it("un dossier terminé le dit, quelle que soit sa phase", () => {
    expect(etatCabinet(dossier({ status: "terminee", phase: 2 })).libelle).toBe("Terminé");
  });

  it("un dossier que personne n'a pris appelle un preneur", () => {
    // Il affichait « En traitement » comme tout dossier réglé : rien ne distinguait
    // celui qu'un confrère révise de celui qui attend qu'on le prenne.
    expect(etatCabinet(dossier({ phase: 5, libre: true }))).toEqual({
      libelle: "À prendre",
      teinte: "orange",
    });
  });

  it("un dossier terminé n'est jamais à prendre", () => {
    expect(etatCabinet(dossier({ status: "terminee", libre: true })).libelle).toBe("Terminé");
  });
});

describe("filtres de la liste", () => {
  const liste = [
    dossier({ sousPhase: "5a" }),
    dossier({ sousPhase: "5b" }),
    dossier({ sousPhase: "5c" }),
    dossier({ status: "terminee", phase: 6 }),
    dossier({ creePar: "avocat" }),
    dossier({ phase: 5, libre: true }),
    dossier({ phase: 5, monDossier: true, sousPhase: "5d" }),
  ];

  it("« à vérifier » réunit ce que le cabinet doit relire", () => {
    expect(retenir(liste, "verifier")).toHaveLength(2);
  });

  it("« à prendre » ne réunit que les dossiers qui attendent un preneur", () => {
    expect(retenir(liste, "aprendre")).toHaveLength(1);
    expect(retenir(liste, "aprendre")[0].libre).toBe(true);
  });

  it("« assignés à moi » retrouve ce qu'on a accepté de réviser", () => {
    const miens = retenir(liste, "assignes");
    expect(miens).toHaveLength(1);
    expect(miens[0].monDossier).toBe(true);
  });

  it("un dossier terminé compte comme terminé même sans sous-phase 5e", () => {
    expect(retenir(liste, "termines")).toHaveLength(1);
  });

  it("le compte annoncé est celui du filtre, sans quoi il ne sert à rien", () => {
    const n = comptes(liste);
    expect(n.tous).toBe(liste.length);
    expect(n.aprendre).toBe(retenir(liste, "aprendre").length);
    expect(n.assignes).toBe(retenir(liste, "assignes").length);
    expect(n.verifier).toBe(retenir(liste, "verifier").length);
    expect(n.encours).toBe(retenir(liste, "encours").length);
    expect(n.termines).toBe(retenir(liste, "termines").length);
    expect(n.miens).toBe(retenir(liste, "miens").length);
  });

  it("un filtre inventé retombe sur « tous » plutôt que de vider la liste", () => {
    // Le filtre vient de l'adresse : il peut contenir n'importe quoi.
    expect(estFiltre("nimportequoi")).toBe("tous");
    expect(estFiltre(undefined)).toBe("tous");
    expect(estFiltre("verifier")).toBe("verifier");
  });
});

describe("ancienneté d'une modification", () => {
  const maintenant = new Date("2026-08-10T12:00:00Z");
  const ilYA = (minutes: number) => new Date(maintenant.getTime() - minutes * 60000);

  it("se lit en minutes, en heures, puis en jours", () => {
    expect(depuis(ilYA(5), maintenant)).toBe("il y a 5 min");
    expect(depuis(ilYA(150), maintenant)).toBe("il y a 2 h");
    expect(depuis(ilYA(60 * 24 * 3), maintenant)).toBe("il y a 3 j");
  });

  it("jamais « il y a 0 min »", () => {
    expect(depuis(maintenant, maintenant)).toBe("il y a 1 min");
  });

  it("au-delà d'une semaine, la date vaut mieux qu'un décompte", () => {
    expect(depuis(new Date("2026-07-02T12:00:00Z"), maintenant)).toMatch(/juil/);
  });
});
