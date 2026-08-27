import { describe, it, expect } from "vitest";
import PizZip from "pizzip";
import { donneesDesComptes } from "@/domain/comptes/gabarit";
import { genererDocument } from "@/infrastructure/documents/generation";
import { verifierComptes } from "@/domain/comptes/verification";
import { fonctionsDuDirigeant } from "@/domain/formalite/formes";

/**
 * La déclaration de confidentialité, telle qu'elle part au greffe.
 *
 * Elle est signée sur l'honneur, et une fausse déclaration est un faux : ce qu'elle
 * porte doit être exact jusqu'au titre de celui qui signe. Le modèle du cabinet a servi
 * de source, et il est arrivé sous la forme d'un rendu - avec les données d'une société
 * réelle. Une valeur oubliée dans la reprise partirait donc au greffe sous le nom d'un
 * autre, et c'est ce que ces essais surveillent d'abord.
 *
 * Second point : une société par actions a un président, une société à responsabilité
 * limitée un gérant. Le titre n'est pas au choix, et l'écran offrait pourtant les quatre
 * à tout le monde - une SELAS s'y est déposée « en sa qualité de Gérant ».
 */

function texteDu(docx: Buffer): string {
  return new PizZip(docx)
    .file("word/document.xml")!
    .asText()
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/[  ]/g, " ");
}

const DOSSIER = {
  societe: {
    denomination: "CABINET LAUGIER",
    forme: "SELAS",
    siren: "552100554",
    adresse: "8 place des Vosges",
    codePostal: "75004",
    ville: "Paris",
    villeRcs: "Paris",
    capital: 37500,
  },
  associes: [{ civilite: "Monsieur", prenom: "Paul", nom: "DURAND", parts: 100 }],
  valeurs: {
    dateOuverture: "2025-01-01",
    dateCloture: "2025-12-31",
    dateAssemblee: "2026-06-15",
    dirigeantCivilite: "Monsieur",
    dirigeantPrenom: "Paul",
    dirigeantNomFamille: "DURAND",
    dirigeantFonction: "Président",
    commissaireAuxComptes: "Non",
    resultat: 10000,
    reportAnterieur: 0,
    reserveLegale: 0,
    totalBilan: 120000,
  },
  affectation: {
    reserveLegaleCentimes: 50000,
    autresReservesCentimes: 0,
    dividendesCentimes: 0,
    reportANouveauCentimes: 950000,
  },
  conventions: [],
  exclusions: [],
  demandeLaConfidentialite: true,
};

function rendre(gabarit: string, sur: Record<string, unknown> = {}): string {
  const dossier = { ...DOSSIER, ...sur };
  return texteDu(genererDocument(gabarit, donneesDesComptes(dossier as never)));
}

describe("la déclaration de confidentialité", () => {
  const gabarits = [
    ["comptes-confidentialite-micro.docx", "micro"],
    ["comptes-confidentialite-petite.docx", "petite"],
  ] as const;

  it.each(gabarits)("ne garde aucune donnée du modèle dans %s", (gabarit) => {
    const texte = rendre(gabarit);

    /* La société qui a servi au rendu du modèle, et tout ce qui la désignait. */
    for (const reste of [
      "STERLING",
      "rue Laugier",
      "899 979 934",
      "sqf",
      "qsf",
      "20 000 euros",
      "14 août 2026",
      "30 août 2026",
    ]) {
      expect(texte, reste).not.toContain(reste);
    }
  });

  it.each(gabarits)("porte les données du dossier dans %s", (gabarit) => {
    const texte = rendre(gabarit);

    expect(texte).toContain("CABINET LAUGIER");
    expect(texte).toContain("8 place des Vosges");
    expect(texte).toContain("552 100 554");
    expect(texte).toContain("Monsieur Paul DURAND");
    expect(texte).toContain("31 décembre 2025");
    expect(texte).toContain("37 500 euros");
    /* Aucune variable non remplacée : le greffe lirait les accolades. */
    expect(texte).not.toMatch(/\{\{|\}\}/);
  });

  it("dit « Président » pour une société par actions", () => {
    const texte = rendre("comptes-confidentialite-micro.docx");
    expect(texte).toContain("en sa qualité de Président");
    expect(texte).not.toContain("qualité de Gérant");
  });

  it("dit « Gérant » pour une société à responsabilité limitée", () => {
    const texte = rendre("comptes-confidentialite-micro.docx", {
      societe: { ...DOSSIER.societe, forme: "SELARL" },
      valeurs: { ...DOSSIER.valeurs, dirigeantFonction: "Gérant" },
    });
    expect(texte).toContain("en sa qualité de Gérant");
    expect(texte).not.toContain("qualité de Président");
  });

  it("nomme la forme au long, non son sigle", () => {
    expect(rendre("comptes-confidentialite-micro.docx")).toContain(
      "société d'exercice libéral par actions simplifiée"
    );
  });

  it("distingue les deux portées", () => {
    const micro = rendre("comptes-confidentialite-micro.docx");
    expect(micro).toContain("les comptes annuels de l'exercice clos");
    expect(micro).toContain("micro-entreprises au sens de l'article L. 123-16-1");
    expect(micro).toContain("gestion des titres de participations");

    const petite = rendre("comptes-confidentialite-petite.docx");
    expect(petite).toContain("le compte de résultat de l'exercice clos");
    expect(petite).toContain("petites entreprises au sens de l'article L. 123-16 ");
    /* Cette attestation ne vise que la micro-entreprise : la lui faire signer serait faux. */
    expect(petite).not.toContain("gestion des titres de participations");
  });
});

describe("la fonction du dirigeant", () => {
  it("suit la forme de la société", () => {
    for (const forme of ["SAS", "SASU", "SELAS", "SA", "SELAFA", "SPFPL SAS"]) {
      expect(fonctionsDuDirigeant(forme), forme).toContain("Président");
      expect(fonctionsDuDirigeant(forme), forme).not.toContain("Gérant");
    }
    for (const forme of ["SARL", "EURL", "SELARL", "SCI", "SCP", "SNC", "SCA"]) {
      expect(fonctionsDuDirigeant(forme), forme).toContain("Gérant");
      expect(fonctionsDuDirigeant(forme), forme).not.toContain("Président");
    }
  });

  it("refuse un titre qui n'existe pas dans cette forme", () => {
    /*
     * Un dossier commencé avant que l'écran ne restreigne la liste garde son titre : le
     * contrôle le retient ici, où il retient aussi le règlement.
     */
    const anomalies = verifierComptes({
      ...DOSSIER,
      valeurs: { ...DOSSIER.valeurs, dirigeantFonction: "Gérant" },
    } as never);

    const refus = anomalies.find((a) => a.champ === "dirigeantFonction");
    expect(refus?.message).toContain("SELAS");
    expect(refus?.message).toContain("gérant");
  });

  it("laisse passer un titre qui convient", () => {
    const anomalies = verifierComptes(DOSSIER as never);
    expect(anomalies.find((a) => a.champ === "dirigeantFonction")).toBeUndefined();
  });
});
