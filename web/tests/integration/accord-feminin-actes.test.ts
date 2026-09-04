import { describe, it, expect } from "vitest";
import PizZip from "pizzip";
import { genererDocument } from "@/infrastructure/documents/generation";
import { renumeroterLesResolutions } from "@/infrastructure/documents/resolutions";
import { donneesDeLaFermeture, type ContexteFermeture } from "@/domain/fermeture/gabarit";
import { donneesDesComptes, type ContexteComptes } from "@/domain/comptes/gabarit";
import { donneesDuGabarit } from "@/domain/modification/gabarit";
import { affectationProposee } from "@/domain/comptes/regles";

/**
 * Les actes des quatre parcours, quand toutes celles qui signent sont des femmes.
 *
 * La création s'accordait ; les quatre autres parcours, non ou à moitié. Chacun avait
 * sa propre règle - le liquidateur pour la fermeture, l'ouverture du procès-verbal pour
 * la modification, rien du tout pour le dépôt des comptes - et s'arrêtait ailleurs. Une
 * associée unique lisait « Sont présents », « L'associé unique décide de transférer le
 * siège social », « agissant en qualité d'associé unique », dans des actes qu'elle signe
 * et qui partent au greffe.
 *
 * Deux pièges ont coûté un tour :
 *
 * - le texte venu des données arrive échappé - « L&apos;associé unique donne au
 *   liquidateur » - là où celui des gabarits garde son apostrophe ;
 * - la passe typographique pose une espace fine insécable devant les deux-points, si
 *   bien qu'une règle écrite avec une espace ordinaire manquait « L'associé unique : ».
 *
 * Les deux se voyaient dans le document produit, jamais dans la règle relue.
 */

