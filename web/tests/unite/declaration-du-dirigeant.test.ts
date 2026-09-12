import { describe, expect, it } from "vitest";
import PizZip from "pizzip";
import { donneesDeGabarit } from "@/domain/formalite/gabarit";
import { genererDocument } from "@/infrastructure/documents/generation";
import type { Brouillon } from "@/domain/formalite/parcours";
import type { PersonnePhysique } from "@/domain/formalite/etat-civil";

/**
 * C'est le dirigeant qui déclare, non le premier associé.
 *
 * La déclaration de non-condamnation est souscrite sur l'honneur par celui qui va
 * diriger la société, et l'attestation de domicile par celui qui l'héberge : les deux
 * pièces partent au greffe au nom d'une personne nommée. La passe qui compose leur
 * première phrase lisait CIVILITE_NOM_PRENOM_1 - l'associé numéro un.
 *
 * Dans la plupart des dossiers, le dirigeant est le premier associé : le défaut ne se
 * voyait pas. Dès que le gérant était un autre associé - le cas d'un couple où c'est le
 * second qui dirige - la déclaration sortait au nom de quelqu'un qui n'a rien à
 * déclarer, avec son état civil, sa filiation et son domicile.
 */

const CLAIRE: PersonnePhysique = {
  civilite: "Madame",
  prenom: "Claire",
  nom: "DUFOUR",
  dateDeNaissance: "1984-03-07",
  villeDeNaissance: "Lyon 3e",
  codePostalDeNaissance: "69003",
  nationalite: "française",
  adresse: "12 rue des Capucins",
  codePostal: "69001",
  ville: "Lyon",
  nomDuPere: "MERCIER",
  nomDeLaMere: "BONNET",
};

const LUCAS: PersonnePhysique = {
  civilite: "Monsieur",
  prenom: "Lucas",
  nom: "LARÉGINIE",
  dateDeNaissance: "1990-11-23",
  villeDeNaissance: "Tournon-sur-Rhône",
  codePostalDeNaissance: "07300",
  nationalite: "française",
  adresse: "5 avenue Jean Jaurès",
  codePostal: "69007",
  ville: "Lyon",
  nomDuPere: "LARÉGINIE",
  nomDeLaMere: "ROUX",
};

function dossier(forme: string, rangDuDirigeant: number): Brouillon {
  return {
    forme,
    denomination: "MERIDIEN BOIS",
    adresse: "12 rue des Capucins",
    codePostal: "69001",
    ville: "Lyon",
    modeDomiciliation: "Domicile personnel du dirigeant",
    occupationDomicile: "locataire",
    capital: 10_000,
    partsTotales: 1000,
    associes: [
      { type: "physique", personne: CLAIRE, apport: 6000, versement: 6000, parts: 600 },
      { type: "physique", personne: LUCAS, apport: 4000, versement: 4000, parts: 400 },
    ],
    dirigeants: [{ associe: rangDuDirigeant }],
  };
}

function texteDu(docx: Buffer): string {
  const xml = new PizZip(docx).file("word/document.xml")!.asText();
  return xml.replace(/<[^>]+>/g, "");
}

function declaration(forme: string, rang: number): string {
  const prefixe = forme.toLowerCase();
  return texteDu(
    genererDocument(prefixe + "-declaration-non-condamnation.docx", donneesDeGabarit(dossier(forme, rang)))
  );
}

describe("la déclaration de non-condamnation", () => {
  it("nomme le dirigeant quand il est le premier associé", () => {
    const texte = declaration("SARL", 0);
    expect(texte).toContain("Madame Claire DUFOUR");
    expect(texte).toContain("Je soussignée");
  });

  it("nomme le dirigeant quand il est le second associé", () => {
    /* Le cas qui révélait le défaut : la déclaration sortait au nom de Claire, avec sa
       filiation, alors que c'est Lucas qui est nommé gérant par le procès-verbal. */
    const texte = declaration("SARL", 1);
    expect(texte).toContain("Monsieur Lucas LARÉGINIE");
    expect(texte).not.toContain("Claire DUFOUR");
  });

  it("porte l'état civil et la filiation de ce dirigeant, non ceux d'un autre", () => {
    const texte = declaration("SARL", 1);
    expect(texte).toContain("23 novembre 1990");
    expect(texte).toContain("LARÉGINIE");
    expect(texte).toContain("ROUX");
    expect(texte).not.toContain("MERCIER");
    expect(texte).not.toContain("BONNET");
  });

  it("accorde le genre sur le dirigeant nommé", () => {
    expect(declaration("SARL", 1)).toContain("Je soussigné,");
    expect(declaration("SARL", 0)).toContain("Je soussignée,");
  });

  it("vaut pour les quatre formes", () => {
    for (const forme of ["SAS", "SASU", "SARL", "SCI"]) {
      const texte = declaration(forme, 1);
      expect(texte, forme).toContain("Monsieur Lucas LARÉGINIE");
      expect(texte, forme).not.toContain("Claire DUFOUR");
    }
  });
});

describe("l'attestation de mise à disposition du domicile", () => {
  it("est établie par celui qui héberge, c'est-à-dire le dirigeant", () => {
    const texte = texteDu(
      genererDocument("sas-attestation-domicile.docx", donneesDeGabarit(dossier("SAS", 1)))
    );
    expect(texte).toContain("Monsieur Lucas LARÉGINIE");
    expect(texte).not.toContain("Claire DUFOUR");
  });
});
