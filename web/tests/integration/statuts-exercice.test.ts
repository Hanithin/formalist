import { describe, it, expect } from "vitest";
import PizZip from "pizzip";
import { genererDocument } from "@/infrastructure/documents/generation";
import { donneesDeGabarit } from "@/domain/formalite/gabarit";

/**
 * Le premier exercice social commence à l'immatriculation, non à l'activité.
 *
 * Les statuts de SAS et de SASU l'ouvraient à la date de début d'activité déclarée. Deux
 * défauts : cette date-là n'est pas obligatoire, et l'article sortait « commence le - » ;
 * et surtout ce n'est pas la même chose - la société n'existe qu'à son immatriculation,
 * et l'activité peut commencer après. Les statuts de SARL et de SCI écrivaient déjà la
 * bonne formule, l'article 5 des mêmes statuts de SAS aussi pour la durée.
 */
const brouillon = (surcharge: Record<string, unknown> = {}) => ({
  forme: "SAS", denomination: "ATELIER MERIDIEN", capital: 20000, partsTotales: 2000,
  activite: "la vente de mobilier", adresse: "12 rue Vauban", codePostal: "69006", ville: "Lyon",
  banque: "Qonto", dateCloturePremierExercice: "2027-12-31",
  associes: [
    { type: "physique" as const, parts: 2000, personne: { civilite: "Monsieur", prenom: "Jean", nom: "Dupont" } },
  ],
  dirigeants: [{ associe: 0 }],
  ...surcharge,
});

function texte(gabarit: string, surcharge: Record<string, unknown> = {}): string {
  const docx = genererDocument(gabarit, donneesDeGabarit(brouillon(surcharge) as never));
  return new PizZip(docx).file("word/document.xml")!.asText()
    .replace(/<[^>]+>/g, "")
    .replace(/&apos;/g, "'");
}

describe("le premier exercice social", () => {
  for (const gabarit of ["sas-statuts.docx", "sasu-statuts.docx"]) {
    it("court depuis l'immatriculation dans " + gabarit, () => {
      const t = texte(gabarit, gabarit.startsWith("sasu") ? { forme: "SASU" } : {});
      expect(t).toContain("commence à compter du jour de l’immatriculation");
      expect(t).toContain("se terminera le 31 décembre 2027");
    });

    /* Sans date de début d'activité, l'article sortait « commence le - ». */
    it("ne dépend plus d'une date qui peut manquer dans " + gabarit, () => {
      const t = texte(gabarit, {
        ...(gabarit.startsWith("sasu") ? { forme: "SASU" } : {}),
        dateDebutActivite: undefined,
      });
      expect(t).not.toContain("commence le -");
    });
  }
});
