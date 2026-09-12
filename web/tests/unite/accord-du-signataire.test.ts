import { describe, expect, it } from "vitest";
import { accordDuSignataire } from "@/domain/formalite/signature";
import { messageDeSignature } from "@/infrastructure/mail/envoi";

/**
 * Ce qu'on écrit à qui signe.
 *
 * Le courriel de demande et la page de signature s'adressaient à tout le monde au
 * masculin - « vous êtes appelé à signer » - parce que la demande ne transportait que le
 * nom et l'adresse. Une femme recevait donc un message accordé au nom de quelqu'un
 * d'autre, sur les statuts de sa propre société.
 *
 * L'accord se décide sur la civilité saisie, jamais sur le prénom : c'est la règle déjà
 * posée par `toutesDesFemmes`, et pour la même raison - deviner le genre d'après un
 * prénom se trompe, et se trompe surtout sur les noms les moins courants.
 */

describe("l'accord du signataire", () => {
  it("accorde au féminin sur « Madame »", () => {
    const accord = accordDuSignataire("Madame", "Claire DUFOUR");
    expect(accord.feminin).toBe(true);
    expect(accord.accorde("appelé")).toBe("appelée");
    expect(accord.nomme).toBe("Madame DUFOUR");
    expect(accord.appel).toBe("Bonjour Madame DUFOUR");
  });

  it("reste au masculin sur « Monsieur »", () => {
    const accord = accordDuSignataire("Monsieur", "Lucas LARÉGINIE");
    expect(accord.feminin).toBe(false);
    expect(accord.accorde("appelé")).toBe("appelé");
    expect(accord.nomme).toBe("Monsieur LARÉGINIE");
  });

  it("reconnaît les formes abrégées", () => {
    expect(accordDuSignataire("Mme").feminin).toBe(true);
    expect(accordDuSignataire("mademoiselle").feminin).toBe(true);
    expect(accordDuSignataire("M.").feminin).toBe(false);
  });

  it("reste au masculin quand la civilité manque", () => {
    /* Un dossier ancien, un associé saisi sans civilité : mieux vaut le masculin que
       d'accorder à tort au nom de quelqu'un. */
    const accord = accordDuSignataire(null, "Claire DUFOUR");
    expect(accord.feminin).toBe(false);
    expect(accord.civilite).toBe("");
  });

  it("ne devine pas le genre d'après le prénom", () => {
    /* La règle du projet, et la raison pour laquelle la civilité voyage avec la
       demande : « Camille », « Dominique », et tous les prénoms qu'un algorithme range
       de travers. */
    expect(accordDuSignataire("", "Camille MARTIN").feminin).toBe(false);
  });

  it("garde le nom entier faute de civilité", () => {
    /* Sans titre, on ne sait pas lequel des deux mots est le patronyme : on reprend ce
       qui a été saisi plutôt que de trancher. */
    expect(accordDuSignataire(undefined, "Claire DUFOUR").nomme).toBe("Claire DUFOUR");
  });

  it("sait n'avoir personne à nommer", () => {
    expect(accordDuSignataire(null, "").appel).toBe("Bonjour");
  });
});

describe("le courriel de demande de signature", () => {
  const message = (civilite?: string | null) =>
    messageDeSignature(
      "Claire DUFOUR",
      "claire@exemple.fr",
      "a".repeat(40),
      "LEND ONCHAIN",
      civilite
    );

  it("s'accorde avec la signataire", () => {
    const { html, texte } = message("Madame");
    expect(html).toContain("Bonjour Madame DUFOUR");
    expect(html).toContain("appelée à signer");
    expect(texte).toContain("Bonjour Madame DUFOUR");
    expect(texte).toContain("appelée à signer");
  });

  it("reste au masculin sans civilité", () => {
    const { html } = message(null);
    expect(html).toContain("Bonjour Claire DUFOUR");
    expect(html).toContain("appelé à signer");
    expect(html).not.toContain("appelée");
  });

  it("ne dit plus que le destinataire attend", () => {
    /* « sont prêts et vous attendez de les signer » : ce sont les actes qui attendent. */
    const { html, texte } = message("Monsieur");
    expect(html).not.toContain("vous attendez de les signer");
    expect(html).toContain("n'attendent que votre signature");
    expect(texte).toContain("n'attendent que votre signature");
  });

  it("porte le lien personnel et la société", () => {
    const { html, sujet } = message("Madame");
    expect(sujet).toContain("LEND ONCHAIN");
    expect(html).toContain("LEND ONCHAIN");
    expect(html).toContain("chaque signataire a reçu le sien");
  });
});
