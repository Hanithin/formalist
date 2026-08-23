import { describe, it, expect } from "vitest";
import PizZip from "pizzip";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { genererDocument } from "@/infrastructure/documents/generation";
import { renumeroterLesResolutions } from "@/infrastructure/documents/resolutions";
import { donneesDesComptes, type ContexteComptes } from "@/domain/comptes/gabarit";
import { actesDesComptes } from "@/domain/comptes/actes";
import { affectationProposee } from "@/domain/comptes/regles";
import type { Convention } from "@/domain/comptes/conventions";

/**
 * Les actes de l'approbation des comptes.
 *
 * Ce qui doit s'y voir, et surtout ce qui ne doit pas : une résolution sur des
 * conventions dans une société civile qui n'en connaît pas, une dotation à la réserve
 * légale là où aucune n'est due, un rapport spécial adressé à un associé unique par
 * lui-même.
 */

/**
 * Le texte lisible d'un document produit.
 *
 * Deux réductions sans lesquelles les comparaisons échouent sur des différences que
 * personne ne voit : les espaces insécables, fine ou ordinaire, que le formatage des
 * montants et la typographie française posent ; et les entités XML, l'apostrophe
 * arrivant dans le document sous la forme « &apos; ».
 */
function texteDu(docx: Buffer): string {
  const xml = new PizZip(docx).file("word/document.xml")?.asText() ?? "";
  return xml
    .replace(/<[^>]+>/g, "")
    .replace(/[\u202f\u00a0]/g, " ")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

const SOCIETE = {
  denomination: "ESSAI COMPTES",
  forme: "SAS",
  siren: "552100554",
  adresse: "12 rue de la Paix",
  codePostal: "75002",
  ville: "Paris",
  capital: 10_000,
  villeRcs: "Paris",
};

const ASSOCIES = [
  { civilite: "Monsieur", prenom: "Jean", nom: "DUPONT", parts: 600 },
  { civilite: "Madame", prenom: "Claire", nom: "MARTIN", parts: 400 },
];

const VALEURS: Record<string, string | number> = {
  dateOuverture: "2025-01-01",
  dateCloture: "2025-12-31",
  dateAssemblee: "2026-06-15",
  heureAssemblee: "14 heures",
  lieuAssemblee: "au siège social",
  dirigeantNom: "Monsieur Jean DUPONT",
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

function contexte(sur: Partial<ContexteComptes> = {}): ContexteComptes {
  const societe = sur.societe ?? SOCIETE;
  const valeurs = sur.valeurs ?? VALEURS;

  const base = {
    forme: societe.forme,
    resultatCentimes: Math.round(Number(valeurs.resultat ?? 0) * 100),
    reportAnterieurCentimes: Math.round(Number(valeurs.reportAnterieur ?? 0) * 100),
    capitalCentimes: Math.round((societe.capital ?? 0) * 100),
    reserveExistanteCentimes: Math.round(Number(valeurs.reserveLegale ?? 0) * 100),
  };

  return {
    societe,
    associes: sur.associes ?? ASSOCIES,
    valeurs,
    affectation: sur.affectation ?? affectationProposee(base),
    conventions: sur.conventions ?? [],
    exclusions: sur.exclusions ?? [],
  };
}

function produire(ctx: ContexteComptes, gabarit: string): string {
  return texteDu(renumeroterLesResolutions(genererDocument(gabarit, donneesDesComptes(ctx))));
}

describe("le procès-verbal d'approbation", () => {
  it("porte le résultat, le quitus et l'affectation", () => {
    const texte = produire(contexte(), "comptes-pv-assemblee.docx");

    expect(texte).toContain("ESSAI COMPTES");
    expect(texte).toContain("31 décembre 2025");
    expect(texte).toContain("un bénéfice de 10 000 euros");
    expect(texte).toContain("quitus");
    // 5 % de 10 000 €, plafonné au dixième d'un capital de 10 000 €.
    expect(texte).toContain("- à la réserve légale : 500 euros");
    expect(texte).toContain("report à nouveau » : 9 500 euros");
  });

  it("numérote les résolutions dans l'ordre", () => {
    const texte = produire(contexte(), "comptes-pv-assemblee.docx");

    expect(texte).toContain("PREMIÈRE RÉSOLUTION");
    expect(texte).toContain("DEUXIÈME RÉSOLUTION");
    expect(texte).toContain("QUATRIÈME RÉSOLUTION");
  });

  it("écrit une perte comme une perte, et la reporte", () => {
    const texte = produire(
      contexte({ valeurs: { ...VALEURS, resultat: -3_000 } }),
      "comptes-pv-assemblee.docx"
    );

    expect(texte).toContain("une perte de 3 000 euros");
    expect(texte).not.toContain("à la réserve légale");
  });

  it("approuve expressément les dépenses non déductibles quand il y en a", () => {
    /*
     * L'article 223 quater du CGI impose que l'assemblée statue dessus. Le modèle
     * n'avait que la formule « aucune dépense » : il fallait la corriger à la main
     * quand il y en avait, et personne ne le faisait.
     */
    const avec = produire(
      contexte({ valeurs: { ...VALEURS, depensesNonDeductibles: 1_200 } }),
      "comptes-pv-assemblee.docx"
    );
    expect(avec).toContain("approuve expressément les dépenses");
    expect(avec).toContain("1 200 euros");

    const sans = produire(contexte(), "comptes-pv-assemblee.docx");
    expect(sans).toContain("aucune dépense ou charge non déductible");
  });

  it("ne dote aucune réserve légale dans une société civile", () => {
    const civile = { ...SOCIETE, forme: "SCI" };
    const texte = produire(
      contexte({ societe: civile, valeurs: { ...VALEURS, resultat: 50_000 } }),
      "comptes-pv-assemblee.docx"
    );

    expect(texte).not.toContain("réserve légale");
  });

  it("tait les conventions réglementées dans une société civile patrimoniale", () => {
    /*
     * Le modèle citait « L. 185-13 pour SCI », un article qui n'existe pas. Une société
     * civile qui gère son patrimoine n'a aucun régime de conventions réglementées : la
     * résolution n'a pas lieu d'être.
     */
    const texte = produire(
      contexte({ societe: { ...SOCIETE, forme: "SCI" } }),
      "comptes-pv-assemblee.docx"
    );

    expect(texte).not.toContain("CONVENTIONS RÉGLEMENTÉES");
    expect(texte).not.toContain("L. 185-13");
  });

  it("prend acte de l'absence de convention, et les liste quand il y en a", () => {
    const sans = produire(contexte(), "comptes-pv-assemblee.docx");
    expect(sans).toContain("aucune convention entrant dans le champ");
    expect(sans).toContain("L. 227-10");

    const conventions: Convention[] = [
      {
        nature: "Compte courant d'associé",
        partie: "Monsieur Jean DUPONT, président",
        objet: "avance en compte courant",
        montantCentimes: 15_000_00,
        modalites: "remboursable à douze mois, sans intérêt",
        poursuivie: false,
      },
    ];
    const avec = produire(contexte({ conventions }), "comptes-pv-assemblee.docx");
    expect(avec).toContain("Compte courant d'associé");
    expect(avec).toContain("15 000 euros");
    expect(avec).toContain("remboursable à douze mois");
  });
});

describe("la décision de l'associé unique", () => {
  const seul = [{ civilite: "Madame", prenom: "Claire", nom: "MARCHAND", parts: 1000 }];
  const valeurs = {
    ...VALEURS,
    associeUniqueNeLe: "1979-03-03",
    associeUniqueNeA: "Bordeaux (33)",
    associeUniqueAdresse: "4 rue des Lilas, 33000 Bordeaux",
  };

  it("nomme l'associée avec son état civil et se numérote en décisions", () => {
    const texte = produire(
      contexte({ societe: { ...SOCIETE, forme: "SASU" }, associes: seul, valeurs }),
      "comptes-pv-associe-unique.docx"
    );

    expect(texte).toContain("Madame Claire MARCHAND");
    expect(texte).toContain("3 mars 1979");
    expect(texte).toContain("PREMIÈRE DÉCISION");
    expect(texte).not.toContain("RÉSOLUTION");
  });

  it("se borne à mentionner les conventions au registre", () => {
    const conventions: Convention[] = [
      {
        nature: "Bail",
        partie: "Madame Claire MARCHAND, présidente",
        objet: "location du local du siège",
        montantCentimes: 12_000_00,
        modalites: "",
        poursuivie: true,
      },
    ];
    const texte = produire(
      contexte({ societe: { ...SOCIETE, forme: "SASU" }, associes: seul, valeurs, conventions }),
      "comptes-pv-associe-unique.docx"
    );

    expect(texte).toContain("mention, au registre des décisions");
    expect(texte).not.toContain("rapport spécial");
  });
});

describe("les actes à produire", () => {
  const chiffres = {
    totalBilanCentimes: 200_000_00,
    chiffreAffairesCentimes: 400_000_00,
    effectif: 3,
  };

  it("le procès-verbal seul, quand rien d'autre n'est dû", () => {
    const actes = actesDesComptes({
      forme: "SAS",
      nombreDAssocies: 2,
      avecCommissaire: false,
      nombreDeConventions: 0,
      chiffres,
      exclusions: [],
      demandeLaConfidentialite: false,
    });

    expect(actes.map((a) => a.gabarit)).toEqual(["comptes-pv-assemblee.docx"]);
  });

  it("ajoute le rapport spécial quand la loi l'exige", () => {
    const actes = actesDesComptes({
      forme: "SAS",
      nombreDAssocies: 2,
      avecCommissaire: false,
      nombreDeConventions: 1,
      chiffres,
      exclusions: [],
      demandeLaConfidentialite: false,
    });

    expect(actes.map((a) => a.gabarit)).toContain("comptes-rapport-conventions.docx");
  });

  it("ne le produit pas pour un associé unique, ni quand un commissaire est là", () => {
    /*
     * L'associé unique est dispensé du rapport et du vote ; et quand un commissaire aux
     * comptes existe, c'est lui qui l'établit - nous ne pouvons pas le rédiger pour lui.
     */
    const unique = actesDesComptes({
      forme: "SASU",
      nombreDAssocies: 1,
      avecCommissaire: false,
      nombreDeConventions: 2,
      chiffres,
      exclusions: [],
      demandeLaConfidentialite: false,
    });
    expect(unique.map((a) => a.gabarit)).not.toContain("comptes-rapport-conventions.docx");

    const avecCac = actesDesComptes({
      forme: "SAS",
      nombreDAssocies: 3,
      avecCommissaire: true,
      nombreDeConventions: 2,
      chiffres,
      exclusions: [],
      demandeLaConfidentialite: false,
    });
    expect(avecCac.map((a) => a.gabarit)).not.toContain("comptes-rapport-conventions.docx");
  });

  it("choisit la déclaration de confidentialité selon la taille", () => {
    const micro = actesDesComptes({
      forme: "SAS",
      nombreDAssocies: 2,
      avecCommissaire: false,
      nombreDeConventions: 0,
      chiffres,
      exclusions: [],
      demandeLaConfidentialite: true,
    });
    expect(micro.map((a) => a.gabarit)).toContain("comptes-confidentialite-micro.docx");

    const petite = actesDesComptes({
      forme: "SAS",
      nombreDAssocies: 2,
      avecCommissaire: false,
      nombreDeConventions: 0,
      chiffres: { ...chiffres, chiffreAffairesCentimes: 5_000_000_00, totalBilanCentimes: 3_000_000_00 },
      exclusions: [],
      demandeLaConfidentialite: true,
    });
    expect(petite.map((a) => a.gabarit)).toContain("comptes-confidentialite-petite.docx");
  });
});

describe("la couverture des gabarits", () => {
  /*
   * Le contrat avec les documents Word.
   *
   * Les noms de champs vivent dans les .docx, et c'est eux qui font foi. Un champ que
   * le domaine ne fournit pas ne fait rien échouer : il laisse un blanc au milieu d'un
   * acte, à l'endroit exact où le nom de la société ou un montant devrait être.
   */
  const GABARITS = path.join(process.cwd(), "..", "templates");
  const fichiers = readdirSync(GABARITS).filter((f) => f.startsWith("comptes-"));
  const fournis = new Set(Object.keys(donneesDesComptes(contexte())));

  it("les cinq gabarits sont là", () => {
    expect(fichiers).toHaveLength(5);
  });

  for (const fichier of fichiers) {
    it(fichier + " ne demande rien que le domaine ne donne", () => {
      const xml = new PizZip(readFileSync(path.join(GABARITS, fichier)))
        .file("word/document.xml")!
        .asText();
      const texte = xml.replace(/<[^>]+>/g, "");

      const inconnus = new Set<string>();
      for (const trouve of texte.matchAll(/\{\{([^{}]{1,60})\}\}/g)) {
        const cle = trouve[1];
        if (cle.startsWith("/")) continue;
        const nom = cle.replace(/^[#^]/, "");
        // Les champs d'une boucle sont fournis par ses éléments, non par la racine.
        const DANS_UNE_BOUCLE = ["RANG", "NATURE", "PARTIE", "OBJET", "MONTANT", "MODALITES",
          "CONCLUSION", "IS_MONTANT", "IS_MODALITES", "NOM", "PARTS", "LIBELLE", "SUITE"];
        if (DANS_UNE_BOUCLE.includes(nom)) continue;
        if (!fournis.has(nom)) inconnus.add(nom);
      }

      expect([...inconnus].sort(), "champs absents du domaine").toEqual([]);
    });
  }
});

describe("la déclaration de confidentialité", () => {
  it("atteste ce que la loi fait attester, et prévient du faux", () => {
    const texte = produire(contexte(), "comptes-confidentialite-micro.docx");

    expect(texte).toContain("micro-entreprises au sens de l'article L. 123-16-1");
    expect(texte).toContain("gestion des titres de participations");
    expect(texte).toContain("faux et un usage de faux");
    expect(texte).toContain("31 décembre 2025");
  });

  it("ne vise que le compte de résultat dans sa version petite entreprise", () => {
    const texte = produire(contexte(), "comptes-confidentialite-petite.docx");

    expect(texte).toContain("compte de résultat");
    expect(texte).toContain("petites entreprises au sens de l'article L. 123-16");
    expect(texte).not.toContain("micro-entreprises au sens");
  });
});
