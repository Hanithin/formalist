import { describe, it, expect } from "vitest";
import PizZip from "pizzip";
import { genererDocument } from "@/infrastructure/documents/generation";
import { typographierLeDocument } from "@/infrastructure/documents/typographie-docx";
import { donneesDeGabarit } from "@/domain/formalite/gabarit";

/**
 * L'article du capital dit qui détient quoi.
 *
 * Les statuts de SAS annonçaient le capital et le nombre d'actions, sans jamais dire
 * comment elles se répartissent : rien dans l'acte ne rattachait un actionnaire à ses
 * titres, et l'article des apports ne parle que du dépôt des fonds. Les statuts de SARL
 * portaient déjà cette liste - la loi l'y impose - et les nôtres de SAS l'ignoraient.
 */
function texte(gabarit: string, brouillon: Record<string, unknown>): string {
  const docx = typographierLeDocument(genererDocument(gabarit, donneesDeGabarit(brouillon as never)));
  return new PizZip(docx).file("word/document.xml")!.asText()
    .replace(/<[^>]+>/g, "")
    .replace(/&apos;/g, "'")
    .replace(/[  ]/g, " ");
}

const base = {
  denomination: "ATELIER MERIDIEN", capital: 20000, partsTotales: 2000,
  activite: "la vente de mobilier", adresse: "12 rue Vauban", codePostal: "69006", ville: "Lyon",
  banque: "Qonto", dateCloturePremierExercice: "2027-12-31",
};

describe("la répartition du capital", () => {
  it("nomme chaque actionnaire et numérote ses actions", () => {
    const t = texte("sas-statuts.docx", {
      ...base,
      forme: "SAS",
      associes: [
        { type: "physique", parts: 1400, personne: { civilite: "Monsieur", prenom: "Jean", nom: "Dupont" } },
        { type: "physique", parts: 600, personne: { civilite: "Madame", prenom: "Claire", nom: "Martin" } },
      ],
      dirigeants: [{ associe: 0 }],
    });

    expect(t).toContain("Ces actions sont réparties entre les actionnaires comme suit :");
    expect(t).toContain("Monsieur Jean Dupont : 1 400 actions, numérotées de 1 à 1 400.");
    expect(t).toContain("Madame Claire Martin : 600 actions, numérotées de 1 401 à 2 000.");
  });

  /* Un seul actionnaire ne se répartit rien : il détient tout. */
  it("dit la détention entière dans une SASU", () => {
    const t = texte("sasu-statuts.docx", {
      ...base,
      forme: "SASU",
      associes: [
        { type: "physique", parts: 2000, personne: { civilite: "Monsieur", prenom: "Jean", nom: "Dupont" } },
      ],
      dirigeants: [{ associe: 0 }],
    });

    /* Le gabarit emploie l'apostrophe typographique, comme le reste des statuts. */
    expect(t).toMatch(/intégralement souscrites et détenues par l['’]associé unique/);
  });

  /* Le séparateur de milliers vaut pour la numérotation comme pour le nombre. */
  it("numérote avec le séparateur de milliers", () => {
    const t = texte("sarl-statuts.docx", {
      ...base,
      forme: "SARL",
      associes: [
        { type: "physique", parts: 1400, personne: { civilite: "Monsieur", prenom: "Jean", nom: "Dupont" } },
        { type: "physique", parts: 600, personne: { civilite: "Madame", prenom: "Claire", nom: "Martin" } },
      ],
      dirigeants: [{ associe: 0 }],
    });

    expect(t).not.toMatch(/numérotées de \d+ à \d{4}\./);
  });
});
