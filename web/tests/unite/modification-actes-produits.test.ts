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
    /*
     * En tête d'acte, la forme ouvre une ligne d'identification : elle y prend sa
     * capitale, comme « Siège social » et « Immatriculée » qui la suivent. Ailleurs,
     * après une virgule, elle reste en bas de casse.
     */
    expect(texte).toContain("Société par actions simplifiée");
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

    for (const forme of ["SAS", "SASU", "SARL", "EURL", "SCI"]) {
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

describe("ce que le procès-verbal doit dire", () => {
  /*
   * Il tenait en une ligne par décision : « décide de réduire le capital de 15 000 à
   * 10 000 pour motif : Pertes ». Aucun ordre du jour, aucun article de statuts
   * désigné, aucune adoption constatée, et aucune des mentions qu'un greffe cherche -
   * le délai d'opposition des créanciers, le quitus du dirigeant sortant, la double
   * publication d'un transfert hors ressort.
   */
  const pv = (codes: string[], valeurs: Record<string, string | number>, forme = "SAS", villeRcsNouvelle?: string) =>
    produire(
      {
        societe: { ...SOCIETE, forme },
        assemblee: { date: "2026-08-01", associes: ASSOCIES },
        codes,
        valeurs,
        villeRcsNouvelle,
      },
      forme === "SASU"
        ? "modif-pv-transfert-siege-sasu.docx"
        : forme === "SARL"
          ? "modif-pv-transfert-siege-sarl.docx"
          : "modif-pv-transfert-siege-sas.docx"
    );

  it("annonce son ordre du jour avant de délibérer", () => {
    const texte = pv(["denomination"], { nouvelleDenomination: "ACME GROUPE" });
    expect(texte).toContain("ordre du jour suivant");
    expect(texte).toContain("Changement de dénomination");
    // La feuille de présence est ce qui permet de délibérer sans convocation.
    expect(texte).toContain("feuille de présence");
  });

  it("nomme l'article des statuts que chaque résolution modifie", () => {
    const texte = pv(["objet_social"], {
      nouvelObjetSocial: "Le conseil aux entreprises",
      dateEffetObjet: "2026-09-15",
    });
    expect(texte).toContain("L'article des statuts relatif à l'objet social est modifié");
  });

  it("constate l'adoption de chaque résolution", () => {
    const texte = pv(["denomination"], { nouvelleDenomination: "ACME GROUPE" });
    expect(texte).toContain("mise aux voix, est adoptée");
  });

  it("donne les pouvoirs au porteur, sans quoi rien ne se dépose", () => {
    const texte = pv(["denomination"], { nouvelleDenomination: "ACME GROUPE" });
    expect(texte).toContain("POUVOIRS POUR LES FORMALITÉS");
    expect(texte).toContain("porteur d'un original");
  });

  it("dit le délai d'opposition quand la réduction n'est pas motivée par des pertes", () => {
    const remboursement = pv(["reduction_capital"], {
      capitalActuelRed: 15000,
      nouveauCapitalRed: 10000,
      motifReduction: "Remboursement aux associés",
      nbPartsAnnulees: 500,
      dateEffetRed: "2026-09-15",
    });
    expect(remboursement).toContain("motivée par un remboursement aux associés");
    expect(remboursement).toContain("former opposition");

    // Motivée par des pertes, il n'y a pas d'opposition : la mention serait fausse.
    const pertes = pv(["reduction_capital"], {
      capitalActuelRed: 15000,
      nouveauCapitalRed: 10000,
      motifReduction: "Pertes",
      nbPartsAnnulees: 500,
      dateEffetRed: "2026-09-15",
    });
    expect(pertes).toContain("motivée par des pertes");
    expect(pertes).not.toContain("former opposition");
  });

  it("annonce la radiation et la double publication d'un transfert hors ressort", () => {
    const dehors = pv(
      ["transfert_siege"],
      {
        nouvelleAdresse: "5 avenue Victor Hugo",
        nouveauCodePostal: "69003",
        nouvelleVille: "Lyon",
        dateEffetTransfert: "2026-09-15",
      },
      "SAS",
      "Lyon"
    );
    expect(dehors).toContain("radiée du registre");
    expect(dehors).toContain("dans chacun de ces deux ressorts");

    // Dans le même ressort, ni radiation ni second avis : la mention serait fausse.
    const dedans = pv(
      ["transfert_siege"],
      {
        nouvelleAdresse: "12 boulevard Carnot",
        nouveauCodePostal: "06600",
        nouvelleVille: "Antibes",
        dateEffetTransfert: "2026-09-15",
      },
      "SAS",
      "Antibes"
    );
    expect(dedans).not.toContain("radiée du registre");
  });

  it("donne quitus au dirigeant démissionnaire", () => {
    const texte = pv(["dirigeant"], {
      typeChangementDirigeant: "Démission",
      dirigeantDemissionnaireNom: "Monsieur Paul BERNARD",
      fonctionDirigeant: "Président",
      dateEffetDirigeant: "2026-09-15",
    });
    expect(texte).toContain("quitus entier et sans réserve");
  });

  it("n'écrit un motif de révocation que s'il y en a un", () => {
    const sans = pv(["dirigeant"], {
      typeChangementDirigeant: "Révocation",
      dirigeantRevoqueNom: "Monsieur Paul BERNARD",
      fonctionDirigeant: "Président",
      dateEffetDirigeant: "2026-09-15",
    });
    // Le champ vide vaut « - » : la phrase sortait « Le motif est le suivant : - ».
    expect(sans).not.toContain("motif de cette révocation");

    const avec = pv(["dirigeant"], {
      typeChangementDirigeant: "Révocation",
      dirigeantRevoqueNom: "Monsieur Paul BERNARD",
      fonctionDirigeant: "Président",
      dateEffetDirigeant: "2026-09-15",
      motifRevocation: "Perte de confiance des actionnaires",
    });
    expect(avec).toContain("Perte de confiance des actionnaires");
  });

  it("n'écrit une prime d'émission que s'il y en a une", () => {
    const sans = pv(["augmentation_capital"], {
      capitalActuelAugm: 2000,
      nouveauCapitalAugm: 5000,
      modeAugmentation: "Apport en numéraire",
      nbPartsNouvelles: 3000,
      valeurNominaleAugm: 1,
      dateEffetAugm: "2026-09-15",
    });
    expect(sans).not.toContain("prime d'émission");

    const avec = pv(["augmentation_capital"], {
      capitalActuelAugm: 2000,
      nouveauCapitalAugm: 5000,
      modeAugmentation: "Apport en numéraire",
      nbPartsNouvelles: 3000,
      valeurNominaleAugm: 1,
      primeEmission: 500,
      dateEffetAugm: "2026-09-15",
    });
    expect(avec).toContain("prime d'émission de 500");
  });

  it("cite l'article 1844-6 pour une prorogation", () => {
    const texte = pv(["prorogation"], { dureeActuelle: 19, nouvelleDuree: 99 });
    expect(texte).toContain("1844-6");
  });

  it("emploie le mot que la forme impose pour les titres", () => {
    const sas = pv(["denomination"], { nouvelleDenomination: "ACME GROUPE" }, "SAS");
    expect(sas).toContain("actionnaires");
    expect(sas).not.toContain("parts sociales");

    const sarl = pv(["denomination"], { nouvelleDenomination: "ACME GROUPE" }, "SARL");
    expect(sarl).not.toContain("actionnaires");
    expect(sarl).not.toContain(" actions");
  });

  it("laisse un trait à signer sous chaque nom", () => {
    /*
     * Le gabarit écrivait « ____________ » dans un paragraphe à part, sous chaque
     * associé. La mise en page retire ces lignes-là - les actes de création tracent le
     * trait en bordure haute du nom - et le procès-verbal sortait avec des noms les uns
     * sous les autres et rien à signer. Le trait tient désormais au nom.
     */
    const brut = genererDocument(
      "modif-pv-transfert-siege-sas.docx",
      donneesDuGabarit({
        societe: SOCIETE,
        assemblee: { date: "2026-08-01", associes: ASSOCIES },
        codes: ["denomination"],
        valeurs: { nouvelleDenomination: "ACME GROUPE" },
      })
    );
    const PizZip = requerir("pizzip") as typeof import("pizzip");
    const xml = new PizZip(brut).file("word/document.xml")!.asText();

    // Un trait par signataire, et chacun dans le paragraphe de son nom.
    const traits = xml.match(/_{10,}/g) ?? [];
    expect(traits.length).toBe(ASSOCIES.length);
    for (const associe of ASSOCIES) {
      expect(xml).toMatch(
        new RegExp("_{10,}[\\s\\S]{0,200}?" + associe.nom + "[\\s\\S]{0,40}?</w:p>")
      );
    }
  });

  it("l'associé unique décide, sans assemblée ni mise aux voix", () => {
    const texte = pv(["denomination"], { nouvelleDenomination: "ACME GROUPE" }, "SASU");
    expect(texte).toContain("DÉCISION");
    expect(texte).toContain("registre des décisions de l'associé unique");
    expect(texte).not.toContain("mise aux voix");
    expect(texte).not.toContain("feuille de présence");
  });
});
