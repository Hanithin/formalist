import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import PizZip from "pizzip";
import { genererDocument } from "@/infrastructure/documents/generation";
import { documentsAProduire } from "@/domain/formalite/documents";
import { donneesDeGabarit } from "@/domain/formalite/gabarit";
import { actesAProduire, donneesDuGabarit, MODELE_POUVOIR, MODELE_SIEGES_ANTERIEURS } from "@/domain/modification/gabarit";
import { actesDeLaFermeture } from "@/domain/fermeture/actes";
import type { Brouillon } from "@/domain/formalite/parcours";

/**
 * Le pouvoir et l'état des sièges antérieurs, rendus.
 *
 * Deux documents qu'aucun test unitaire ne couvre entièrement : l'un doit sortir des
 * trois parcours avec les mêmes mots, l'autre ne doit sortir que d'un transfert qui
 * change de greffe. Ce qui compte ici est ce qui se lit sur la page.
 */

const GABARITS = path.join(process.cwd(), "..", "templates");

/* Le texte d'un docx : les balises XML retirées, les espaces insécables ramenées. */
function texteDu(gabarit: string, donnees: Record<string, unknown>): string {
  const xml =
    new PizZip(genererDocument(gabarit, donnees)).file("word/document.xml")?.asText() ?? "";
  return xml
    .replace(/<[^>]+>/g, "")
    .replace(/[\u00a0\u202f]/g, " ")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

describe("les gabarits existent", () => {
  it("le pouvoir et l'état des sièges sont sur le disque", () => {
    expect(existsSync(path.join(GABARITS, MODELE_POUVOIR))).toBe(true);
    expect(existsSync(path.join(GABARITS, MODELE_SIEGES_ANTERIEURS))).toBe(true);
  });
});

describe("le pouvoir sort des trois parcours", () => {
  it("est produit à la création, sous un gabarit commun aux formes", () => {
    for (const forme of ["SAS", "SASU", "SARL", "EURL", "SCI"]) {
      const documents = documentsAProduire({ forme, aUnDirigeant: true });
      const pouvoir = documents.find((d) => d.type === "pouvoir");
      expect(pouvoir, forme + " sans pouvoir").toBeDefined();
      expect(pouvoir?.gabarit).toBe("pouvoir.docx");
    }
  });

  it("est produit à la modification, en dernier", () => {
    const actes = actesAProduire(["denomination"], "SAS", {}, 2);
    expect(actes[actes.length - 1].gabarit).toBe(MODELE_POUVOIR);
  });

  it("est produit à la dissolution", () => {
    const actes = actesDeLaFermeture({
      voie: "liquidation-amiable",
      phase: "dissolution",
      unipersonnelle: false,
    });
    expect(actes.map((a) => a.gabarit)).toContain(MODELE_POUVOIR);
  });
});

describe("le pouvoir, une fois rempli", () => {
  const brouillon: Brouillon = {
    forme: "SASU",
    denomination: "BOOSKA-PLUS",
    capital: 1000,
    adresse: "34 Rue Laugier",
    codePostal: "75017",
    ville: "Paris",
    associes: [
      {
        type: "physique",
        personne: {
          civilite: "Monsieur",
          prenom: "Finagnon",
          nom: "TOBOSSI",
          dateDeNaissance: "1983-08-15",
          villeDeNaissance: "Évry-Courcouronnes",
          codePostalDeNaissance: "91080",
          nationalite: "française",
          adresse: "34 Rue Laugier",
          codePostal: "75017",
          ville: "Paris",
        },
      },
    ],
    dirigeants: [{ associe: 0, fonction: "Président" }],
  } as unknown as Brouillon;

  const texte = texteDu(
    "pouvoir.docx",
    donneesDeGabarit(brouillon, { maintenant: new Date("2026-08-24T10:00:00Z") })
  );

  it("nomme le mandant et le mandataire", () => {
    expect(texte).toContain("Finagnon");
    expect(texte).toContain("né le 15 août 1983 à Évry-Courcouronnes (91080)");
    expect(texte).toContain("Monsieur Hani MADFAI");
    expect(texte).toContain("né le 12 avril 1985 à Tournon (07300)");
  });

  it("borne le pouvoir à la création, et le dit", () => {
    expect(texte).toContain("la création");
    expect(texte).toContain("valable exclusivement pour la formalité susvisée");
  });

  /* Le siège d'une société qui n'existe pas encore n'est pas encore le sien. */
  it("dit le siège « envisagé » à la constitution", () => {
    expect(texte).toContain("Siège social envisagé : 34 Rue Laugier, 75017 Paris");
  });

  /* Et une société en constitution n'a pas de registre à annoncer. */
  it("ne montre pas de registre sans numéro", () => {
    expect(texte).not.toContain("Immatriculée au RCS");
  });

  /*
   * La situation matrimoniale a sa place dans des statuts - un apport de bien commun
   * appelle l'accord du conjoint - et aucune dans un pouvoir.
   */
  it("ne dit pas si le mandant est marié", () => {
    expect(texte).not.toMatch(/célibataire|marié/);
  });

  it("vise le guichet unique et FranceConnect+", () => {
    expect(texte).toContain("Guichet Unique");
    expect(texte).toContain("FranceConnect+");
  });

  it("ne laisse aucune balise non remplie", () => {
    expect(texte).not.toMatch(/\{\{|\}\}/);
  });
});

describe("l'état des sièges antérieurs", () => {
  const societe = {
    denomination: "GREMLINS COMMUNICATION",
    forme: "SASU",
    siren: "908221138",
    capital: 1000,
    adresse: "10 Rue De Penthièvre",
    codePostal: "75008",
    ville: "Paris",
    villeRcs: "Paris",
  };

  const valeurs = {
    nouvelleAdresse: "12 Rue Lecourbe",
    nouveauCodePostal: "69003",
    nouvelleVille: "Lyon",
    dateEffetTransfert: "2026-09-01",
    siegeDepuisLe: "2021-06-14",
    siegesAnterieurs: "3 rue de Rivoli, 75001 Paris, greffe de Paris, du 3 mars 2018 au 14 juin 2021",
    signataireCivilite: "Monsieur",
    signatairePrenom: "Jean",
    signataireNom: "DUPONT",
    signataireNeLe: "1980-02-03",
    signataireNeA: "Lyon (69003)",
    signataireNationalite: "française",
    signataireAdresse: "5 rue de la Paix, 75002 Paris",
  };

  /*
   * L'article R.123-110 ne vise que le transfert hors du ressort : un déménagement
   * dans la même ville ne change pas de greffe, et rien n'est à relier.
   */
  it("n'est produit que lorsque le greffe change", () => {
    const horsRessort = actesAProduire(["transfert_siege"], "SASU", valeurs, 1, [], true);
    expect(horsRessort.map((a) => a.gabarit)).toContain(MODELE_SIEGES_ANTERIEURS);

    const memeRessort = actesAProduire(["transfert_siege"], "SASU", valeurs, 1, [], false);
    expect(memeRessort.map((a) => a.gabarit)).not.toContain(MODELE_SIEGES_ANTERIEURS);
  });

  const texte = texteDu(
    MODELE_SIEGES_ANTERIEURS,
    donneesDuGabarit({
      societe,
      assemblee: { date: "2026-09-01", associes: [] },
      codes: ["transfert_siege"],
      valeurs,
      villeRcsNouvelle: "Lyon",
    })
  );

  it("ouvre la liste sur le siège que la société quitte", () => {
    expect(texte).toContain("10 Rue De Penthièvre, 75008 Paris");
    expect(texte).toContain("greffe de Paris");
    /* Le greffe veut deux bornes : la fin d'occupation est la date d'effet. */
    expect(texte).toContain("du 14 juin 2021 au 1er septembre 2026");
  });

  it("reprend les sièges plus anciens saisis, un par ligne", () => {
    expect(texte).toContain("3 rue de Rivoli, 75001 Paris");
  });

  it("vise le texte, identifie la société et certifie", () => {
    expect(texte).toContain("R.123-110");
    expect(texte).toContain("GREMLINS COMMUNICATION");
    expect(texte).toContain("Immatriculée au RCS de Paris sous le numéro 908 221 138");
    expect(texte).toContain("Certifié conforme");
  });

  it("nomme le représentant légal qui signe", () => {
    expect(texte).toContain("Monsieur Jean DUPONT");
    expect(texte).toContain("né le 3 février 1980 à Lyon (69003)");
  });

  it("ne laisse aucune balise non remplie", () => {
    expect(texte).not.toMatch(/\{\{|\}\}/);
  });
});
