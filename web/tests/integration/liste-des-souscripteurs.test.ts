import { describe, it, expect } from "vitest";
import PizZip from "pizzip";
import { genererDocument } from "@/infrastructure/documents/generation";
import { donneesDeGabarit } from "@/domain/formalite/gabarit";

/**
 * La liste des souscripteurs, une pièce du dépôt qui nomme chacun.
 *
 * Elle boucle sur les associés et écrivait `{{IDENTITE_SIGNATAIRE}}` à chaque tour. Cette
 * clé n'existait qu'au niveau du document, où elle désigne le premier associé :
 * docxtemplater remontait donc au document faute de la trouver dans l'élément, et les dix
 * blocs nommaient tous le premier. Une SAS à deux actionnaires attribuait ainsi les 600
 * actions de la seconde au premier - et le bloc de signatures, qui emploie une autre clé,
 * la nommait correctement deux paragraphes plus bas.
 */
const brouillon = {
  forme: "SAS", denomination: "ATELIER MERIDIEN", capital: 20000, partsTotales: 2000,
  objet: "la conception et la vente de mobilier contemporain",
  adresse: "12 rue Vauban", codePostal: "69006", ville: "Lyon",
  associes: [
    { type: "physique" as const, parts: 1400, personne: {
      civilite: "Monsieur", prenom: "Jean", nom: "Dupont", dateDeNaissance: "1980-04-12",
      villeDeNaissance: "Lyon", nationalite: "Française", adresse: "5 rue de la Paix" } },
    { type: "physique" as const, parts: 600, personne: {
      civilite: "Madame", prenom: "Claire", nom: "Martin", dateDeNaissance: "1986-09-03",
      villeDeNaissance: "Grenoble", nationalite: "Française", adresse: "22 cours Vitton" } },
  ],
  dirigeants: [{ associe: 0 }],
};

function texte(maintenant = new Date(2026, 8, 15)): string {
  const donnees = donneesDeGabarit(brouillon as never, { villeRcs: "Lyon", maintenant } as never);
  const docx = genererDocument("sas-liste-souscripteurs.docx", donnees);
  return new PizZip(docx).file("word/document.xml")!.asText().replace(/<[^>]+>/g, "");
}

describe("la liste des souscripteurs", () => {
  it("nomme chaque souscripteur, et non le premier dix fois", () => {
    const t = texte();
    expect(t).toContain("Monsieur Jean Dupont, né le 12 avril 1980");
    expect(t).toContain("Madame Claire Martin, née le 3 septembre 1986");
    /* Le premier était écrit deux fois : une par bloc. */
    expect(t.match(/Monsieur Jean Dupont, né le/g)).toHaveLength(1);
  });

  /* « Fait le 1 septembre » : le quantième du premier s'écrit « 1er ». */
  it("écrit le premier du mois en abrégé ordinal", () => {
    expect(texte(new Date(2026, 8, 1))).toContain("Fait le 1er septembre 2026");
    expect(texte(new Date(2026, 8, 2))).toContain("Fait le 2 septembre 2026");
  });
});
