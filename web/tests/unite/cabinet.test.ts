import { describe, it, expect } from "vitest";
import {
  travailDuCabinet,
  prochaineTache,
  phasesDuCabinet,
  tacheEnCours,
  resteAFaire,
  libelleSousPhase,
  DOCUMENT_FINAL,
  nomEnPhrase,
  avecArticle,
  type EtatDuCabinet,
  type TypeDeDossier,
} from "@/domain/formalite/cabinet";

/**
 * Ce qu'il reste à faire au cabinet.
 *
 * L'espace avocat était celui de la création, réemployé tel quel : cinq pastilles
 * « Transmis / Révision / Vérifié / Dépôt / KBIS » et deux livrables. Sur une
 * modification, aucun de ces mots n'est juste.
 */

const NEUF: EtatDuCabinet = {
  type: "modification",
  status: "en_attente_validation",
  sousPhase: "5a",
  piecesAVerifier: 0,
  actesProduits: false,
  actesARelire: 0,
  nomsDesActesARelire: [],
  statutsAuDossier: true,
  statutsAJour: false,
  avisAPublier: 1,
  avisPublies: false,
  finalRemis: false,
  statutsConcernes: true,
};

const etat = (modifications: Partial<EtatDuCabinet> = {}): EtatDuCabinet => ({
  ...NEUF,
  ...modifications,
});

describe("le vocabulaire suit le dossier", () => {
  it("une modification ne délivre pas de Kbis", () => {
    // Le greffe délivre un extrait à jour : la société existe déjà.
    expect(DOCUMENT_FINAL.modification).toBe("Kbis à jour");
    expect(DOCUMENT_FINAL.creation).toBe("Extrait Kbis");
    expect(DOCUMENT_FINAL["auto-entrepreneur"]).toContain("SIRENE");
  });

  it("la dernière sous-phase se nomme selon le type", () => {
    expect(libelleSousPhase("creation", "5e")).toBe("Kbis");
    expect(libelleSousPhase("modification", "5e")).toBe("Extrait");
    expect(libelleSousPhase("auto-entrepreneur", "5e")).toBe("SIRET");
  });
});

describe("les tâches d'une modification", () => {
  it("suivent l'ordre du travail réel", () => {
    expect(travailDuCabinet(etat()).map((t) => t.identifiant)).toEqual([
      "informations",
      "pieces",
      "actes",
      "statuts",
      "annonce",
      "depot",
      "final",
      "cloture",
    ]);
  });

  it("les statuts n'apparaissent que si le changement les touche", () => {
    // Un changement de dirigeant ne réécrit pas les statuts.
    const sans = travailDuCabinet(etat({ statutsConcernes: false }));
    expect(sans.map((t) => t.identifiant)).not.toContain("statuts");
  });

  it("l'annonce n'apparaît pas quand le dossier n'en demande pas", () => {
    const sans = travailDuCabinet(etat({ avisAPublier: 0 }));
    expect(sans.map((t) => t.identifiant)).not.toContain("annonce");
  });

  it("deux avis se disent au pluriel, avec leur raison", () => {
    const tache = travailDuCabinet(etat({ avisAPublier: 2 })).find(
      (t) => t.identifiant === "annonce"
    )!;
    expect(tache.titre).toContain("2 avis");
    expect(tache.explication).toContain("ressort");
  });
});

describe("ce qui attend autre chose le dit", () => {
  it("publier avant d'avoir vérifié se republierait aux frais du cabinet", () => {
    const tache = travailDuCabinet(etat()).find((t) => t.identifiant === "annonce")!;
    expect(tache.bloquee).toContain("Vérifiez d'abord");
  });

  it("une fois vérifié, l'avis se publie", () => {
    const tache = travailDuCabinet(etat({ sousPhase: "5c" })).find(
      (t) => t.identifiant === "annonce"
    )!;
    expect(tache.bloquee).toBeUndefined();
  });

  it("sans statuts au dossier, la retouche dit ce qui manque", () => {
    const tache = travailDuCabinet(etat({ statutsAuDossier: false })).find(
      (t) => t.identifiant === "statuts"
    )!;
    expect(tache.bloquee).toContain("ne sont pas au dossier");
  });

  it("l'extrait attend le dépôt", () => {
    expect(
      travailDuCabinet(etat()).find((t) => t.identifiant === "final")!.bloquee
    ).toContain("dépôt");
  });
});

