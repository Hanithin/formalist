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

  it("ne franchit rien sur un brouillon dont les actes ont été produits", () => {
    /*
     * Un acte produit avant la transmission naît « generated », non « à relire » : il
     * n'y a donc rien à relire sur un brouillon, ce qui ne veut pas dire qu'un avocat
     * l'a vu. Sans cette garde, tout dossier ayant produit ses actes déclarait sa
     * vérification faite.
     */
    const brouillon: EtatDuDossier = {
      ...TRANSMIS,
      status: "en_cours",
      sousPhase: null,
      actesEnRelecture: false,
      actesRendus: true,
    };
    expect(etape(brouillon, "verification")?.etat).toBe("a_venir");
    expect(etape(brouillon, "transmis")?.etat).toBe("en_cours");
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

describe("ce qu'une étape franchie dit de celles qui la précèdent", () => {
  const RENDU: EtatDuDossier = {
    ...TRANSMIS,
    sousPhase: "5c",
    actesEnRelecture: false,
    actesRendus: true,
  };

  it("ne coche pas l'attestation de capital parce que l'annonce a paru", () => {
    /*
     * Le cabinet publie l'avis quand il veut : cela ne dit rien du compte en banque du
     * client. L'étape qui lui revient doit rester la sienne, sans quoi le seul endroit
     * d'où déposer l'attestation disparaît de l'écran.
     */
    const etat = { ...RENDU, aLAnnoncePubliee: true, aLAttestationDeCapital: false };

    expect(etape(etat, "attestation")?.etat).toBe("en_cours");
    expect(etape(etat, "attestation")?.main).toBe("vous");
    expect(etape(etat, "annonce")?.etat).toBe("faite");
  });

  it("coche tout ce qui précède un Kbis délivré", () => {
    /* On n'immatricule pas une société dont le capital n'a pas été versé : si le Kbis
       est là, l'attestation a existé, quoi qu'en disent les documents du dossier. */
    /* Le Kbis ne compte qu'une fois le dépôt fait : déposé avant, il signale une
       erreur de saisie plutôt qu'un dossier plus avancé. */
    const etat = { ...RENDU, sousPhase: "5e", aLeKbis: true, aLAttestationDeCapital: false };

    expect(etape(etat, "attestation")?.etat).toBe("faite");
    expect(etape(etat, "annonce")?.etat).toBe("faite");
    expect(etape(etat, "kbis")?.etat).toBe("faite");
  });

  it("coche tout ce qui précède un dépôt au greffe", () => {
    const etat = { ...RENDU, sousPhase: "5d", aLAttestationDeCapital: false };

    expect(etape(etat, "greffe")?.etat).toBe("faite");
    expect(etape(etat, "attestation")?.etat).toBe("faite");
  });
});
