import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import path from "node:path";
import { readFileSync } from "node:fs";
import { actesAProduire, donneesDuGabarit } from "@/domain/modification/gabarit";
import { genererDocument } from "@/infrastructure/documents/generation";
import { renumeroterLesResolutions } from "@/infrastructure/documents/resolutions";
import { typographierLeDocument } from "@/infrastructure/documents/typographie-docx";
import { fautesDeTypographie, FINE, INSECABLE } from "@/domain/document/typographie";

const requerir = createRequire(import.meta.url);

/**
 * Les actes tels qu'ils sortent, lus dans le document produit.
 *
 * Deux documents d'un dossier réel portaient « prendra effet à compter du - », « au RCS
 * de Antibes », « 2000 parts », « Article 1 — Objet », et une décision d'associé unique
 * qui listait deux associés. Rien de tout cela ne se voyait sur un gabarit : il faut
 * ouvrir ce qui est produit.
 */

function texteDe(docx: Buffer): string {
  const PizZip = requerir("pizzip") as typeof import("pizzip");
  const xml = new PizZip(docx).file("word/document.xml")!.asText();
  return xml
    .replace(/<w:p[ >]/g, "\n<w:p ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&apos;/g, "'");
}

const SOCIETE = {
  denomination: "LES GREMLINS",
  forme: "SAS",
  siren: "535116362",
  adresse: "861 chemin de l'Espagnol 06250 Mougins",
  codePostal: "06250",
  ville: "Mougins",
  capital: 2000,
  villeRcs: "Antibes",
};

const ASSOCIES = [
  { prenom: "Jean", nom: "DUPONT", parts: 1500 },
  { prenom: "Marie", nom: "MARTIN", parts: 500 },
];

function produire(contexte: Parameters<typeof donneesDuGabarit>[0], gabarit: string): string {
  const chemin = path.join(process.cwd(), "..", "templates", gabarit);
  readFileSync(chemin); // lève clairement si le gabarit manque
  const rendu = typographierLeDocument(
    renumeroterLesResolutions(genererDocument(gabarit, donneesDuGabarit(contexte)))
  );
  return texteDe(rendu);
}

describe("le procès-verbal produit", () => {
  const contexte = {
    societe: SOCIETE,
    assemblee: { date: "2026-08-01", associes: ASSOCIES },
    codes: ["transfert_siege", "prorogation"],
    valeurs: {
      nouvelleAdresse: "5 avenue Victor Hugo",
      nouveauCodePostal: "69003",
      nouvelleVille: "Lyon",
      dateEffetTransfert: "2026-09-15",
      dureeActuelle: 19,
      nouvelleDuree: 99,
    },
  };

  const texte = produire(contexte, "modif-pv-transfert-siege-sas.docx");

  it("ne porte aucune faute de typographie", () => {
    expect(fautesDeTypographie(texte)).toEqual([]);
  });

  it("lie les nombres à leur unité", () => {
    // Un montant coupé en fin de ligne se relit mal dans un acte signé.
    expect(texte).toContain("2" + INSECABLE + "000" + INSECABLE + "euros");
    expect(texte).toContain(FINE + ":");
  });

  it("ne répète pas la ville dans l'adresse", () => {
    expect(texte).not.toContain("Mougins, 06250 Mougins");
  });

  it("numérote les résolutions quand il y en a plusieurs", () => {
    expect(texte).toContain("PREMIÈRE RÉSOLUTION");
    expect(texte).toContain("DEUXIÈME RÉSOLUTION");
    expect(texte).not.toContain("RÉSOLUTION UNIQUE");
  });

  it("ne laisse aucun champ non résolu", () => {
    expect(texte).not.toMatch(/\{\{|\}\}/);
  });

  it("ne porte que les résolutions décidées", () => {
    /*
     * Le garde-fou qui manquait.
     *
     * Les sections du gabarit s'écrivent avec les délimiteurs configurés : posées en
     * simples accolades, elles ne filtrent plus rien et toutes les résolutions
     * sortent - un procès-verbal qui décide une réduction de capital que personne n'a
     * demandée. Vérifier la présence ne suffit pas : il faut vérifier l'absence.
     */
    expect(texte).toContain("TRANSFERT DU SIÈGE");
    expect(texte).toContain("PROROGATION");
    expect(texte).not.toContain("RÉDUCTION DU CAPITAL");
    expect(texte).not.toContain("DÉNOMINATION");
    expect(texte).not.toContain("OBJET SOCIAL");
    expect(texte).not.toContain("CHANGEMENT DE DIRIGEANT");
  });
});

describe("l'acte de cession produit", () => {
  const texte = produire(
    {
      societe: SOCIETE,
      assemblee: { date: "2026-08-01", associes: ASSOCIES },
      codes: ["cession_parts"],
      valeurs: {},
      cessions: [
        {
          cedant: 0,
          parts: 200,
          prix: 20000,
          date: "2026-09-15",
          vers: "tiers" as const,
          nom: "Paul BERNARD",
        },
      ],
    },
    "modif-acte-cession.docx"
  );

  it("porte la date de la cession, non un tiret", () => {
    expect(texte).toContain("15 septembre 2026");
    expect(texte).not.toContain("à compter du -");
  });

  it("écrit la forme en clair et élide le registre", () => {
    expect(texte).toContain("société par actions simplifiée");
    expect(texte).toContain("d'Antibes");
    expect(texte).not.toContain("de Antibes");
  });

  it("porte les clauses qui protègent les parties", () => {
    /*
     * L'ancien acte tenait en quatre articles - objet, prix, date, formalités - sans
     * garantie d'éviction, sans déclarations, sans agrément, sans opposabilité.
     */
    for (const clause of [
      "Propriété et jouissance",
      "Agrément",
      "Déclarations du Cédant",
      "Déclarations du Cessionnaire",
      "Opposabilité",
      "Droits d'enregistrement",
      "Élection de domicile",
    ]) {
      expect(texte, clause).toContain(clause);
    }
    expect(texte).toContain("éviction");
  });

  it("dit l'agrément qui convient, et un seul", () => {
    // Une SAS sans clause : l'agrément n'est pas de droit, et l'acte le dit ainsi.
    expect(texte).toContain("n'est soumise à aucune procédure d'agrément");
    expect(texte).not.toContain("a été agréée par les associés");
  });

  it("ne porte ni quadratin ni champ non résolu", () => {
    expect(fautesDeTypographie(texte)).toEqual([]);
    expect(texte).not.toMatch(/\{\{|\}\}/);
  });
});

describe("chaque gabarit encore produit", () => {
  it("se rend sans erreur, quels que soient les changements", () => {
    /*
     * Le garde-fou qui manquait.
     *
     * Une balise mal formée - simple accolade là où le moteur en attend deux, ou
     * l'inverse - ne se voit pas à la lecture du gabarit : elle ne se manifeste qu'au
     * rendu, par une erreur serveur au moment où l'avocat clique sur « Produire les
     * actes ». Ce test rend chaque gabarit avec tous les cas cochés à la fois.
     */
    const tous = [
      "transfert_siege",
      "denomination",
      "objet_social",
      "dirigeant",
      "augmentation_capital",
      "reduction_capital",
      "cession_parts",
      "prorogation",
    ];

    for (const forme of ["SAS", "SASU", "SARL", "SCI"]) {
      const actes = actesAProduire(tous, forme, { typeChangementDirigeant: "Nomination" }, 2);
      expect(actes.length, forme).toBeGreaterThan(0);

      for (const acte of actes) {
        const rendu = () =>
          typographierLeDocument(
            renumeroterLesResolutions(
              genererDocument(
                acte.gabarit,
                donneesDuGabarit({
                  societe: { ...SOCIETE, forme },
                  assemblee: { date: "2026-08-01", associes: ASSOCIES },
                  codes: tous,
                  valeurs: { typeChangementDirigeant: "Nomination", modeAugmentation: "Apport en nature" },
                })
              )
            )
          );
        expect(rendu, forme + " / " + acte.gabarit).not.toThrow();
      }
    }
  });
});
