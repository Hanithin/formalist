import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import PizZip from "pizzip";
import { genererDocument } from "@/infrastructure/documents/generation";
import { typographierLeDocument } from "@/infrastructure/documents/typographie-docx";
import { documentsAProduire, piecesAttendues } from "@/domain/formalite/documents";
import { donneesDeGabarit } from "@/domain/formalite/gabarit";
import { pieceDuSiege } from "@/domain/guichet/pieces";
import { contenuDeLaCreation } from "@/domain/guichet/creation";
import type { Brouillon } from "@/domain/formalite/parcours";

/**
 * Les quatre façons de domicilier une société qui naît.
 *
 * Elles n'appellent ni les mêmes actes ni les mêmes pièces, et se tromper ne se voit
 * qu'au greffe : une attestation de mise à disposition du domicile du dirigeant sur un
 * dossier sous bail commercial affirme un fait qui n'est pas le sien, et une
 * domiciliation au cabinet déclarée comme agréée annonce un agrément qui n'existe pas.
 */

function texteDu(gabarit: string, donnees: Record<string, unknown>): string {
  const xml =
    new PizZip(typographierLeDocument(genererDocument(gabarit, donnees)))
      .file("word/document.xml")
      ?.asText() ?? "";
  return xml
    .replace(/<[^>]+>/g, "")
    .replace(/[  ]/g, " ")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

const BROUILLON: Brouillon = {
  forme: "SASU",
  denomination: "LA META PROD",
  capital: 1000,
  adresse: "34 rue Laugier",
  codePostal: "75017",
  ville: "Paris",
  associes: [
    {
      type: "physique",
      personne: {
        civilite: "Monsieur",
        prenom: "Nicola",
        nom: "GRAVINESE",
        dateDeNaissance: "1980-04-02",
        villeDeNaissance: "Nice",
        codePostalDeNaissance: "06000",
        nationalite: "française",
        adresse: "5 rue de la Paix",
        codePostal: "75002",
        ville: "Paris",
      },
    },
  ],
  dirigeants: [{ associe: 0, fonction: "Président" }],
} as unknown as Brouillon;

describe("les actes produits selon la domiciliation", () => {
  const typesPour = (modeDomiciliation: Brouillon["modeDomiciliation"]) =>
    documentsAProduire({ forme: "SASU", aUnDirigeant: true, modeDomiciliation }).map(
      (d) => d.type
    );

  /*
   * L'attestation du dirigeant sortait sur tous les dossiers - y compris ceux sous bail
   * commercial, où elle certifiait une mise à disposition qui n'avait pas lieu.
   */
  it("ne produit l'attestation du dirigeant que chez lui", () => {
    expect(typesPour("Domicile personnel du dirigeant")).toContain("attestation-domicile");
    expect(typesPour("Bail commercial ou professionnel")).not.toContain("attestation-domicile");
    expect(typesPour("Société de domiciliation")).not.toContain("attestation-domicile");
  });

  it("produit celle du cabinet quand c'est lui qui héberge", () => {
    expect(typesPour("Domiciliation au cabinet")).toContain("attestation-cabinet");
    expect(typesPour("Domiciliation au cabinet")).not.toContain("attestation-domicile");
    expect(typesPour("Domicile personnel du dirigeant")).not.toContain("attestation-cabinet");
  });

  it("le gabarit du cabinet est le même quelle que soit la forme", () => {
    for (const forme of ["SAS", "SASU", "SARL", "EURL", "SCI"]) {
      const document = documentsAProduire({
        forme,
        aUnDirigeant: true,
        modeDomiciliation: "Domiciliation au cabinet",
      }).find((d) => d.type === "attestation-cabinet");
      expect(document?.gabarit).toBe("attestation-domiciliation-cabinet.docx");
    }
    expect(
      existsSync(
        path.join(process.cwd(), "..", "templates", "attestation-domiciliation-cabinet.docx")
      )
    ).toBe(true);
  });
});

describe("l'attestation du cabinet, une fois remplie", () => {
  const texte = texteDu(
    "attestation-domiciliation-cabinet.docx",
    donneesDeGabarit(
      { ...BROUILLON, modeDomiciliation: "Domiciliation au cabinet" },
      { maintenant: new Date("2026-07-27T10:00:00Z"), villeRcs: "Paris" }
    )
  );

  it("dit qui atteste, à quel titre, et pour quels locaux", () => {
    expect(texte).toContain("Monsieur Hani MADFAI");
    expect(texte).toContain("STERLING PEAK");
    expect(texte).toContain("SELAS d'Avocats au capital de 20 000 euros");
    expect(texte).toContain("899 979 934");
    expect(texte).toContain("en sa qualité de locataire des locaux situés 34 rue Laugier");
  });

  it("nomme la société hébergée et son représentant", () => {
    expect(texte).toContain("LA META PROD");
    expect(texte).toContain("en cours d'immatriculation au RCS de Paris");
    expect(texte).toContain("GRAVINESE");
    expect(texte).toContain("27 juillet 2026");
  });

  /* Une mise à disposition dont l'écrit ne dit rien s'entend comme précaire. */
  it("est sans limitation de durée, avec droit de jouissance privatif", () => {
    expect(texte).toContain("consentie sans limitation de durée");
    expect(texte).toContain("droit de jouissance privatif sur les locaux");
  });

  it("ne laisse aucune balise non remplie", () => {
    expect(texte).not.toMatch(/\{\{|\}\}/);
  });
});

describe("les pièces réclamées au client", () => {
  const identifiants = (modeDomiciliation: Brouillon["modeDomiciliation"]) =>
    piecesAttendues("SASU", modeDomiciliation).map((p) => p.identifiant);

  /*
   * Le contrat ne prouve pas que le domiciliataire existe : le greffe veut aussi son
   * extrait d'immatriculation, et de moins de trois mois.
   */
  it("ajoute l'extrait Kbis du domiciliataire, et lui seul", () => {
    expect(identifiants("Société de domiciliation")).toContain("kbis-domiciliataire");
    expect(identifiants("Bail commercial ou professionnel")).not.toContain("kbis-domiciliataire");
    expect(identifiants("Domicile personnel du dirigeant")).not.toContain("kbis-domiciliataire");
    expect(identifiants("Domiciliation au cabinet")).not.toContain("kbis-domiciliataire");
  });

  /* Un dossier lu avant la saisie du mode ne réclame pas une pièce encore indécidée. */
  it("ne la réclame pas tant que le mode n'est pas su", () => {
    expect(identifiants(undefined)).not.toContain("kbis-domiciliataire");
  });
});

describe("ce que le guichet apprend du siège", () => {
  const adresseEntreprise = (brouillon: Partial<Brouillon>) => {
    const contenu = contenuDeLaCreation(
      { ...BROUILLON, ...brouillon } as Brouillon,
      {}
    ) as unknown as {
      contenu: {
        personneMorale: {
          adresseEntreprise: {
            caracteristiques: Record<string, unknown>;
            entrepriseDomiciliataire?: Record<string, unknown>;
          };
        };
      };
    };
    return contenu.contenu.personneMorale.adresseEntreprise;
  };

  /*
   * Le drapeau partait seul : le guichet savait la société domiciliée, non chez qui.
   * Les deux informations sont saisies depuis toujours et n'allaient nulle part.
   */
  it("nomme le domiciliataire et son immatriculation", () => {
    const siege = adresseEntreprise({
      modeDomiciliation: "Société de domiciliation",
      domiciliataire: { denomination: "SEDOMICILIER", siren: "823 754 851", agrement: "2019/12" },
    });

    expect(siege.caracteristiques.domiciliataire).toBe(true);
    expect(siege.entrepriseDomiciliataire?.denomination).toBe("SEDOMICILIER");
    /* Le guichet veut neuf chiffres, non le numéro tel qu'il se lit. */
    expect(siege.entrepriseDomiciliataire?.siren).toBe("823754851");
  });

  /*
   * Le cabinet n'est pas un domiciliataire : pas d'agrément préfectoral, pas de contrat
   * de domiciliation. Il met ses locaux à disposition, comme le ferait un propriétaire.
   */
  it("ne déclare pas le cabinet comme domiciliataire", () => {
    const siege = adresseEntreprise({ modeDomiciliation: "Domiciliation au cabinet" });
    expect(siege.caracteristiques.domiciliataire).toBe(false);
    expect(siege.caracteristiques.indicateurDomicileEntrepreneur).toBe(false);
    expect(siege.entrepriseDomiciliataire).toBeUndefined();
    expect(pieceDuSiege("Domiciliation au cabinet").code).toBe("PJ_25");
  });
});
