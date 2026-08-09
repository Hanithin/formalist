import { describe, it, expect } from "vitest";
import {
  nombreDEtapes,
  avancement,
  libelleEtape,
  libelleDossier,
  tonDossier,
  accorder,
} from "@/domain/formalite/etapes";

describe("nombre d'étapes selon l'offre", () => {
  it("cinq étapes sur la formule d'entrée", () => {
    expect(nombreDEtapes("starter")).toBe(5);
    expect(nombreDEtapes(null)).toBe(5);
  });

  it("six dès qu'un avocat relit le dossier", () => {
    expect(nombreDEtapes("business")).toBe(6);
  });
});

describe("avancement", () => {
  it("se calcule sur le nombre d'étapes de l'offre", () => {
    expect(avancement(4, "starter")).toBe(80);
    expect(avancement(4, "business")).toBe(67);
  });

  it("ne dépasse jamais cent pour cent", () => {
    expect(avancement(9, "starter")).toBe(100);
  });

  it("ne descend jamais sous zéro", () => {
    expect(avancement(-3, "starter")).toBe(0);
  });
});

describe("libellé d'étape", () => {
  it("nomme la banque quand elle est connue", () => {
    expect(libelleEtape(1, "Qonto")).toBe("À déposer chez Qonto");
  });

  it("reste compréhensible sans la banque", () => {
    expect(libelleEtape(1, null)).toBe("En attente du dépôt du capital");
  });

  it("suit les étapes du parcours", () => {
    expect(libelleEtape(2)).toBe("En attente d'attestation");
    expect(libelleEtape(3)).toBe("En attente de signature");
    expect(libelleEtape(4)).toBe("En révision par l'avocat");
    expect(libelleEtape(5)).toBe("En cours d'immatriculation");
  });

  it("au-delà de la dernière étape, le dossier est terminé", () => {
    expect(libelleEtape(6)).toBe("Terminée");
    expect(libelleEtape(12)).toBe("Terminée");
  });

  it("une phase absente ou absurde retombe sur la première étape", () => {
    expect(libelleEtape(0)).toBe("En attente du dépôt du capital");
    expect(libelleEtape(NaN)).toBe("En attente du dépôt du capital");
  });
});

describe("état d'un dossier", () => {
  it("un dossier terminé le dit, quelle que soit sa phase", () => {
    expect(libelleDossier({ status: "terminee", phase: 2 })).toBe("Terminée");
    expect(tonDossier({ status: "terminee", phase: 2 })).toBe("termine");
  });

  it("sinon, l'étape en cours fait le libellé", () => {
    expect(libelleDossier({ status: "en_cours", phase: 3 })).toBe("En attente de signature");
    expect(tonDossier({ status: "en_cours", phase: 3 })).toBe("avance");
  });

  it("un dossier en attente se distingue d'un dossier qui avance", () => {
    expect(tonDossier({ status: "en_attente", phase: 2 })).toBe("attente");
  });
});

describe("accord du pluriel", () => {
  it("le singulier ne prend pas de s", () => {
    // « 1 formalité terminées » relevé en revue : le pluriel se décide ici.
    expect(accorder(1, "formalité terminée", "formalités terminées")).toBe("1 formalité terminée");
  });

  it("zéro suit le singulier, comme en français", () => {
    expect(accorder(0, "dossier", "dossiers")).toBe("0 dossier");
  });

  it("au-delà, le pluriel", () => {
    expect(accorder(4, "dossier", "dossiers")).toBe("4 dossiers");
  });
});
