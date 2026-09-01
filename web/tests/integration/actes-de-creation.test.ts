import { describe, it, expect } from "vitest";
import PizZip from "pizzip";
import { genererDocument } from "@/infrastructure/documents/generation";
import { typographierLeDocument } from "@/infrastructure/documents/typographie-docx";
import { donneesDeGabarit } from "@/domain/formalite/gabarit";

/**
 * Ce que porte le texte des actes d'une création.
 *
 * Deux défauts s'y voyaient à l'œil nu et à personne d'autre. « Monsieur Jean Dupont,
 * né(e) le 12 avril 1980 » : la règle qui accorde le participe cherchait un « é »
 * composé, là où les statuts de SAS portent la forme décomposée - dix mentions par jeu.
 * Et la passe typographique, appliquée sur tous les autres parcours, ne l'était pas sur
 * la création : un capital pouvait se couper entre « 20 » et « 000 » au bas d'une page.
 */
const brouillon = {
  forme: "SAS",
  denomination: "ATELIER MERIDIEN",
  capital: 20000,
  partsTotales: 2000,
  objet: "la conception et la vente de mobilier contemporain",
  adresse: "12 rue Vauban",
  codePostal: "69006",
  ville: "Lyon",
  associes: [
    {
      type: "physique" as const,
      parts: 1400,
      personne: {
        civilite: "Monsieur", prenom: "Jean", nom: "Dupont",
        dateDeNaissance: "1980-04-12", villeDeNaissance: "Lyon",
        nomDuPere: "Paul Dupont", nomDeLaMere: "Anne Berger", nationalite: "Française",
        adresse: "5 rue de la Paix", codePostal: "69001", ville: "Lyon",
      },
    },
    {
      type: "physique" as const,
      parts: 600,
      personne: {
        civilite: "Madame", prenom: "Claire", nom: "Martin",
        dateDeNaissance: "1986-09-03", villeDeNaissance: "Grenoble",
        nomDuPere: "Louis Martin", nomDeLaMere: "Sylvie Roche", nationalite: "Française",
        adresse: "22 cours Vitton", codePostal: "69006", ville: "Lyon",
      },
    },
  ],
  dirigeants: [{ associe: 0 }],
};

function texteDesStatuts(typographie: boolean): string {
  const donnees = donneesDeGabarit(brouillon as never, { villeRcs: "Lyon" } as never);
  const brut = genererDocument("sas-statuts.docx", donnees);
  const docx = typographie ? typographierLeDocument(brut) : brut;
  return new PizZip(docx).file("word/document.xml")!.asText().replace(/<[^>]+>/g, "");
}

describe("les statuts d'une SAS", () => {
  it("accorde le participe sur la civilité de chacun", () => {
    const texte = texteDesStatuts(false);
    expect(texte).not.toContain("né(e)");
    expect(texte).toContain("Monsieur Jean DUPONT, né le");
    expect(texte).toContain("Madame Claire MARTIN, née le");
  });

  it("ne laisse pas un montant se couper en fin de ligne", () => {
    const texte = texteDesStatuts(true);
    /* Un groupe de milliers séparé par une espace ordinaire se coupe : il n'en reste aucun. */
    expect(texte).not.toMatch(/\d \d{3}\b/);
    expect(texte).not.toMatch(/\d euros/);
    expect(texte).not.toMatch(/\b[LR]\. \d/);
  });
});
