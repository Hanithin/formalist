import { describe, it, expect } from "vitest";
import {
  cheminDeLAvis,
  correctionsDemandees,
  dossierRejete,
  dossierValide,
  documentRefuse,
  dossierTermine,
  attestationAttendue,
  dossierVerifie,
  dossierAPrendre,
  documentFinalRemis,
  messageRecu,
  dossierRetransmis,
  partParCourriel,
  redireParCourriel,
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
    expect(cheminDeLAvis(dossierTermine("ACME", "creation", "Extrait Kbis", false), creation)).toBe("/documents");
  });

  it("mène au dossier, à l'adresse que son type commande", () => {
    // Une modification ne se remplit pas à l'adresse d'une création.
    expect(cheminDeLAvis(attestationAttendue("ACME"), creation)).toBe("/creation?dossier=12");
    expect(cheminDeLAvis(dossierVerifie("ACME"), modification)).toBe("/modification?dossier=13");
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
      attestationAttendue("ACME"),
      dossierTermine("ACME", "creation", "Extrait Kbis", true),
      dossierAPrendre("ACME", "SASU"),
      documentFinalRemis("ACME", "Récépissé de dépôt"),
      messageRecu("Maître Dubois", "ACME", "Il me manque votre pièce d'identité."),
      dossierRetransmis("ACME", "Claire Marchand"),
    ];

    for (const avis of avecBouton) {
      expect(avis.bouton, avis.genre).toBeTruthy();
      expect(avis.destination, avis.genre).toBeTruthy();
      expect(cheminDeLAvis(avis, creation), avis.genre).not.toBe("/tableau-de-bord");
    }
  });
});

describe("les avis nés de l'audit de la révision", () => {
  /*
   * Trois gestes du parcours n'apprenaient rien à personne : la remise du document du
   * greffe, le message écrit dans le fil, et la retransmission d'un dossier corrigé.
   */
  it("dérangent la boîte aux lettres, parce qu'ils appellent un geste", () => {
    for (const avis of [
      documentFinalRemis("ACME", "Extrait Kbis"),
      messageRecu("Claire", "ACME", "Bonjour"),
      dossierRetransmis("ACME", "Claire"),
    ]) {
      expect(partParCourriel(avis.genre), avis.genre).toBe(true);
      expect(avis.sujet, avis.genre).toBeTruthy();
      expect(avis.corps, avis.genre).toBeTruthy();
    }
  });

  /*
   * Le premier message dérange, les suivants attendent.
   *
   * Un fil qui n'a pas encore été lu porte déjà l'avis : redire par courriel ferait
   * trois messages pour une conversation, et l'on n'ouvrirait plus celui qui compte.
   */
  it("le courriel ne redit pas ce qui attend déjà d'être lu", () => {
    expect(redireParCourriel(0)).toBe(true);
    expect(redireParCourriel(1)).toBe(false);
    expect(redireParCourriel(9)).toBe(false);
  });

  /* Un message long est cité, non recopié : l'objet du courriel n'est pas le fil. */
  it("le message cité s'arrête, et le dit", () => {
    const long = "a".repeat(300);
    const avis = messageRecu("Claire", "ACME", long);

    expect(avis.corps!.length).toBeLessThan(220);
    expect(avis.corps).toContain("…");
    expect(messageRecu("Claire", "ACME", "Trois mots").corps).toContain("Trois mots");
  });

  /* La remise n'est pas la clôture : deux moments, deux mots. */
  it("la remise du document et la clôture ne se confondent pas", () => {
    expect(documentFinalRemis("ACME", "Extrait Kbis").genre).toBe("document_final_remis");
    expect(dossierTermine("ACME", "creation", "Extrait Kbis", false).genre).toBe(
      "dossier_termine"
    );
  });

  /*
   * « Votre société est immatriculée » sur une fermeture était faux, et le courriel
   * promettait un Kbis à qui recevait une attestation de radiation.
   */
  it("la fin se dit dans les mots du dossier", () => {
    expect(dossierTermine("ACME", "creation", "Extrait Kbis", false).contenu).toBe(
      "ACME est immatriculée"
    );
    expect(
      dossierTermine("ACME", "fermeture", "Attestation de radiation", false).contenu
    ).toBe("La fermeture de ACME est enregistrée");
    expect(dossierTermine("ACME", "comptes", "Récépissé de dépôt", false).corps).toContain(
      "Récépissé de dépôt est dans vos documents"
    );
    expect(
      dossierTermine("ACME", "auto-entrepreneur", "Avis de situation SIRENE", false).contenu
    ).toBe("Votre auto-entreprise est déclarée");
  });
});
