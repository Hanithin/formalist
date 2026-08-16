import { describe, it, expect } from "vitest";
import {
  travailDuCabinet,
  tacheEnCours,
  resteAFaire,
  libelleSousPhase,
  DOCUMENT_FINAL,
  type EtatDuCabinet,
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
    expect(DOCUMENT_FINAL.modification).toBe("Extrait à jour");
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
    ]);
    expect(taches[taches.length - 1].titre).toContain("extrait kbis");
  });
});
