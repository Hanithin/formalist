import { describe, it, expect } from "vitest";
import {
  estSupprimable,
  motifDuRefus,
  phraseDuRefus,
  type DossierASupprimer,
} from "@/domain/formalite/suppression";

/** Un brouillon que rien n'a engagé : le seul cas où la suppression est permise. */
function brouillon(modifications: Partial<DossierASupprimer> = {}): DossierASupprimer {
  return {
    statut: "en_cours",
    avocatAssigneId: null,
    finaliseLe: null,
    paye: false,
    aUnReglement: false,
    aUneSignature: false,
    ...modifications,
  };
}

describe("un brouillon jamais engagé se supprime", () => {
  it("accepte le dossier resté entre les mains de son propriétaire", () => {
    expect(estSupprimable(brouillon())).toBe(true);
    expect(motifDuRefus(brouillon())).toBeNull();
  });
});

describe("ce qui a été engagé ne se supprime plus", () => {
  it("refuse un dossier que le brouillon dit payé", () => {
    expect(motifDuRefus(brouillon({ paye: true }))).toBe("reglee");
  });

  /*
   * Le drapeau du brouillon et la table des règlements peuvent diverger : la
   * confirmation Stripe écrit les deux, mais pas dans le même geste. Une ligne
   * encaissée suffit à refuser, quoi que dise le brouillon.
   */
  it("refuse un dossier portant un règlement encaissé, brouillon muet", () => {
    expect(motifDuRefus(brouillon({ aUnReglement: true }))).toBe("reglee");
  });

  it("refuse un dossier transmis au cabinet", () => {
    expect(motifDuRefus(brouillon({ statut: "en_attente_validation" }))).toBe("confiee");
  });

  it("refuse un dossier pris par un avocat", () => {
    expect(motifDuRefus(brouillon({ avocatAssigneId: 12 }))).toBe("confiee");
  });

  it("refuse un dossier renvoyé pour corrections", () => {
    expect(motifDuRefus(brouillon({ statut: "corrections_demandees" }))).toBe("confiee");
  });

  /*
   * Un tiers a reçu un lien de signature : le dossier ne relève plus du seul client,
   * et le lien pointerait vers un dossier disparu.
   */
  it("refuse un dossier dont une signature a été demandée", () => {
    expect(motifDuRefus(brouillon({ aUneSignature: true }))).toBe("signature");
  });

  it("refuse un dossier déposé au registre", () => {
    expect(motifDuRefus(brouillon({ finaliseLe: new Date(2026, 7, 1) }))).toBe("deposee");
  });

  it("refuse un dossier terminé ou archivé", () => {
    expect(estSupprimable(brouillon({ statut: "terminee" }))).toBe(false);
    expect(estSupprimable(brouillon({ statut: "archive" }))).toBe(false);
  });

  /*
   * Un statut absent n'est pas « en cours » : un dossier dont on ne sait rien ne se
   * supprime pas sur un doute.
   */
  it("refuse un dossier sans statut", () => {
    expect(estSupprimable(brouillon({ statut: null }))).toBe(false);
  });
});

describe("le refus se dit au client", () => {
  it("nomme la raison plutôt que d'échouer en silence", () => {
    expect(phraseDuRefus("reglee")).toContain("réglée");
    expect(phraseDuRefus("confiee")).toContain("transmise");
    expect(phraseDuRefus("signature")).toContain("signature");
    expect(phraseDuRefus("deposee")).toContain("déposée");
  });

  /*
   * Le règlement passe avant la transmission : un dossier payé est toujours aussi
   * transmis, et « transmise au cabinet » laisserait croire qu'il suffit de le
   * rappeler pour le retirer.
   */
  it("annonce le règlement avant la transmission", () => {
    expect(motifDuRefus(brouillon({ paye: true, statut: "en_attente_validation" }))).toBe("reglee");
  });
});