function texteDu(docx: Buffer): string {
  return (new PizZip(docx).file("word/document.xml")?.asText() ?? "")
    .replace(/<[^>]+>/g, "")
    .replace(/[  ]/g, " ")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

const SOCIETE = {
  denomination: "ATELIER MERIDIEN",
  forme: "SASU",
  siren: "552100554",
  adresse: "12 rue de la Paix",
  codePostal: "75002",
  ville: "Paris",
  capital: 10_000,
  villeRcs: "Paris",
};

const ELLE = [{ civilite: "Madame", prenom: "Claire", nom: "MARTIN", parts: 1000 }];
const ELLES = [
  { civilite: "Madame", prenom: "Claire", nom: "MARTIN", parts: 600 },
  { civilite: "Madame", prenom: "Amel", nom: "BELOUAFI", parts: 400 },
];
const MIXTE = [
  { civilite: "Madame", prenom: "Claire", nom: "MARTIN", parts: 600 },
  { civilite: "Monsieur", prenom: "Jean", nom: "DUPONT", parts: 400 },
];

/* ------------------------------------------------------------------- Fermeture */

const VALEURS_FERMETURE = {
  dateDissolution: "2026-03-10",
  heureDecision: "11 heures",
  lieuDecision: "au siège social",
  motifDissolution: "Cessation de l'activité",
  liquidateurCivilite: "Madame",
  liquidateurPrenom: "Claire",
  liquidateurNom: "MARTIN",
  liquidateurNeLe: "1980-05-04",
  liquidateurNeA: "Lyon (69)",
  liquidateurNationalite: "française",
  liquidateurPere: "Paul MARTIN",
  liquidateurMere: "Anne BERGER",
  liquidateurAdresse: "8 avenue des Tilleuls, 75011 Paris",
  siegeDeLaLiquidation: "8 avenue des Tilleuls, 75011 Paris",
  dateCloture: "2026-11-20",
  dateArreteDesComptes: "2026-11-19",
  lieuCloture: "au siège de la liquidation",
  actifRealise: 60_000,
  passifApure: 30_000,
  fraisDeLiquidation: 2_000,
};

const fermeture = (associes: typeof ELLE, gabarit: string, civiliteLiquidateur = "Madame") =>
  texteDu(
    renumeroterLesResolutions(
      genererDocument(
        gabarit,
        donneesDeLaFermeture({
          voie: "liquidation-amiable",
          societe: SOCIETE,
          associes,
          valeurs: { ...VALEURS_FERMETURE, liquidateurCivilite: civiliteLiquidateur },
        } as ContexteFermeture)
      )
    )
  );

describe("les actes d'une fermeture", () => {
  it("accorde la décision de l'associée unique, du titre à la signature", () => {
    const texte = fermeture(ELLE, "fermeture-decision-dissolution.docx");

    expect(texte).toContain("DÉCISION DE L'ASSOCIÉE UNIQUE");
    expect(texte).toContain("associée unique de la société ATELIER MERIDIEN");
    expect(texte).toContain("L'associée unique nomme en qualité de liquidateur");
    expect(texte).toContain("L'associée unique confère au liquidateur");
    expect(texte).toContain("registre des décisions de l'associée unique");
    expect(texte).toContain("L'associée unique :");
  });

  it("accorde la présence en assemblée quand elles y sont toutes", () => {
    expect(fermeture(ELLES, "fermeture-pv-cloture.docx")).toContain("Sont présentes :");
    expect(fermeture(MIXTE, "fermeture-pv-cloture.docx")).toContain("Sont présents :");
  });

  it("adresse le rapport à l'associée unique", () => {
    expect(fermeture(ELLE, "fermeture-rapport-liquidateur.docx")).toContain(
      "À l'attention de l'associée unique"
    );
  });

  /* Le masculin l'emporte dès qu'un homme signe, liquidateur compris. */
  it("laisse le masculin quand un homme liquide", () => {
    const texte = fermeture(ELLE, "fermeture-decision-dissolution.docx", "Monsieur");

    expect(texte).toContain("DÉCISION DE L'ASSOCIÉ UNIQUE");
    expect(texte).toContain("L'associé unique nomme en qualité de liquidateur");
  });
});

/* --------------------------------------------------------- Dépôt des comptes */

const VALEURS_COMPTES = {
  dateOuverture: "2025-01-01",
  dateCloture: "2025-12-31",
  dateAssemblee: "2026-06-15",
  heureAssemblee: "14 heures",
  lieuAssemblee: "au siège social",
  dirigeantNom: "Madame Claire MARTIN",
  dirigeantFonction: "Président",
  commissaireAuxComptes: "Non",
  resultat: 10_000,
  reportAnterieur: 0,
  reserveLegale: 0,
  totalBilan: 200_000,
  chiffreAffaires: 400_000,
  effectif: 3,
  depensesNonDeductibles: 0,
};

const comptes = (associes: typeof ELLE, gabarit: string) =>
  texteDu(
    renumeroterLesResolutions(
      genererDocument(
        gabarit,
        donneesDesComptes({
          societe: SOCIETE,
          associes,
          valeurs: VALEURS_COMPTES,
          affectation: affectationProposee({
            forme: "SASU",
            resultatCentimes: 1_000_000,
            reportAnterieurCentimes: 0,
            capitalCentimes: 1_000_000,
            reserveExistanteCentimes: 0,
          }),
          conventions: [],
          exclusions: [],
        } as ContexteComptes)
      )
    )
  );

describe("les actes d'un dépôt des comptes", () => {
  it("accorde la décision, jusqu'au titre de la dirigeante", () => {
    const texte = comptes(ELLE, "comptes-pv-associe-unique.docx");

    expect(texte).toContain("DÉCISION DE L'ASSOCIÉE UNIQUE");
    expect(texte).toContain("en qualité d'associée unique et de Présidente");
    expect(texte).toContain("L'associée unique approuve les comptes annuels");
    expect(texte).toContain("L'associée unique donne tous pouvoirs");
  });

  it("accorde la présence en assemblée", () => {
    expect(comptes(ELLES, "comptes-pv-assemblee.docx")).toContain("Sont présentes :");
    expect(comptes(MIXTE, "comptes-pv-assemblee.docx")).toContain("Sont présents :");
  });

  /*
   * La déclaration de confidentialité est signée par la société : « le Déclarant » y
   * désigne la personne morale qui dépose ses comptes, et la civilité de qui détient le
   * capital n'y accorde rien. L'accorder aurait produit « LA SOUSSIGNÉE » au-dessus d'un
   * « le Déclarant » resté au masculin, dans le même acte.
   */
  it("ne touche pas à la déclaration que signe la société", () => {
    const texte = comptes(ELLE, "comptes-confidentialite-petite.docx");

    expect(texte).toContain("LE SOUSSIGNÉ :");
    expect(texte).toContain("le Déclarant");
    expect(texte).toContain("Le soussigné atteste sur l'honneur");
  });
});

/* ---------------------------------------------------------------- Modification */

const modification = (associes: typeof ELLE, gabarit: string, forme = "SASU") =>
  texteDu(
    renumeroterLesResolutions(
      genererDocument(
        gabarit,
        donneesDuGabarit({
          societe: { ...SOCIETE, forme },
          assemblee: {
            associes,
            dateAssemblee: "2026-06-15",
            heureAssemblee: "10 heures",
            lieuAssemblee: "au siège social",
          },
          codes: ["transfert-siege"],
          valeurs: {
            nouvelleAdresse: "5 rue du Bac",
            nouveauCodePostal: "75007",
            nouvelleVille: "Paris",
          },
        } as never)
      )
    )
  );

describe("les actes d'une modification", () => {
  it("accorde la décision de l'associée unique", () => {
    const texte = modification(ELLE, "modif-pv-transfert-siege-sasu.docx");

    expect(texte).toContain("DÉCISION DE L'ASSOCIÉE UNIQUE");
    expect(texte).toContain("La soussignée");
    expect(texte).toContain("associée unique de la société");
    expect(texte).toContain("registre des décisions de l'associée unique");
    expect(texte).toContain("signé par l'associée unique");
    /* L'étiquette sous la ligne de signature porte une espace fine avant les deux-points. */
    expect(texte).toContain("L'associée unique :");
  });

  it("accorde la présence en assemblée", () => {
    expect(modification(ELLES, "modif-pv-transfert-siege-sas.docx", "SAS")).toContain(
      "Sont présentes :"
    );
    expect(modification(MIXTE, "modif-pv-transfert-siege-sas.docx", "SAS")).toContain(
      "Sont présents :"
    );
  });
});
