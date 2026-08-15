import { describe, it, expect } from "vitest";
import {
  etapesDuSuivi,
  etapeEnCours,
  attenteDuClient,
  avancementDuSuivi,
  attestationRequise,
  type EtatDuDossier,
} from "@/domain/formalite/suivi";

const NEUF: EtatDuDossier = {
  forme: "SASU",
  status: "en_cours",
  sousPhase: null,
  aLAttestationDeCapital: false,
  aLAnnoncePubliee: false,
  aLeKbis: false,
};

const etat = (modifications: Partial<EtatDuDossier> = {}): EtatDuDossier => ({
  ...NEUF,
  ...modifications,
});

describe("les étapes du suivi", () => {
  it("suivent l'ordre de la vraie vie", () => {
    /*
     * La banque délivre l'attestation, on signe les statuts à cette date, l'annonce
     * se publie ensuite, le greffe est saisi, le Kbis arrive.
     */
    expect(etapesDuSuivi(etat()).map((e) => e.identifiant)).toEqual([
      "transmis",
      "attestation",
      "verification",
      "annonce",
      "greffe",
      "kbis",
    ]);
  });

  it("une société civile ne se voit pas réclamer d'attestation de dépôt", () => {
    // Sa banque ne la délivrera jamais : l'exiger bloquerait le dossier pour rien.
    expect(attestationRequise("SCI")).toBe(false);
    expect(attestationRequise("SASU")).toBe(true);

    const identifiants = etapesDuSuivi(etat({ forme: "SCI" })).map((e) => e.identifiant);
    expect(identifiants).not.toContain("attestation");
  });

  it("chaque étape dit à qui est la main", () => {
    const par = new Map(etapesDuSuivi(etat()).map((e) => [e.identifiant, e.main]));
    expect(par.get("attestation")).toBe("vous");
    expect(par.get("annonce")).toBe("vous");
    expect(par.get("verification")).toBe("avocat");
    expect(par.get("greffe")).toBe("avocat");
  });

  it("une seule étape est en cours à la fois", () => {
    for (const cas of [
      etat(),
      etat({ status: "en_attente_validation", sousPhase: "5a" }),
      etat({ status: "valide", sousPhase: "5c", aLAttestationDeCapital: true }),
      etat({ status: "terminee", sousPhase: "5e", aLeKbis: true }),
    ]) {
      expect(etapesDuSuivi(cas).filter((e) => e.etat === "en_cours").length).toBeLessThanOrEqual(1);
    }
  });

  it("l'étape en cours est la première qui n'est pas faite", () => {
    expect(etapeEnCours(etat())?.identifiant).toBe("transmis");
    expect(etapeEnCours(etat({ status: "en_attente_validation" }))?.identifiant).toBe("attestation");
    expect(
      etapeEnCours(etat({ status: "en_attente_validation", aLAttestationDeCapital: true }))
        ?.identifiant
    ).toBe("verification");
  });

  it("une étape remplie par avance ne fait pas sauter la file", () => {
    /*
     * Un Kbis déposé avant le dépôt au greffe ne signale pas un dossier plus avancé :
     * il signale une erreur de saisie, qu'il vaut mieux voir.
     */
    const etapes = etapesDuSuivi(
      etat({ status: "en_attente_validation", aLeKbis: true })
    );
    expect(etapes.find((e) => e.identifiant === "kbis")?.etat).toBe("a_venir");
    expect(etapes.find((e) => e.etat === "en_cours")?.identifiant).toBe("attestation");
  });

  it("les sous-phases se comparent, elles ne s'égalent pas", () => {
    // « 5d » vaut vérification faite : le dépôt suppose la vérification.
    const etapes = etapesDuSuivi(
      etat({ status: "valide", sousPhase: "5d", aLAttestationDeCapital: true, aLAnnoncePubliee: true })
    );
    expect(etapes.find((e) => e.identifiant === "verification")?.etat).toBe("faite");
    expect(etapes.find((e) => e.identifiant === "greffe")?.etat).toBe("faite");
    expect(etapes.find((e) => e.etat === "en_cours")?.identifiant).toBe("kbis");
  });

  it("une sous-phase inconnue ne fait rien passer pour fait", () => {
    const etapes = etapesDuSuivi(etat({ status: "en_attente_validation", sousPhase: "9z" }));
    expect(etapes.find((e) => e.identifiant === "verification")?.etat).not.toBe("faite");
  });
});

