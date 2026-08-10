import { describe, it, expect } from "vitest";
import {
  etatDemande,
  libelleEtat,
  toutLeMondeASigne,
  resteASigner,
  resumeSignatures,
  verifierTrace,
  type DemandeSignature,
} from "@/domain/formalite/signature";

const demande = (p: Partial<DemandeSignature> = {}): DemandeSignature => ({
  id: 1,
  nom: "Camille Durand",
  email: "camille@exemple.test",
  ouverteLe: null,
  signeeLe: null,
  ...p,
});

const maintenant = new Date("2026-08-10T12:00:00Z");

describe("état d'une demande", () => {
  it("suit les trois moments du circuit", () => {
    expect(etatDemande(demande())).toBe("en_attente");
    expect(etatDemande(demande({ ouverteLe: maintenant }))).toBe("ouverte");
    expect(etatDemande(demande({ ouverteLe: maintenant, signeeLe: maintenant }))).toBe("signee");
  });

  it("une signature enregistrée l'emporte, même sans ouverture tracée", () => {
    expect(etatDemande(demande({ signeeLe: maintenant }))).toBe("signee");
  });

  it("chaque état a son mot", () => {
    expect(libelleEtat("en_attente")).toBe("En attente");
    expect(libelleEtat("ouverte")).toBe("Lien ouvert");
    expect(libelleEtat("signee")).toBe("Signé");
  });
});

describe("avancement du circuit", () => {
  it("le dossier n'avance que lorsque tout le monde a signé", () => {
    const demandes = [demande({ id: 1, signeeLe: maintenant }), demande({ id: 2 })];
    expect(toutLeMondeASigne(demandes)).toBe(false);

    demandes[1].signeeLe = maintenant;
    expect(toutLeMondeASigne(demandes)).toBe(true);
  });

  it("aucune demande ne vaut pas « tout signé »", () => {
    // Sans ce garde-fou, un dossier sans signataire avancerait tout seul.
    expect(toutLeMondeASigne([])).toBe(false);
  });

  it("compte ce qu'il reste", () => {
    expect(resteASigner([demande({ signeeLe: maintenant }), demande(), demande()])).toBe(2);
  });
});

describe("résumé pour le client", () => {
  it("le singulier ne prend pas de s", () => {
    expect(resumeSignatures([demande({ signeeLe: maintenant }), demande()])).toBe(
      "Il reste une signature"
    );
  });

  it("le pluriel au-delà", () => {
    expect(resumeSignatures([demande(), demande()])).toBe("Il reste 2 signatures");
  });

  it("dit quand c'est fini", () => {
    expect(resumeSignatures([demande({ signeeLe: maintenant })])).toBe(
      "Tous les associés ont signé"
    );
  });

  it("dit aussi quand rien n'a été demandé", () => {
    expect(resumeSignatures([])).toBe("Aucune signature demandée");
  });
});

describe("tracé de signature", () => {
  const valide = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==";

  it("accepte un tracé produit par la zone de signature", () => {
    expect(() => verifierTrace(valide)).not.toThrow();
  });

  it("refuse un autre format d'image", () => {
    expect(() => verifierTrace("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=")).toThrowError(
      "Signature invalide"
    );
  });

  it("refuse du contenu qui n'est pas une image", () => {
    // Le tracé finit dans un document Word : on n'y injecte rien d'arbitraire.
    expect(() => verifierTrace("<script>alert(1)</script>")).toThrowError("Signature invalide");
    expect(() => verifierTrace("")).toThrowError("Signature invalide");
  });

  it("refuse un contenu qui n'est pas du base64", () => {
    expect(() => verifierTrace("data:image/png;base64,pas du base64 !")).toThrowError(
      "Signature invalide"
    );
  });

  it("refuse un tracé démesuré", () => {
    const enorme = "data:image/png;base64," + "A".repeat(600_000);
    expect(() => verifierTrace(enorme)).toThrowError("trop volumineuse");
  });
});
