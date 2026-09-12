import { describe, expect, it } from "vitest";
import PizZip from "pizzip";
import { donneesDeGabarit } from "@/domain/formalite/gabarit";
import { donneesDeLaCessation } from "@/domain/cessation/gabarit";
import { genererDocument } from "@/infrastructure/documents/generation";
import { typographierLeDocument } from "@/infrastructure/documents/typographie-docx";
import type { Brouillon } from "@/domain/formalite/parcours";
import type { PersonnePhysique } from "@/domain/formalite/etat-civil";

/**
 * Le mandataire n'est pas une signataire.
 *
 * Quand toutes celles qui signent un acte sont des femmes, une passe de génération
 * accorde ce que les gabarits Word écrivent au masculin - « né le », « le soussigné »,
 * « l'associé unique ». Elle portait sur le document entier.
 *
 * Or le pouvoir nomme aussi celui à qui il est donné, et sa phrase porte le même « né
 * le » : le pouvoir d'une société fondée par une femme sortait « Monsieur Hani MADFAI,
 * née le 12 avril 1985 ». Une faute sur le nom du mandataire, dans la pièce même qui
 * l'habilite à déposer au guichet.
 */

const CLAIRE: PersonnePhysique = {
  civilite: "Madame",
  prenom: "Claire",
  nom: "DUFOUR",
  dateDeNaissance: "1984-03-07",
  villeDeNaissance: "Lyon 3e",
  nationalite: "française",
  adresse: "12 rue des Capucins",
  codePostal: "69001",
  ville: "Lyon",
};

function texteDu(docx: Buffer): string {
  return new PizZip(docx).file("word/document.xml")!.asText().replace(/<[^>]+>/g, "");
}

describe("le pouvoir d'une création", () => {
  const pouvoir = () => {
    const brouillon: Brouillon = {
      forme: "SASU",
      denomination: "STUDIO VERLAINE",
      adresse: "12 rue des Capucins",
      codePostal: "69001",
      ville: "Lyon",
      capital: 10_000,
      partsTotales: 1000,
      associes: [
        { type: "physique", personne: CLAIRE, apport: 10_000, versement: 10_000, parts: 1000 },
      ],
      dirigeants: [{ associe: 0 }],
    };
    return texteDu(typographierLeDocument(genererDocument("pouvoir.docx", donneesDeGabarit(brouillon))));
  };

  it("accorde la mandante, qui signe", () => {
    expect(pouvoir()).toContain("Madame Claire DUFOUR, née le 7 mars 1984");
  });

  it("laisse le mandataire au masculin, qui est le sien", () => {
    const texte = pouvoir();
    expect(texte).toContain("Monsieur Hani MADFAI, né le 12 avril 1985");
    expect(texte).not.toContain("MADFAI, née");
  });
});

describe("le pouvoir d'une cessation", () => {
  const pouvoir = () =>
    texteDu(
      typographierLeDocument(
        genererDocument(
          "cessation-pouvoir.docx",
          donneesDeLaCessation({
            nature: "definitive",
            aujourdHui: new Date("2026-09-12T10:00:00Z"),
            entreprise: {
              denomination: "CLAIRE DUFOUR",
              siren: "940577380",
              activite: "Conception de mobilier",
              adresse: "12 rue des Capucins",
              codePostal: "69001",
              ville: "Lyon",
            },
            entrepreneur: {
              civilite: "Madame",
              prenom: "Claire",
              nom: "DUFOUR",
              adresse: "12 rue des Capucins, 69001 Lyon",
            },
            valeurs: { dateCessation: "2026-09-30", motif: "Création d'une société" },
          })
        )
      )
    );

  it("nomme le mandataire au lieu de s'en remettre au porteur", () => {
    /* « Au porteur d'un original des présentes » vaut pour un dépôt au comptoir du
       greffe. Le guichet unique reçoit un dépôt électronique signé sous l'identité d'une
       personne : il faut que le pouvoir la nomme. */
    const texte = pouvoir();
    expect(texte).toContain("Monsieur Hani MADFAI");
    expect(texte).not.toContain("au porteur d");
  });

  it("ne féminise pas le mandataire quand l'entrepreneuse est une femme", () => {
    expect(pouvoir()).not.toContain("MADFAI, née");
  });

  it("se date du jour de la signature, non du jour de l'arrêt", () => {
    /* Une déclaration remplie le 12 pour un arrêt au 30 portait une date future, et le
       pouvoir qui l'accompagne n'autorisait donc rien avant elle. */
    const texte = pouvoir();
    expect(texte).toContain("le 12 septembre 2026");
    expect(texte).toContain("à compter du 30 septembre 2026");
  });
});
