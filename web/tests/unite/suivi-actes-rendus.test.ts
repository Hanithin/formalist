import { describe, it, expect } from "vitest";
import { etapesDuSuivi, type EtatDuDossier } from "@/domain/formalite/suivi";

/** Un dossier de création transmis, dont le cabinet n'a pas encore bougé la sous-phase. */
const TRANSMIS: EtatDuDossier = {
  type: null,
  forme: "SASU",
  status: "transmis",
  sousPhase: "5b",
  aLAttestationDeCapital: false,
  aLAnnoncePubliee: false,
  aLeKbis: false,
  avocatAssigne: true,
};

const etape = (etat: EtatDuDossier, identifiant: string) =>
  etapesDuSuivi(etat).find((e) => e.identifiant === identifiant);

describe("le suivi d'une création, quand l'avocat a rendu les actes", () => {
  it("laisse la vérification en cours tant qu'un acte attend l'avocat", () => {
    const etat = { ...TRANSMIS, actesEnRelecture: true, actesRendus: false };
    expect(etape(etat, "verification")?.etat).toBe("en_cours");
    expect(etape(etat, "attestation")?.etat).toBe("a_venir");
  });

  it("franchit la vérification dès que tous les actes sont relus", () => {
    const etat = { ...TRANSMIS, actesEnRelecture: false, actesRendus: true };
    expect(etape(etat, "verification")?.etat).toBe("faite");
  });

  it("passe alors la main au client pour l'attestation de capital", () => {
    const etat = { ...TRANSMIS, actesEnRelecture: false, actesRendus: true };
    const attestation = etape(etat, "attestation");

    expect(attestation?.etat).toBe("en_cours");
    expect(attestation?.main).toBe("vous");
    expect(attestation?.action).toBe("Déposer l'attestation");
  });

  it("ne franchit rien quand l'avocat a demandé des corrections", () => {
    const etat = {
      ...TRANSMIS,
      status: "corrections_demandees",
      actesEnRelecture: false,
      actesRendus: true,
    };
    expect(etape(etat, "verification")?.etat).toBe("en_cours");
    expect(etape(etat, "verification")?.main).toBe("vous");
  });

  it("ne franchit rien sur un dossier qui n'a encore produit aucun acte", () => {
    /* Aucun acte à relire n'est pas la même chose que tous les actes relus. */
    const etat = { ...TRANSMIS, actesEnRelecture: false, actesRendus: false };
    expect(etape(etat, "verification")?.etat).toBe("en_cours");
  });

  it("rend l'attestation franchie une fois la pièce au dossier", () => {
    const etat = {
      ...TRANSMIS,
      actesEnRelecture: false,
      actesRendus: true,
      aLAttestationDeCapital: true,
    };
    expect(etape(etat, "attestation")?.etat).toBe("faite");
    expect(etape(etat, "annonce")?.etat).toBe("en_cours");
  });
});
