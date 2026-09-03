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

/**
 * Une associée unique lit un acte qui parle d'elle.
 *
 * Les gabarits écrivent « L'ASSOCIÉ UNIQUE SOUSSIGNÉ », « né le » et « QU'IL A DÉCIDÉ
 * DE CONSTITUER » en toutes lettres, hors de portée des variables. Une femme seule à
 * constituer sa société lisait donc son acte au masculin, du titre à la formule de
 * constitution, dans des statuts déposés au greffe.
 */
describe("l'accord en genre des statuts", () => {
  const seule = (civilite: "Madame" | "Monsieur") => ({
    forme: "SASU",
    denomination: "ROSEBERRY CAPITAL",
    activite: "Le conseil",
    adresse: "34 Rue Laugier",
    codePostal: "75017",
    ville: "Paris",
    banque: "Qonto",
    capital: 1000,
    capitalLibere: 1000,
    partsTotales: 100,
    dureeDeVie: 99,
    dateCloturePremierExercice: "2027-12-31",
    associes: [
      {
        type: "physique",
        parts: 100,
        versement: 1000,
        personne: {
          civilite,
          prenom: "Amel",
          nom: "Belouafi",
          dateDeNaissance: "1996-01-27",
          villeDeNaissance: "Argenteuil",
          nationalite: "Française",
          situationMatrimoniale: "Marié(e)",
          adresse: "34 Rue Laugier",
          codePostal: "75017",
          ville: "Paris",
        },
      },
    ],
    dirigeants: [{ associe: 0 }],
  });

  const statuts = (civilite: "Madame" | "Monsieur") =>
    new PizZip(genererDocument("sasu-statuts.docx", donneesDeGabarit(seule(civilite) as never)))
      .file("word/document.xml")!
      .asText()
      .replace(/<[^>]+>/g, "");

  it("accorde le titre, la naissance et la formule de constitution", () => {
    const texte = statuts("Madame");

    expect(texte).toContain("L’ASSOCIÉE UNIQUE SOUSSIGNÉE");
    expect(texte).toContain("née le 27 janvier 1996");
    expect(texte).toContain("QU’ELLE A DÉCIDÉ DE CONSTITUER");
    /* La nationalité est un adjectif au milieu d'une phrase, non une entrée de menu. */
    expect(texte).toContain("de nationalité française");
    expect(texte).not.toContain("de nationalité Française");
  });

  /* Le masculin l'emporte dès qu'un homme signe : il ne faut pas accorder à tort. */
  it("laisse le masculin quand un homme signe", () => {
    const texte = statuts("Monsieur");

    expect(texte).toContain("L’ASSOCIÉ UNIQUE SOUSSIGNÉ");
    expect(texte).toContain("né le 27 janvier 1996");
    expect(texte).toContain("QU’IL A DÉCIDÉ DE CONSTITUER");
  });
});
