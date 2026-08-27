import { describe, it, expect } from "vitest";
import PizZip from "pizzip";
import { donneesDesComptes } from "@/domain/comptes/gabarit";
import { genererDocument } from "@/infrastructure/documents/generation";
import { verifierComptes } from "@/domain/comptes/verification";
import { fonctionsDuDirigeant } from "@/domain/formalite/formes";
import { donneesDuGabarit } from "@/domain/modification/gabarit";

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

  it("signe sous le titre du dirigeant, non sous un titre écrit en dur", () => {
    /*
     * Le modèle du cabinet est arrivé sous forme de rendu : sous le trait de signature,
     * « Gérant » y était écrit en toutes lettres. La déclaration d'une SELAS partait
     * donc au greffe avec un président en haut et un gérant en bas.
     */
    for (const [forme, titre, autre] of [
      ["SELAS", "Président", "Gérant"],
      ["SELARL", "Gérant", "Président"],
    ] as const) {
      const texte = rendre("comptes-confidentialite-micro.docx", {
        societe: { ...DOSSIER.societe, forme },
        valeurs: { ...DOSSIER.valeurs, dirigeantFonction: titre },
      });
      const signature = texte.slice(texte.lastIndexOf("Monsieur Paul DURAND"));
      expect(signature, forme).toContain(titre);
      expect(signature, forme).not.toContain(autre);
    }
  });

  it("porte un trait de signature, et un seul", () => {
    /*
     * Le trait vit dans le paragraphe du nom, séparé par un saut de ligne : seul, il
     * serait effacé à la génération, et une bordure de paragraphe courrait sur toute la
     * largeur du texte - ou, bornée par un retrait, couperait le nom en trois lignes.
     */
    const brut = new PizZip(
      genererDocument(
        "comptes-confidentialite-micro.docx",
        donneesDesComptes(DOSSIER as never)
      )
    )
      .file("word/document.xml")!
      .asText();
    expect(brut.match(/_{6,}/g) ?? []).toHaveLength(1);

    const paragraphes = brut.split("</w:p>");
    const celuiDuTrait = paragraphes.find((p) => /_{6,}/.test(p))!;
    expect(celuiDuTrait).toContain("Monsieur Paul DURAND");
    expect(celuiDuTrait).not.toContain("<w:pBdr");
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

describe("le titre écrit dans l'acte", () => {
  /**
   * Un dossier réglé avant que l'écran ne restreigne les choix garde son titre : la
   * vérification le retient désormais, mais elle ne peut plus rien sur ce qui est déjà
   * payé. L'acte, lui, ne doit jamais écrire un titre qui n'existe pas dans la forme -
   * une société d'exercice libéral par actions simplifiée s'est déposée « en qualité
   * d'associé unique et de Gérant ».
   *
   * Le repli ne corrige pas un choix possible : il ne joue que sur un titre impossible,
   * où l'ancienne valeur ne pouvait qu'être fausse.
   */
  it("remplace un titre impossible par celui de la forme", () => {
    const donnees = donneesDesComptes({
      ...DOSSIER,
      valeurs: { ...DOSSIER.valeurs, dirigeantFonction: "Gérant" },
    } as never);

    expect(donnees.DIRIGEANT_FONCTION).toBe("Président");
  });

  it("garde un titre que la forme admet", () => {
    const donnees = donneesDesComptes({
      ...DOSSIER,
      valeurs: { ...DOSSIER.valeurs, dirigeantFonction: "Directeur général" },
    } as never);

    expect(donnees.DIRIGEANT_FONCTION).toBe("Directeur général");
  });

  it("vaut aussi pour les actes de modification", () => {
    const contexte = (forme: string, fonction: string) => ({
      societe: {
        denomination: "CABINET ESSAI",
        forme,
        siren: "552100554",
        adresse: "8 place des Vosges",
        codePostal: "75004",
        ville: "Paris",
        capital: 20000,
      },
      assemblee: { date: "2026-06-15", totalParts: 100, associes: [] },
      codes: ["dirigeant"],
      valeurs: { fonctionDirigeant: fonction },
    });

    expect(donneesDuGabarit(contexte("SELAS", "Gérant") as never).FONCTION_DIRIGEANT).toBe(
      "Président"
    );
    expect(donneesDuGabarit(contexte("SELARL", "Président") as never).FONCTION_DIRIGEANT).toBe(
      "Gérant"
    );
    expect(donneesDuGabarit(contexte("SARL", "Co-gérant") as never).FONCTION_DIRIGEANT).toBe(
      "Co-gérant"
    );
  });
});

describe("l'heure de l'assemblée", () => {
  /**
   * Le champ annonce « 14 heures par défaut » et se saisit librement. Qui tapait « 14 »
   * obtenait « le 30 août 2026 à 14, » dans un acte déposé au greffe.
   */
  const heure = (saisie: unknown) =>
    donneesDesComptes({
      ...DOSSIER,
      valeurs: { ...DOSSIER.valeurs, heureAssemblee: saisie },
    } as never).HEURE_ASSEMBLEE;

  it("écrit les heures en toutes lettres", () => {
    expect(heure("14")).toBe("14 heures");
    expect(heure("9")).toBe("9 heures");
    expect(heure("1")).toBe("1 heure");
  });

  it("garde les minutes quand il y en a", () => {
    expect(heure("14h30")).toBe("14 heures 30");
    expect(heure("14:05")).toBe("14 heures 5");
    expect(heure("18 h 45")).toBe("18 heures 45");
  });

  it("ne retouche pas une heure déjà écrite", () => {
    expect(heure("14 heures")).toBe("14 heures");
    expect(heure("14 heures 30")).toBe("14 heures 30");
  });

  it("se replie sur l'heure d'usage quand rien n'est saisi", () => {
    expect(heure("")).toBe("14 heures");
    expect(heure(undefined)).toBe("14 heures");
  });

  it("laisse passer ce qu'elle ne sait pas lire", () => {
    /* « en fin de matinée » n'est pas une heure, mais c'est une réponse. */
    expect(heure("en fin de matinée")).toBe("en fin de matinée");
  });
});