describe("ce qu'on met en avant", () => {
  it("la première tâche à faire qui n'attend rien", () => {
    /*
     * Mettre en avant une tâche bloquée enverrait l'avocat sur un écran où il ne peut
     * rien faire, et le laisserait chercher pourquoi.
     */
    const taches = travailDuCabinet(etat({ piecesAVerifier: 2 }));
    expect(tacheEnCours(taches)?.identifiant).toBe("informations");

    const verifie = travailDuCabinet(etat({ sousPhase: "5c", piecesAVerifier: 2 }));
    expect(tacheEnCours(verifie)?.identifiant).toBe("pieces");
  });

  it("un dossier abouti n'a plus rien en cours", () => {
    const fini = travailDuCabinet(
      etat({
        status: "terminee",
        sousPhase: "5e",
        actesProduits: true,
        statutsAJour: true,
        avisPublies: true,
        finalRemis: true,
      })
    );
    expect(resteAFaire(fini)).toBe(0);
    expect(tacheEnCours(fini)).toBeNull();
  });
});

describe("les tâches d'une création", () => {
  it("ne parlent ni de statuts à retoucher ni d'avis publié par nous", () => {
    const taches = travailDuCabinet(
      etat({ type: "creation", statutsConcernes: false, avisAPublier: 0 })
    );
    expect(taches.map((t) => t.identifiant)).toEqual([
      "informations",
      "pieces",
      "actes",
      "depot",
      "final",
      "cloture",
    ]);
    /* Le Kbis garde sa majuscule : c'est un nom propre, non un mot commun. */
    expect(taches.find((t) => t.identifiant === "final")?.titre).toContain("extrait Kbis");
  });
});

describe("la relecture du récapitulatif", () => {
  it("la tâche reste ouverte tant que rien ne dit qu'on a relu", () => {
    // Elle n'était réputée faite qu'en sous-phase « Vérifié », tout à la fin : on
    // cliquait « Y aller », on relisait, et la case restait vide.
    const [informations] = travailDuCabinet(etat());
    expect(informations.identifiant).toBe("informations");
    expect(informations.etat).toBe("a_faire");
  });

  it("la déclaration de l'avocat la coche", () => {
    const [informations] = travailDuCabinet(etat({ informationsVerifiees: true }));
    expect(informations.etat).toBe("faite");
  });

  it("elle lève aussi ce qui attendait un dossier vérifié", () => {
    const avant = travailDuCabinet(etat()).find((t) => t.identifiant === "annonce");
    const apres = travailDuCabinet(etat({ informationsVerifiees: true })).find(
      (t) => t.identifiant === "annonce"
    );
    expect(avant?.bloquee).toBeTruthy();
    expect(apres?.bloquee).toBeUndefined();
  });
});

describe("par quoi commencer", () => {
  it("nomme la première tâche qui attend, pas la première de la liste", () => {
    const taches = travailDuCabinet(etat({ piecesAVerifier: 0 }));
    const suivante = prochaineTache(taches);
    expect(suivante?.etat).toBe("a_faire");
    expect(taches.indexOf(suivante!)).toBeGreaterThanOrEqual(0);
    // Ce qui est déjà fait ne peut pas être ce par quoi commencer.
    expect(taches.slice(0, taches.indexOf(suivante!)).every((t) => t.etat !== "a_faire")).toBe(
      true
    );
  });

  it("préfère ce qu'on peut faire tout de suite à ce qui est empêché", () => {
    const taches = [
      { identifiant: "a", titre: "A", explication: "", etat: "a_faire" as const, bloquee: "en attente" },
      { identifiant: "b", titre: "B", explication: "", etat: "a_faire" as const },
    ];
    expect(prochaineTache(taches)?.identifiant).toBe("b");
  });

  it("rend quand même la tâche empêchée quand c'est la seule qui reste", () => {
    // C'est justement ce qui la bloque qu'il faut lire.
    const taches = [
      { identifiant: "a", titre: "A", explication: "", etat: "faite" as const },
      { identifiant: "b", titre: "B", explication: "", etat: "a_faire" as const, bloquee: "en attente" },
    ];
    expect(prochaineTache(taches)?.identifiant).toBe("b");
  });

  it("ne rend rien quand tout est fait", () => {
    const taches = [{ identifiant: "a", titre: "A", explication: "", etat: "faite" as const }];
    expect(prochaineTache(taches)).toBeNull();
  });
});

