import { describe, it, expect } from "vitest";
import PizZip from "pizzip";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { genererDocument } from "@/infrastructure/documents/generation";
import { renumeroterLesResolutions } from "@/infrastructure/documents/resolutions";
import { donneesDeLaFermeture, type ContexteFermeture } from "@/domain/fermeture/gabarit";
import { actesDeLaFermeture, GABARITS_DE_FERMETURE } from "@/domain/fermeture/actes";

/**
 * Les actes d'une fermeture.
 *
 * Ce qu'ils doivent porter, et surtout ce qu'ils ne doivent pas : une majorité des trois
 * quarts dans une SAS qui n'y est pas soumise, un boni là où il y a un mali, un quitus
 * signé avant la première opération de liquidation.
 *
 * Les modèles qui circulent se trompent presque tous sur le premier point : ils
 * recopient la règle des SARL antérieures à 2005 pour toutes les formes.
 */

function texteDu(docx: Buffer): string {
  const xml = new PizZip(docx).file("word/document.xml")?.asText() ?? "";
  return xml
    .replace(/<[^>]+>/g, "")
    .replace(/[  ]/g, " ")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

const SOCIETE = {
  denomination: "ATELIER MERIDIEN",
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
  dateDissolution: "2026-03-10",
  heureDecision: "11 heures",
  lieuDecision: "au siège social",
  motifDissolution: "Cessation de l'activité",
  liquidateurCivilite: "Monsieur",
  liquidateurPrenom: "Jean",
  liquidateurNom: "DUPONT",
  liquidateurNeLe: "1980-05-04",
  liquidateurNeA: "Lyon (69)",
  liquidateurNationalite: "française",
  liquidateurPere: "Paul DUPONT",
  liquidateurMere: "Anne MARTIN",
  liquidateurAdresse: "8 avenue des Tilleuls, 75011 Paris",
  siegeDeLaLiquidation: "8 avenue des Tilleuls, 75011 Paris",
  dateCloture: "2026-11-20",
  dateArreteDesComptes: "2026-11-19",
  lieuCloture: "au siège de la liquidation",
  actifRealise: 60_000,
  passifApure: 30_000,
  fraisDeLiquidation: 2_000,
};

function contexte(sur: Partial<ContexteFermeture> = {}): ContexteFermeture {
  return {
    voie: sur.voie ?? "liquidation-amiable",
    societe: sur.societe ?? SOCIETE,
    associes: sur.associes ?? ASSOCIES,
    valeurs: sur.valeurs ?? VALEURS,
    aujourdHui: sur.aujourdHui,
  };
}

function produire(ctx: ContexteFermeture, gabarit: string): string {
  return texteDu(renumeroterLesResolutions(genererDocument(gabarit, donneesDeLaFermeture(ctx))));
}

describe("la décision de dissolution", () => {
  it("porte la dissolution, le liquidateur et le terme de son mandat", () => {
    const texte = produire(contexte(), "fermeture-pv-dissolution.docx");

    expect(texte).toContain("ATELIER MERIDIEN");
    expect(texte).toContain("10 mars 2026");
    expect(texte).toContain("Monsieur Jean DUPONT");
    expect(texte).toContain("société en liquidation");
    // Trois ans jour pour jour : c'est le terme légal du mandat.
    expect(texte).toContain("10 mars 2029");
    expect(texte).toContain("L. 237-2");
  });

  it("écrit la majorité de la forme, et non celle des SARL d'avant 2005", () => {
    /*
     * Le défaut le plus répandu des modèles en circulation. Une SAS ne connaît pas la
     * majorité des trois quarts : la loi renvoie à ses statuts, et l'unanimité s'impose
     * à défaut de clause.
     */
    const sas = produire(contexte(), "fermeture-pv-dissolution.docx");
    expect(sas).toContain("L. 227-9");
    expect(sas).not.toContain("trois quarts");

    const sarlRecente = produire(
      contexte({ societe: { ...SOCIETE, forme: "SARL" } }),
      "fermeture-pv-dissolution.docx"
    );
    expect(sarlRecente).toContain("deux tiers des parts");
    expect(sarlRecente).toContain("L. 223-30");

    const sarlAncienne = produire(
      contexte({
        societe: { ...SOCIETE, forme: "SARL" },
        valeurs: { ...VALEURS, sarlAvant2005: "Oui" },
      }),
      "fermeture-pv-dissolution.docx"
    );
    expect(sarlAncienne).toContain("trois quarts des parts sociales");
  });

  it("reprend la clause statutaire quand la loi y renvoie", () => {
    const texte = produire(
      contexte({
        valeurs: {
          ...VALEURS,
          majoriteStatutaire: "à la majorité des associés représentant les deux tiers du capital",
        },
      }),
      "fermeture-pv-dissolution.docx"
    );

    expect(texte).toContain("deux tiers du capital");
  });

  it("impose l'unanimité en société en nom collectif", () => {
    const texte = produire(
      contexte({ societe: { ...SOCIETE, forme: "SNC" } }),
      "fermeture-pv-dissolution.docx"
    );

    expect(texte).toContain("unanimité");
    expect(texte).toContain("L. 221-6");
  });

  it("numérote ses résolutions, et une décision d'associé unique ne délibère pas", () => {
    const assemblee = produire(contexte(), "fermeture-pv-dissolution.docx");
    expect(assemblee).toContain("PREMIÈRE RÉSOLUTION");
    expect(assemblee).toContain("CINQUIÈME RÉSOLUTION");

    const seul = produire(
      contexte({ societe: { ...SOCIETE, forme: "SASU" }, associes: [ASSOCIES[0]] }),
      "fermeture-decision-dissolution.docx"
    );
    expect(seul).toContain("PREMIÈRE DÉCISION");
    expect(seul).not.toContain("RÉSOLUTION");
    expect(seul).not.toContain("Sont présents");
  });
});

describe("les comptes définitifs et la clôture", () => {
  it("calculent le boni et le droit de partage", () => {
    // 60 000 - 30 000 - 2 000 = 28 000 d'actif net, dont 10 000 de capital : 18 000 de boni.
    const comptes = produire(contexte(), "fermeture-comptes-de-liquidation.docx");

    expect(comptes).toContain("28 000 euros");
    expect(comptes).toContain("Boni de liquidation : 18 000 euros");
    // 2,5 % de l'actif net partagé, non du seul boni : 700 euros.
    expect(comptes).toContain("700 euros");
    expect(comptes).toContain("746 du code général des impôts");
  });

  it("écrivent un mali comme un mali, sans droit de partage inventé", () => {
    const maigre = {
      ...VALEURS,
      actifRealise: 12_000,
      passifApure: 8_000,
      fraisDeLiquidation: 1_000,
    };
    const texte = produire(contexte({ valeurs: maigre }), "fermeture-comptes-de-liquidation.docx");

    expect(texte).toContain("Mali de liquidation : 7 000 euros");
    expect(texte).not.toContain("Boni de liquidation");
  });

  it("ne réclament aucun droit de partage à un associé unique", () => {
    /*
     * On ne partage pas avec soi-même. Le droit de l'article 746 suppose une pluralité
     * de copartageants : le facturer à une SASU serait une dépense inventée.
     */
    const texte = produire(
      contexte({ societe: { ...SOCIETE, forme: "SASU" }, associes: [ASSOCIES[0]] }),
      "fermeture-comptes-de-liquidation.docx"
    );

    expect(texte).toContain("Boni de liquidation");
    expect(texte).not.toContain("droit de partage");
  });

  it("donnent quitus et prononcent la clôture", () => {
    const texte = produire(contexte(), "fermeture-pv-cloture.docx");

    expect(texte).toContain("20 novembre 2026");
    expect(texte).toContain("quitus entier et sans réserve");
    expect(texte).toContain("clôture des opérations de liquidation");
    expect(texte).toContain("radiée du registre du commerce");
  });

  it("le rapport du liquidateur rend compte et propose", () => {
    const texte = produire(contexte(), "fermeture-rapport-liquidateur.docx");

    expect(texte).toContain("Monsieur Jean DUPONT");
    expect(texte).toContain("60 000 euros");
    expect(texte).toContain("attestations de régularité fiscale et de vigilance");
    expect(texte).toContain("161 du code général des impôts");
  });
});

describe("la déclaration du liquidateur", () => {
  it("porte la filiation, sans laquelle le registre la refuse", () => {
    const texte = produire(contexte(), "fermeture-declaration-liquidateur.docx");

    expect(texte).toContain("Paul DUPONT");
    expect(texte).toContain("Anne MARTIN");
    expect(texte).toContain("m'interdire d'exercer une activité commerciale");
    expect(texte).toContain("441-1");
  });
});

describe("la dissolution sans liquidation", () => {
  const TUP: Record<string, string | number> = {
    dateDissolution: "2026-03-10",
    associeDenomination: "HOLDING MERIDIEN",
    associeForme: "société par actions simplifiée",
    associeSiren: "902345678",
    associeCapital: 50_000,
    associeSiege: "3 rue du Louvre, 75001 Paris",
    associeRepresentant: "Madame Claire MARTIN, présidente",
    publicationBodacc: "2026-03-20",
  };

  it("vise l'article 1844-5 et annonce le délai d'opposition", () => {
    const texte = produire(
      contexte({ voie: "tup", valeurs: TUP, associes: [] }),
      "fermeture-tup-decision.docx"
    );

    expect(texte).toContain("HOLDING MERIDIEN");
    expect(texte).toContain("1844-5 alinéa 3");
    expect(texte).toContain("transmission universelle du patrimoine");
    expect(texte).toContain("trente jours");
    expect(texte).toContain("Bulletin officiel des annonces civiles et commerciales");
    // Elle ne nomme aucun liquidateur : il n'y a pas de liquidation.
    expect(texte).not.toContain("liquidateur");
  });

  it("l'attestation compte le délai depuis le BODACC, et le proroge s'il le faut", () => {
    /*
     * Parution le 20 mars 2026 : le délai court du 21, expire le 19 avril - un dimanche -
     * donc au lundi 20 avril, et la transmission intervient le 21.
     */
    const texte = produire(
      contexte({ voie: "tup", valeurs: TUP, associes: [] }),
      "fermeture-tup-attestation.docx"
    );

    expect(texte).toContain("20 mars 2026");
    expect(texte).toContain("20 avril 2026");
    expect(texte).toContain("21 avril 2026");
    expect(texte).toContain("aucune opposition");
  });
});

describe("les actes à produire", () => {
  it("séparent la dissolution de la clôture", () => {
    const dissolution = actesDeLaFermeture({
      voie: "liquidation-amiable",
      phase: "dissolution",
      unipersonnelle: false,
    });
    expect(dissolution.map((a) => a.gabarit)).toEqual([
      "fermeture-pv-dissolution.docx",
      "fermeture-declaration-liquidateur.docx",
      "fermeture-pouvoir.docx",
    ]);
    // Le quitus ne se signe pas avant la première opération de liquidation.
    expect(dissolution.map((a) => a.gabarit)).not.toContain("fermeture-pv-cloture.docx");

    const cloture = actesDeLaFermeture({
      voie: "liquidation-amiable",
      phase: "cloture",
      unipersonnelle: false,
    });
    expect(cloture.map((a) => a.gabarit)).toEqual([
      "fermeture-comptes-de-liquidation.docx",
      "fermeture-rapport-liquidateur.docx",
      "fermeture-pv-cloture.docx",
    ]);
  });

  it("choisissent la forme unipersonnelle quand il n'y a qu'un associé", () => {
    const actes = actesDeLaFermeture({
      voie: "liquidation-amiable",
      phase: "dissolution",
      unipersonnelle: true,
    });
    expect(actes.map((a) => a.gabarit)).toContain("fermeture-decision-dissolution.docx");
    expect(actes.map((a) => a.gabarit)).not.toContain("fermeture-pv-dissolution.docx");
  });

  it("n'attestent la transmission qu'une fois le délai écoulé", () => {
    const pendant = actesDeLaFermeture({
      voie: "tup",
      phase: "dissolution",
      unipersonnelle: true,
      oppositionEcoulee: false,
    });
    expect(pendant.map((a) => a.gabarit)).not.toContain("fermeture-tup-attestation.docx");

    const apres = actesDeLaFermeture({
      voie: "tup",
      phase: "dissolution",
      unipersonnelle: true,
      oppositionEcoulee: true,
    });
    expect(apres.map((a) => a.gabarit)).toContain("fermeture-tup-attestation.docx");
  });
});

describe("la couverture des gabarits", () => {
  /*
   * Le contrat avec les documents Word.
   *
   * Un champ que le domaine ne fournit pas ne fait rien échouer : il laisse un blanc au
   * milieu d'un acte, à l'endroit exact où un montant ou une date devrait être.
   */
  const GABARITS = path.join(process.cwd(), "..", "templates");
  const fichiers = readdirSync(GABARITS).filter((f) => f.startsWith("fermeture-"));
  const fournis = new Set(Object.keys(donneesDeLaFermeture(contexte())));

  it("les dix gabarits sont là, et le domaine les nomme tous", () => {
    expect(fichiers.sort()).toEqual([...GABARITS_DE_FERMETURE].sort());
  });

  for (const fichier of fichiers) {
    it(fichier + " ne demande rien que le domaine ne donne", () => {
      const xml = new PizZip(readFileSync(path.join(GABARITS, fichier)))
        .file("word/document.xml")!
        .asText();
      const texte = xml.replace(/<[^>]+>/g, "");

      // Les champs d'une boucle sont fournis par ses éléments, non par la racine.
      const DANS_UNE_BOUCLE = ["NOM", "PARTS"];

      const inconnus = new Set<string>();
      for (const trouve of texte.matchAll(/\{\{([^{}]{1,60})\}\}/g)) {
        const cle = trouve[1];
        if (cle.startsWith("/")) continue;
        const nom = cle.replace(/^[#^]/, "");
        if (DANS_UNE_BOUCLE.includes(nom)) continue;
        if (!fournis.has(nom)) inconnus.add(nom);
      }

      expect([...inconnus].sort(), "champs absents du domaine").toEqual([]);
    });
  }
});