describe("ce qu'on demande au client", () => {
  it("rien tant que la main est à l'avocat", () => {
    /*
     * Annoncer une action qui n'en est pas une use l'attention pour les fois où elle
     * compte.
     */
    expect(attenteDuClient(etat())).toBeNull();
    expect(attenteDuClient(etat({ status: "valide", sousPhase: "5d", aLAttestationDeCapital: true, aLAnnoncePubliee: true }))).toBeNull();
  });

  it("le geste attendu, quand il est de son côté", () => {
    const attente = attenteDuClient(etat({ status: "en_attente_validation" }));
    expect(attente?.identifiant).toBe("attestation");
    expect(attente?.action).toBe("Déposer l'attestation");
  });

  it("l'annonce est réclamée une fois le dossier vérifié", () => {
    const attente = attenteDuClient(
      etat({ status: "valide", sousPhase: "5c", aLAttestationDeCapital: true })
    );
    expect(attente?.identifiant).toBe("annonce");
    expect(attente?.action).toContain("parution");
  });
});

describe("l'avancement", () => {
  it("part de zéro et finit à cent", () => {
    expect(avancementDuSuivi(etat())).toBe(0);
    expect(
      avancementDuSuivi(
        etat({
          status: "terminee",
          sousPhase: "5e",
          aLAttestationDeCapital: true,
          aLAnnoncePubliee: true,
          aLeKbis: true,
        })
      )
    ).toBe(100);
  });

  it("progresse à chaque étape franchie", () => {
    const debut = avancementDuSuivi(etat({ status: "en_attente_validation" }));
    const suite = avancementDuSuivi(
      etat({ status: "en_attente_validation", aLAttestationDeCapital: true })
    );
    expect(suite).toBeGreaterThan(debut);
  });
});

describe("le parcours d'une auto-entreprise", () => {
  const auto = (modifications: Partial<EtatDuDossier> = {}): EtatDuDossier => ({
    type: "auto-entrepreneur",
    forme: "AE",
    status: "en_cours",
    sousPhase: null,
    aLAttestationDeCapital: false,
    aLAnnoncePubliee: false,
    aLeKbis: false,
    paye: false,
    ...modifications,
  });

  it("n'a ni capital, ni annonce, ni Kbis", () => {
    /*
     * Une auto-entreprise ne dépose pas de capital, ne publie pas d'annonce et ne
     * reçoit pas de Kbis : lui montrer ces étapes lui promettrait un chemin qui n'est
     * pas le sien.
     */
    expect(etapesDuSuivi(auto()).map((e) => e.identifiant)).toEqual([
      "confie",
      "verification",
      "guichet",
      "siret",
    ]);
  });

  it("elle se met en route au règlement", () => {
    // Une société part sur une transmission ; une auto-entreprise, sur son paiement.
    expect(etapeEnCours(auto())?.identifiant).toBe("confie");
    expect(etapeEnCours(auto({ paye: true }))?.identifiant).toBe("verification");
  });

  it("tout est du côté de l'avocat : c'est ce qui est vendu", () => {
    const etapes = etapesDuSuivi(auto({ paye: true }));
    expect(etapes.every((e) => e.main === "avocat")).toBe(true);
    expect(attenteDuClient(auto({ paye: true }))).toBeNull();
  });

  it("des corrections demandées rendent la main au client", () => {
    // L'étape cesse d'être une attente pour devenir un geste.
    const etat = auto({ paye: true, status: "corrections_demandees" });
    const attente = attenteDuClient(etat);

    expect(attente?.identifiant).toBe("verification");
    expect(attente?.action).toBe("Voir ce qui est demandé");
  });

  it("le geste ne s'affiche que là où il y en a un", () => {
    // « Voir ce qui est demandé » sur une étape que l'avocat traite n'appelle rien.
    const verification = etapesDuSuivi(auto({ paye: true })).find(
      (e) => e.identifiant === "verification"
    );
    expect(verification?.action).toBeUndefined();
  });

  it("elle s'achève sur le SIRET", () => {
    const finie = auto({ paye: true, status: "terminee", sousPhase: "5e" });
    expect(etapeEnCours(finie)).toBeNull();
    expect(avancementDuSuivi(finie)).toBe(100);
  });

  it("sans type, on garde le parcours d'une société", () => {
    // C'est le parcours d'origine : un dossier ancien ne doit pas changer de récit.
    expect(etapesDuSuivi({ ...auto(), type: null }).map((e) => e.identifiant)).toContain("kbis");
  });
});