describe("les quatre temps du dossier", () => {
  it("range chaque tâche dans la phase qui l'engage", () => {
    const phases = phasesDuCabinet(travailDuCabinet(etat()));
    expect(phases.map((p) => p.cle)).toEqual([
      "verification",
      "redaction",
      "publication",
      "depot",
    ]);

    const redaction = phases.find((p) => p.cle === "redaction")!;
    // La relecture est encore de l'écrit ; l'attestation de parution est du dépôt.
    expect(redaction.taches.map((t) => t.identifiant)).toContain("statuts");
    expect(phases.find((p) => p.cle === "publication")!.taches[0].identifiant).toBe("annonce");
  });

  it("la phase en cours est la première qui n'est pas finie", () => {
    const phases = phasesDuCabinet(travailDuCabinet(etat({ piecesAVerifier: 2 })));
    expect(phases[0].etat).toBe("en_cours");
    expect(phases[1].etat).toBe("a_venir");
  });

  it("une phase sans tâche n'existe pas pour ce dossier", () => {
    // Une modification qui ne publie aucun avis n'a rien à dire sous « Publier ».
    const phases = phasesDuCabinet(travailDuCabinet(etat({ avisAPublier: 0 })));
    expect(phases.map((p) => p.cle)).not.toContain("publication");
  });

  it("tout fait ne laisse aucune phase en cours", () => {
    const finies = travailDuCabinet(etat()).map((t) => ({ ...t, etat: "faite" as const }));
    expect(phasesDuCabinet(finies).every((p) => p.etat === "faite")).toBe(true);
  });
});

describe("la clôture du dossier", () => {
  /*
   * Rien ne fermait un dossier : les deux seuls états que l'interface posait étaient
   * « corrections demandées » et « en attente de validation ». Un dossier déposé,
   * document du greffe remis, restait « en attente » à vie.
   */
  it("attend que le document du greffe soit remis", () => {
    const avant = travailDuCabinet(etat({ sousPhase: "5d" })).find(
      (t) => t.identifiant === "cloture"
    );
    expect(avant?.etat).toBe("a_faire");
    expect(avant?.bloquee).toBe("Le document du greffe n'est pas encore remis.");
  });

  it("s'ouvre dès que le document est au dossier", () => {
    const apres = travailDuCabinet(etat({ sousPhase: "5d", finalRemis: true })).find(
      (t) => t.identifiant === "cloture"
    );
    expect(apres?.etat).toBe("a_faire");
    expect(apres?.bloquee).toBeUndefined();
  });

  /* Conclure sans document mène en 5e : le dossier se clôt aussi de là. */
  it("s'ouvre également quand le dossier a été conclu sans document", () => {
    const conclu = travailDuCabinet(etat({ sousPhase: "5e" })).find(
      (t) => t.identifiant === "cloture"
    );
    expect(conclu?.bloquee).toBeUndefined();
  });

  it("se coche quand le dossier est clos, et lui seul le fait", () => {
    const clos = travailDuCabinet(etat({ sousPhase: "5e", status: "terminee" })).find(
      (t) => t.identifiant === "cloture"
    );
    expect(clos?.etat).toBe("faite");
  });
});

describe("le nom du document du greffe", () => {
  /*
   * `toLowerCase()` écrasait le nom propre : la tâche disait « Remettre kbis à jour ».
   */
  it("garde sa majuscule quand c'est un nom propre", () => {
    expect(nomEnPhrase("Kbis à jour")).toBe("Kbis à jour");
    expect(nomEnPhrase("Extrait Kbis")).toBe("extrait Kbis");
    expect(nomEnPhrase("Récépissé de dépôt")).toBe("récépissé de dépôt");
  });

  it("prend l'article qui convient", () => {
    expect(avecArticle("Attestation de radiation")).toBe("l’attestation de radiation");
    expect(avecArticle("Récépissé de dépôt")).toBe("le récépissé de dépôt");
    expect(avecArticle("Kbis à jour")).toBe("le Kbis à jour");
    expect(avecArticle("Avis de situation SIRENE")).toBe("l’avis de situation SIRENE");
  });

  /* Chaque type a le sien : le greffe ne délivre pas un Kbis à qui ferme sa société. */
  it("la tâche de remise nomme celui du dossier", () => {
    const titre = (type: TypeDeDossier) =>
      travailDuCabinet(etat({ type })).find((t) => t.identifiant === "final")?.titre;

    expect(titre("creation")).toBe("Remettre extrait Kbis");
    expect(titre("comptes")).toBe("Remettre récépissé de dépôt");
    expect(titre("fermeture")).toBe("Remettre attestation de radiation");
  });
});
