import { describe, it, expect } from "vitest";
import PizZip from "pizzip";
import { donneesDuPvAge } from "@/domain/modification/pv-age";
import { donneesDuTraite } from "@/domain/modification/traite-apport";
import { rendreLePvAge, rendreLeTraiteDApport } from "@/infrastructure/documents/modeles-cabinet";
import { verifierModification } from "@/domain/modification/verification";
import type { ContexteGabarit } from "@/domain/modification/gabarit";

/**
 * Une assemblée qui augmente le capital, puis rémunère un apport de titres.
 *
 * Chaque résolution part de ce que la précédente a laissé - c'est ainsi qu'un acte se
 * lit, de haut en bas. La règle vivait dans le seul gabarit des statuts : le
 * procès-verbal et le traité repartaient du capital d'avant l'assemblée, et le même
 * document annonçait « porté de 20 000 à 50 000 » puis, deux résolutions plus bas, « en
 * conséquence de la résolution qui précède […] porté de 20 000 à 120 000 ».
 *
 * Trois actes, trois capitaux finaux, et rien pour s'en apercevoir.
 */

function texteDu(docx: Buffer): string {
  return new PizZip(docx)
    .file("word/document.xml")!
    .asText()
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/[  ]/g, " ")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

const SOCIETE = {
  denomination: "MERIDIEN HOLDING",
  forme: "SAS",
  siren: "552100554",
  adresse: "12 rue Vauban",
  codePostal: "69006",
  ville: "Lyon",
  capital: 20000,
  villeRcs: "Lyon",
};

const ASSEMBLEE = {
  date: "2026-10-10",
  totalParts: 2000,
  associes: [
    {
      nature: "physique",
      civilite: "Monsieur",
      prenom: "Jean",
      nom: "DUPONT",
      parts: 2000,
      neLe: "1970-01-01",
      neA: "Lyon",
      nationalite: "Française",
      adresse: "3 rue Bellecour, 69002 Lyon",
    },
  ],
};

/** Le capital passe de 20 000 à 50 000, puis l'apport de 100 000 le porte à 150 000. */
const VALEURS: Record<string, string> = {
  capitalActuelAugm: "20000",
  nouveauCapitalAugm: "50000",
  modeAugmentation: "Apport en numéraire",
  banqueDepot: "Crédit Mutuel",
  nbPartsNouvelles: "3000",
  valeurNominaleAugm: "10",
  dateEffetAugm: "2026-10-10",

  apporteeDenomination: "CIBLE",
  apporteeForme: "SARL",
  apporteeSiren: "512345678",
  apporteeSiege: "34 rue Laugier, 75017 Paris",
  apporteeRcs: "Paris",
  apporteeCapital: "10000",
  apporteeNbTitres: "1000",
  apporteeNominale: "10",
  apportNbTitres: "1000",
  apportOrigineTitres: "Souscription à la constitution",
  apportValeur: "100000",
  apportMethodeValorisation: "Actif net comptable",
  apportCommissaire: "Oui",
  apportCommissaireNom: "Cabinet AUDIT",
  beneficiaireObjet: "la prise de participation dans toutes sociétés",
  apportNominaleBeneficiaire: "10",
  apportNumeraire: "",
  apporteurCivilite: "Monsieur",
  apporteurPrenom: "Jean",
  apporteurNom: "DUPONT",
  apporteurNeLe: "1970-01-01",
  apporteurNeA: "Lyon",
  apporteurAdresse: "3 rue Bellecour, 69002 Lyon",
  apporteurQualite: "Associé unique et représentant légal",
  apportControle: "Oui",
  apportDateEffet: "2026-10-10",
  apportDateSignature: "2026-10-09",
  apportDateLimiteCondition: "2026-12-31",
};

function contexte(sur: Record<string, string> = {}): ContexteGabarit {
  return {
    societe: SOCIETE,
    assemblee: ASSEMBLEE,
    codes: ["augmentation_capital", "apport_titres"],
    valeurs: { ...VALEURS, ...sur },
    cessions: [],
  } as unknown as ContexteGabarit;
}

describe("la chaîne des capitaux, d'une résolution à l'autre", () => {
  it("le procès-verbal enchaîne les deux augmentations", () => {
    const texte = texteDu(rendreLePvAge(donneesDuPvAge(contexte())));

    expect(texte).toContain("pour le porter de 20 000 euros à 50 000 euros");
    expect(texte).toContain("Le capital social est ainsi porté de 50 000 euros à 150 000 euros");
    /* Le chiffre d'avant : l'apport repartait du capital d'avant l'assemblée. */
    expect(texte).not.toContain("porté de 20 000 euros à 120 000 euros");
  });

  it("le traité annonce le même capital final", () => {
    const texte = texteDu(rendreLeTraiteDApport(donneesDuTraite(contexte())));

    expect(texte).toContain(
      "porté de cinquante mille euros (50 000 €) à cent cinquante mille euros (150 000 €)"
    );
  });

  it("mais garde en tête le capital du jour où il se signe", () => {
    /*
     * Le traité est signé avant l'assemblée qui l'approuve : la société y est
     * identifiée par son capital d'alors, non par celui qu'elle aura le lendemain.
     */
    const texte = texteDu(rendreLeTraiteDApport(donneesDuTraite(contexte())));

    expect(texte).toContain(
      "La société MERIDIEN HOLDING, société par actions simplifiée au capital de 20 000 euros"
    );
  });

  it("sans autre résolution, l'apport part du capital de la société", () => {
    const seul = {
      ...contexte(),
      codes: ["apport_titres"],
    } as unknown as ContexteGabarit;
    const texte = texteDu(rendreLePvAge(donneesDuPvAge(seul)));

    expect(texte).toContain("Le capital social est ainsi porté de 20 000 euros à 120 000 euros");
  });
});

describe("la même augmentation, décidée deux fois", () => {
  it("est refusée plutôt qu'additionnée", () => {
    /*
     * Le bloc de l'apport porte un champ « Augmentation en numéraire préalable » qui
     * fait exactement ce que fait le bloc « Augmentation de capital ». Les deux cochés,
     * l'acte compterait deux fois le même versement, une fois par résolution.
     */
    const anomalies = verifierModification(
      ["augmentation_capital", "apport_titres"],
      { ...VALEURS, apportNumeraire: "30000" } as never,
      SOCIETE as never,
      ASSEMBLEE as never,
      []
    );

    const doublon = anomalies.find((a) => a.champ === "apportNumeraire");
    expect(doublon).toBeDefined();
    expect(doublon!.message).toContain("déjà décidée dans le bloc");
  });

  it("passe quand l'apport est seul à la porter", () => {
    const anomalies = verifierModification(
      ["apport_titres"],
      { ...VALEURS, apportNumeraire: "30000" } as never,
      SOCIETE as never,
      ASSEMBLEE as never,
      []
    );

    expect(anomalies.filter((a) => a.champ === "apportNumeraire")).toEqual([]);
  });

  it("laisse passer un dossier qui n'en décide qu'une", () => {
    expect(
      verifierModification(
        ["augmentation_capital", "apport_titres"],
        VALEURS as never,
        SOCIETE as never,
        ASSEMBLEE as never,
        []
      )
    ).toEqual([]);
  });
});
