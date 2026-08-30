import { describe, it, expect } from "vitest";
import PizZip from "pizzip";
import { genererDocument } from "@/infrastructure/documents/generation";
import { donneesDeGabarit } from "@/domain/formalite/gabarit";

/**
 * L'attestation de mise à disposition du domicile.
 *
 * Elle portait une contradiction que rien ne signalait : le texte bornait la
 * domiciliation à cinq ans, puis certifiait deux lignes plus bas qu'aucune stipulation
 * ne s'y opposait. L'article L. 123-11-1 du code de commerce dit l'inverse - la
 * domiciliation au domicile du représentant légal est sans terme quand rien ne
 * l'interdit, et bornée à cinq ans dans le seul cas contraire.
 *
 * Le statut d'occupation souffrait du même mal : « propriétaire » pour tout le monde,
 * locataires compris.
 */

function texteDu(docx: Buffer): string {
  return new PizZip(docx)
    .file("word/document.xml")!
    .asText()
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

const BASE = {
  forme: "SAS",
  denomination: "ATELIER LAUGIER",
  adresse: "12 rue Vauban",
  codePostal: "69006",
  ville: "Lyon",
  capital: 1000,
  modeDomiciliation: "Domicile personnel du dirigeant" as const,
};

function produire(brouillon: Record<string, unknown>): string {
  return texteDu(
    genererDocument(
      "sas-attestation-domicile.docx",
      donneesDeGabarit({ ...BASE, ...brouillon } as never)
    )
  );
}

describe("la durée de la mise à disposition", () => {
  it("n'a pas de terme quand rien ne s'y oppose", () => {
    const texte = produire({ occupationDomicile: "propriétaire" });

    expect(texte).toContain("Mise à disposition de locaux sans limitation de durée");
    expect(texte).toContain("aucune disposition législative ni stipulation contractuelle");
    expect(texte).toContain("n'est assortie d'aucun terme");
    // La borne des cinq ans ne vaut que pour l'autre cas : l'écrire ici se contredirait.
    expect(texte).not.toContain("cinq ans");
    expect(texte).not.toContain("L. 123-11-1");
  });

  it("est bornée à cinq ans quand un bail ou une copropriété l'interdit", () => {
    const texte = produire({
      occupationDomicile: "locataire",
      domiciliationRestreinte: true,
    });

    expect(texte).toContain("Mise à disposition de locaux à durée limitée");
    expect(texte).toContain("ne pouvant ni excéder cinq ans");
    expect(texte).toContain("L. 123-11-1 du code de commerce");
    expect(texte).toContain("notifier cette domiciliation");
    /* Et la certification inverse disparaît : elle serait fausse. */
    expect(texte).not.toContain("aucune disposition législative ni stipulation");
  });

  it("dit à quel titre le dirigeant occupe son logement", () => {
    expect(produire({ occupationDomicile: "locataire" })).toContain("dont il est locataire");
    expect(produire({ occupationDomicile: "hébergé" })).toContain("dont il est hébergé");
    // Sans réponse, on garde l'ancien défaut plutôt que d'écrire un blanc dans l'acte.
    expect(produire({})).toContain("dont il est propriétaire");
  });
});

describe("ce que l'attestation porte du dossier", () => {
  it("nomme la société, son capital et son siège", () => {
    const texte = produire({ occupationDomicile: "propriétaire" });

    expect(texte).toContain("ATELIER LAUGIER");
    expect(texte).toContain("Société par actions simplifiée au capital de 1 000 euros");
    expect(texte).toContain("12 rue Vauban");
    /*
     * La formule de clôture est la même sur tous les actes d'une création.
     *
     * Ils en portaient trois - « Le 30 août 2026. », « A Lyon, le 30/08/2026 », « Fait à
     * Lyon, le 30/08/2026 » - et deux formats de date. C'est celle des statuts qui a été
     * retenue partout.
     */
    expect(texte).toContain("à Lyon.");
    expect(texte).toMatch(/Fait le \d+ \S+ \d{4} à Lyon\./);
  });

  it("vise l'article qui fonde la domiciliation au domicile", () => {
    expect(produire({})).toContain("article L. 123-11 du code de commerce");
    expect(produire({})).toContain("ne nécessitant pas le passage de clientèle");
  });
});
