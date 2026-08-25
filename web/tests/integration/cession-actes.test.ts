import { describe, it, expect } from "vitest";
import PizZip from "pizzip";
import { genererDocument } from "@/infrastructure/documents/generation";
import { rendreLePvAge } from "@/infrastructure/documents/modeles-cabinet";
import { donneesDuPvAge, verifierLePvAge } from "@/domain/modification/pv-age";
import { donneesDuGabarit, actesAProduire, MODELE_UNIVERSEL } from "@/domain/modification/gabarit";
import type { Cession } from "@/domain/modification/cession";

/**
 * Ce que les actes d'une cession disent, et ce qu'ils doivent taire.
 *
 * Trois défauts sont couverts ici, tous invisibles à la génération : un montant sorti
 * sans séparateur, deux actes de la même assemblée qui se démentent sur l'agrément, et
 * un accord au masculin sur une associée unique. Aucun ne fait échouer quoi que ce
 * soit - ils se lisent, à la relecture ou au greffe.
 */

function texteDu(docx: Buffer): string {
  const xml = new PizZip(docx).file("word/document.xml")?.asText() ?? "";
  return xml.replace(/<[^>]+>/g, "").replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

const ASSOCIES = [
  { nature: "physique" as const, civilite: "Monsieur", prenom: "Jean", nom: "DUPONT", parts: 1000 },
];

const CESSION: Cession = {
  cedant: 0,
  parts: 200,
  prix: 24000,
  date: "2026-09-15",
  vers: "tiers",
  nom: "Monsieur Paul LEROY",
  adresse: "8 rue des Capucins, 69001 Lyon",
};

function produire(
  forme: string,
  gabarit: string,
  options: { associes?: typeof ASSOCIES; cessions?: Cession[]; valeurs?: Record<string, string> } = {}
): string {
  const societe = {
    denomination: "ESSAI CESSION",
    forme,
    siren: "552100554",
    adresse: "12 rue de la Paix",
    codePostal: "75002",
    ville: "Paris",
    capital: 100000,
    villeRcs: "Paris",
  };
  const codes = ["cession_parts"];
  const assemblee = { date: "2026-09-15", associes: options.associes ?? ASSOCIES };
  const cessions = options.cessions ?? [CESSION];

  const acte = actesAProduire(codes, forme, {}, assemblee.associes.length).find(
    (a) => a.gabarit === gabarit
  );
  if (!acte) throw new Error("acte introuvable : " + gabarit);

  const contexte = { societe, assemblee, codes, valeurs: options.valeurs ?? {}, cessions };
  /*
   * Le procès-verbal collégial passe par le modèle universel du cabinet, l'acte de
   * cession par les gabarits de Formalist : deux moteurs, deux jeux de balises.
   */
  if (acte.gabarit === MODELE_UNIVERSEL) {
    return texteDu(rendreLePvAge(donneesDuPvAge(contexte)));
  }
  return texteDu(genererDocument(acte.gabarit, donneesDuGabarit(contexte)));
}

describe("la clause d'agrément des statuts", () => {
  /*
   * Dans une société par actions, la loi n'impose rien : ce sont les statuts qui
   * décident, et la clause d'agrément y est la règle plutôt que l'exception. Tant que
   * personne ne pouvait le dire, l'acte affirmait qu'aucun agrément n'était dû -
   * affirmation que le greffe lit à côté des statuts déposés, qui disent l'inverse.
   */
  it("fait agréer la cession dans une SAS quand les statuts le prévoient", () => {
    const pv = produire("SAS", MODELE_UNIVERSEL, { valeurs: { agrementRequis: "Oui" } });

    expect(pv).toContain("agrée expressément cette cession");
    expect(pv).toContain("statuant dans les conditions de majorité prévues par les statuts");
    expect(pv).not.toContain("n'est soumise à aucune procédure d'agrément");
  });

  it("laisse la cession libre quand les statuts ne prévoient rien", () => {
    const pv = produire("SAS", MODELE_UNIVERSEL, { valeurs: { agrementRequis: "Non" } });

    expect(pv).toContain("n'est soumise à aucune procédure d'agrément");
    expect(pv).not.toContain("agrée expressément");
  });

  it("ne se laisse pas nier là où la loi l'impose", () => {
    /*
     * Répondre « Non » sur une SARL cédant à un tiers ne rend pas la cession libre :
     * l'article L. 223-14 ne se règle pas par une case de formulaire.
     */
    const bloquants = verifierLePvAge({
      societe: { denomination: "ESSAI", forme: "SARL", siren: "552100554", adresse: "12 rue de la Paix", codePostal: "75002", ville: "Paris", capital: 100000, villeRcs: "Paris" },
      assemblee: { date: "2026-09-15", associes: ASSOCIES },
      codes: ["cession_parts"],
      valeurs: { agrementRequis: "Non" },
      cessions: [CESSION],
    } as never).filter((a) => a.gravite === "bloquant");

    expect(bloquants.map((a) => a.champ)).toContain("agrementRequis");
  });
});

describe("les actes d'une cession", () => {
  it("écrivent le prix avec son séparateur de milliers", () => {
    /*
     * « 24000 euros » dans un acte déposé au greffe, à côté d'un capital écrit
     * « 100 000 euros » : le prix sortait du tableau des cessions en nombre brut,
     * sans passer par le formateur des montants.
     */
    for (const gabarit of [MODELE_UNIVERSEL, "modif-acte-cession.docx"]) {
      const texte = produire("SAS", gabarit);
      expect(texte, gabarit).toContain("24 000 euros");
      expect(texte, gabarit).not.toContain("24000");
    }
  });

  it("s'accordent sur l'agrément, du procès-verbal à l'acte de cession", () => {
    /*
     * Dans une société par actions, la loi n'impose pas l'agrément d'une cession à un
     * tiers. Le procès-verbal en agréait pourtant le bénéficiaire pendant que l'acte
     * de cession écrivait le contraire, pour la même opération et le même jour.
     */
    const pv = produire("SAS", MODELE_UNIVERSEL);
    const acte = produire("SAS", "modif-acte-cession.docx");

    expect(pv).toContain("(Cession d'actions)");
    expect(pv).toContain("prend acte de la cession de 200 actions");
    expect(pv).not.toContain("agrée expressément");
    expect(pv).toContain("n'est soumise à aucune procédure d'agrément");
    expect(acte).toContain("n'est soumise à aucune procédure d'agrément");
  });

  it("agréent quand la loi l'exige, en SARL vers un tiers", () => {
    const pv = produire("SARL", MODELE_UNIVERSEL);

    expect(pv).toContain("(Cession de parts sociales)");
    expect(pv).toContain("statuant dans les conditions de majorité prévues par L. 223-14");
    expect(pv).toContain("agrée expressément cette cession et le cessionnaire en qualité de nouvel associé");
    expect(pv).not.toContain("n'est soumise à aucune procédure d'agrément");
  });
});

describe("le procès-verbal d'une associée unique", () => {
  const CLAIRE = [
    {
      nature: "physique" as const,
      civilite: "Madame",
      prenom: "Claire",
      nom: "MARCHAND",
      parts: 1000,
    },
  ];

  it("s'accorde au féminin sur la ligne qui la nomme", () => {
    const texte = produire("SASU", "modif-pv-transfert-siege-sasu.docx", { associes: CLAIRE });

    expect(texte).toContain("La soussignée, Madame Claire MARCHAND, associée unique");
    expect(texte).not.toContain("Le soussigné, Madame");
  });

  it("reste au masculin pour un associé unique homme", () => {
    const texte = produire("SASU", "modif-pv-transfert-siege-sasu.docx");

    expect(texte).toContain("Le soussigné, Monsieur Jean DUPONT, associé unique");
  });
});
