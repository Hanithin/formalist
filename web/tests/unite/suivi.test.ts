import { describe, it, expect } from "vitest";
import {
  etapesDuSuivi,
  etapeEnCours,
  etapeAMettreEnAvant,
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

describe("l'attestation attend que l'avocat ait rendu les actes", () => {
  /*
   * On ne l'obtient pas de nulle part : la banque ouvre le compte de dépôt sur
   * présentation des statuts, et les statuts sont ce que l'avocat relit. Le suivi la
   * réclamait dès le règlement, avec un bouton qui menait à un dépôt impossible, sur
   * un écran où les actes portaient « En relecture ».
   */
  const enAttente = etat({ status: "en_attente_validation", actesEnRelecture: true });

  it("rend la main à l'avocat tant que les actes sont en relecture", () => {
    const attestation = etapesDuSuivi(enAttente).find((e) => e.identifiant === "attestation")!;

    expect(attestation.main).toBe("avocat");
    // Le geste ne s'affiche que là où il y en a un à faire.
    expect(attestation.action).toBeUndefined();
    expect(attestation.explication).toMatch(/relit/);
  });

  it("la rend au client dès que les actes sont validés", () => {
    const rendus = etat({ status: "en_attente_validation", actesEnRelecture: false });
    const attestation = etapesDuSuivi(rendus).find((e) => e.identifiant === "attestation")!;

    expect(attestation.main).toBe("vous");
    expect(attestation.action).toBe("Déposer l'attestation");
    expect(attestation.explication).toMatch(/Remettez vos actes à votre banque/);
  });

  it("ne suppose pas une relecture quand rien ne l'a dit", () => {
    // Les dossiers d'avant le règlement automatique n'ont pas d'actes en relecture.
    const attestation = etapesDuSuivi(etat()).find((e) => e.identifiant === "attestation")!;

    expect(attestation.main).toBe("vous");
  });
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
    expect(par.get("verification")).toBe("avocat");
    expect(par.get("greffe")).toBe("avocat");
    /*
     * L'annonce n'est plus au client.
     *
     * Elle lui demandait de porter l'avis au journal puis d'en déposer l'attestation.
     * C'est le cabinet qui rédige, publie et joint la parution : le client a payé pour
     * ne pas s'en occuper, comme sur une modification.
     */
    expect(par.get("annonce")).toBe("avocat");
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

  it("ne réclame plus rien une fois l'attestation déposée", () => {
    /*
     * L'annonce était réclamée ici. Elle ne l'est plus : le cabinet publie et déclare,
     * le client n'a pas d'attestation de parution à fournir.
     */
    const attente = attenteDuClient(
      etat({ status: "valide", sousPhase: "5c", aLAttestationDeCapital: true })
    );
    expect(attente).toBeNull();
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

describe("un dossier renvoyé par l'avocat", () => {
  const renvoye = etat({ status: "corrections_demandees", sousPhase: "5a" });

  it("rend la main au client, y compris sur une création", () => {
    /*
     * La main restait à l'avocat en toutes circonstances sur le parcours de création :
     * le client lisait « L'avocat s'en occupe » et attendait, alors que rien
     * n'avancerait tant qu'il n'aurait pas repris ce qu'on lui demandait.
     */
    const verification = etapesDuSuivi(renvoye).find((e) => e.identifiant === "verification")!;
    expect(verification.main).toBe("vous");
    expect(verification.action).toBe("Voir ce qui est demandé");
  });

  it("la vérification n'est pas tenue pour faite", () => {
    const verification = etapesDuSuivi(renvoye).find((e) => e.identifiant === "verification")!;
    expect(verification.etat).not.toBe("faite");
  });

  it("passe devant ce qui restait à fournir", () => {
    /*
     * Une création sans attestation de capital mettait en avant « Attestation de dépôt
     * de capital » alors que l'avocat venait de renvoyer le dossier : la demande à
     * laquelle il fallait répondre n'apparaissait nulle part.
     */
    expect(etapeEnCours(renvoye)?.identifiant).toBe("attestation");
    expect(etapeAMettreEnAvant(renvoye)?.identifiant).toBe("verification");
  });

  it("le rail garde sa vérité : l'attestation reste à fournir", () => {
    const attestation = etapesDuSuivi(renvoye).find((e) => e.identifiant === "attestation")!;
    expect(attestation.etat).toBe("en_cours");
  });

  it("hors renvoi, c'est l'étape en cours qu'on met en avant", () => {
    const ordinaire = etat({ status: "en_attente_validation", sousPhase: "5a" });
    expect(etapeAMettreEnAvant(ordinaire)?.identifiant).toBe(etapeEnCours(ordinaire)?.identifiant);
  });
});

describe("où mène le geste attendu", () => {
  it("le renvoi mène au fil, le dépôt d'une pièce au dossier", () => {
    /*
     * Un lien unique pour toutes les étapes envoyait « Déposer l'attestation » vers
     * une conversation, où il n'y a rien à déposer.
     */
    const renvoye = etat({ status: "corrections_demandees", sousPhase: "5a" });
    expect(etapeAMettreEnAvant(renvoye)?.ou).toBe("messagerie");

    const attend = etat({ status: "en_attente_validation", sousPhase: "5a" });
    const attestation = etapesDuSuivi(attend).find((e) => e.identifiant === "attestation")!;
    expect(attestation.action).toBe("Déposer l'attestation");
    expect(attestation.ou).toBe("dossier");
  });

  it("aucune étape n'oublie de dire où elle mène", () => {
    for (const type of [null, "modification", "auto-entrepreneur"]) {
      for (const e of etapesDuSuivi(etat({ type, status: "en_attente_validation" }))) {
        expect(e.ou, e.identifiant).toMatch(/^(dossier|messagerie)$/);
      }
    }
  });
});
