import { describe, it, expect } from "vitest";
import {
  cheminDeLAvis,
  correctionsDemandees,
  dossierRejete,
  dossierValide,
  documentRefuse,
  immatriculee,
  attestationAttendue,
  annonceAPublier,
  dossierAPrendre,
} from "@/domain/formalite/avis";

/**
 * Où mène le bouton du courriel.
 *
 * Tous menaient au tableau de bord, quel que soit leur libellé : on cliquait
 * « Consulter le motif » et l'on arrivait sur l'accueil, à charge de retrouver son
 * dossier parmi les autres. Un bouton qui ne tient pas ce qu'il annonce vaut moins
 * qu'un lien nu - on le croit, et l'on perd le fil.
 */

describe("où mène le bouton du courriel", () => {
  const creation = { id: 12, type: "creation" };
  const modification = { id: 13, type: "modification" };

  it("mène au fil quand le motif y est écrit", () => {
    expect(cheminDeLAvis(correctionsDemandees("ACME"), creation)).toBe("/messagerie?dossier=12");
    expect(cheminDeLAvis(dossierRejete("ACME"), creation)).toBe("/messagerie?dossier=12");
  });

  it("mène aux documents quand c'est un document qu'on attend", () => {
    expect(cheminDeLAvis(documentRefuse("Pièce", "ACME", "flou"), creation)).toBe("/documents");
    expect(cheminDeLAvis(immatriculee("ACME", false), creation)).toBe("/documents");
  });

  it("mène au dossier, à l'adresse que son type commande", () => {
    // Une modification ne se remplit pas à l'adresse d'une création.
    expect(cheminDeLAvis(attestationAttendue("ACME"), creation)).toBe("/creation?dossier=12");
    expect(cheminDeLAvis(annonceAPublier("ACME"), modification)).toBe("/modification?dossier=13");
  });

  it("mène au dossier de l'avocat quand l'avis lui est destiné", () => {
    expect(cheminDeLAvis(dossierAPrendre("ACME", "SASU"), creation)).toBe("/avocat/12");
  });

  it("retombe sur le tableau de bord quand on ne sait pas de quoi il s'agit", () => {
    // Un avis sans dossier, ou sans destination : le repli reste honnête.
    expect(cheminDeLAvis(correctionsDemandees("ACME"), null)).toBe("/tableau-de-bord");
    expect(cheminDeLAvis(dossierValide("ACME"), creation)).toBe("/tableau-de-bord");
  });

  it("chaque courriel qui porte un bouton sait où il conduit", () => {
    /*
     * Le garde-fou : un avis qu'on ajoute demain avec un bouton mais sans destination
     * retomberait silencieusement sur l'accueil, et l'on aurait refait le défaut.
     */
    const avecBouton = [
      documentRefuse("Pièce", "ACME", "flou"),
      correctionsDemandees("ACME"),
      dossierRejete("ACME"),
      annonceAPublier("ACME"),
      attestationAttendue("ACME"),
      immatriculee("ACME", true),
      dossierAPrendre("ACME", "SASU"),
    ];

    for (const avis of avecBouton) {
      expect(avis.bouton, avis.genre).toBeTruthy();
      expect(avis.destination, avis.genre).toBeTruthy();
      expect(cheminDeLAvis(avis, creation), avis.genre).not.toBe("/tableau-de-bord");
    }
  });
});
