import { describe, it, expect } from "vitest";
import {
  adresseSurUneLigne,
  donneesDuGabarit,
  gabaritProcesVerbal,
} from "@/domain/modification/gabarit";

/**
 * Ce que les actes reçoivent, avant toute question de style.
 *
 * Deux documents produits pour un vrai dossier montraient : une adresse répétée
 * (« 861 CHEMIN DE L'ESPAGNOL 06250 MOUGINS, 06250 MOUGINS »), « 2000 parts » sans
 * séparateur, « immatriculée au RCS de Antibes », une date de cession remplacée par un
 * tiret, et une « décision de l'associé unique » qui listait deux associés.
 *
 * Aucun de ces défauts ne vient des gabarits : ils viennent des valeurs qu'on leur
 * donne.
 */

const SOCIETE = {
  denomination: "LES GREMLINS",
  forme: "SASU",
  siren: "535116362",
  adresse: "861 chemin de l'Espagnol 06250 Mougins",
  codePostal: "06250",
  ville: "Mougins",
  capital: 2000,
  villeRcs: "Antibes",
};

const donnees = (surcharge: Record<string, unknown> = {}) =>
  donneesDuGabarit({
    societe: SOCIETE,
    assemblee: { date: "2026-08-01", associes: [{ prenom: "Jean", nom: "DUPONT", parts: 2000 }] },
    codes: ["transfert_siege"],
    valeurs: {},
    ...surcharge,
  });

describe("l'adresse sur une ligne", () => {
  it("n'ajoute pas ce qui y figure déjà", () => {
    /*
     * L'acte portait « 861 CHEMIN DE L'ESPAGNOL 06250 MOUGINS, 06250 MOUGINS » : le
     * code postal et la ville étaient accolés à une adresse qui les contenait, parce
     * que le champ de recherche les avait déjà écrits dans la voie.
     */
    expect(adresseSurUneLigne("861 chemin de l'Espagnol 06250 Mougins", "06250", "Mougins")).toBe(
      "861 chemin de l'Espagnol 06250 Mougins"
    );
  });

  it("les ajoute quand ils manquent", () => {
    expect(adresseSurUneLigne("12 rue des Lilas", "75011", "Paris")).toBe(
      "12 rue des Lilas, 75011 Paris"
    );
  });

  it("reconnaît la ville quelle que soit la casse ou l'accent", () => {
    // « ORLÉANS » dans la voie et « Orleans » dans le champ désignent la même ville.
    expect(adresseSurUneLigne("3 rue Bannier 45000 ORLÉANS", "45000", "Orleans")).toBe(
      "3 rue Bannier 45000 ORLÉANS"
    );
  });

  it("complète une adresse qui n'a que la ville", () => {
    expect(adresseSurUneLigne("5 avenue Victor Hugo Lyon", "69003", "Lyon")).toBe(
      "5 avenue Victor Hugo Lyon, 69003"
    );
  });
});

describe("les nombres dans un acte", () => {
  it("les parts se lisent avec leur séparateur", () => {
    // « 2000 parts » se lit mal et ne se relit pas : un acte écrit « 2 000 ».
    const d = donnees();
    expect(String(d.TOTAL_PARTS_FORMATE)).toBe("2 000");
    expect(String(d.ASSOCIE_LISTE)).toContain("2 000 actions");
  });

  it("les titres portent le nom que la forme leur donne", () => {
    /*
     * La liste des présents écrivait « détenant 700 parts » dans un procès-verbal de
     * SAS qui parlait d'actions partout ailleurs.
     */
    expect(String(donnees().ASSOCIE_LISTE)).toContain("actions");
    expect(
      String(donnees({ societe: { ...SOCIETE, forme: "SARL" } }).ASSOCIE_LISTE)
    ).toContain("parts sociales");
  });
});

describe("le registre du commerce", () => {
  it("s'élide devant une voyelle", () => {
    // « au RCS de Antibes » : personne n'écrit cela.
    expect(String(donnees().RCS_DE)).toBe("d'Antibes");
  });

  it("garde « de » devant une consonne", () => {
    const d = donnees({ societe: { ...SOCIETE, villeRcs: "Nanterre" } });
    expect(String(d.RCS_DE)).toBe("de Nanterre");
  });
});

describe("la date d'une cession", () => {
  it("vient de la cession, non d'un champ disparu", () => {
    /*
     * L'acte portait « prendra effet à compter du - » : la date était cherchée dans un
     * champ plat que le formulaire ne remplit plus depuis que les cessions sont une
     * liste.
     */
    const d = donnees({
      codes: ["cession_parts"],
      cessions: [
        {
          cedant: 0,
          parts: 20,
          prix: 233,
          date: "2026-09-15",
          vers: "tiers" as const,
          nom: "MOMO",
        },
      ],
    });
    expect(String(d.DATE_CESSION)).toBe("2026-09-15");
    expect(String(d.DATE_CESSION_FR)).toBe("15 septembre 2026");
  });
});

describe("le procès-verbal choisi", () => {
  it("une société à associé unique, mais deux associés saisis, tient une assemblée", () => {
    /*
     * Le document disait « DÉCISION DE L'ASSOCIÉ UNIQUE » puis listait deux associés
     * détenant chacun des parts : l'acte se contredisait dans sa propre en-tête.
     */
    expect(gabaritProcesVerbal("SASU", 1)).toContain("sasu");
    expect(gabaritProcesVerbal("SASU", 2)).toContain("sas.docx");
    expect(gabaritProcesVerbal("EURL", 2)).toContain("sarl.docx");
  });

  it("sans information sur le nombre d'associés, la forme décide", () => {
    // L'ancien appel, à un seul argument, doit continuer de fonctionner.
    expect(gabaritProcesVerbal("SASU", undefined)).toContain("sasu");
    expect(gabaritProcesVerbal("SARL", undefined)).toContain("sarl");
  });
});

describe("la forme juridique dans une phrase", () => {
  it("s'écrit en clair, non en sigle", () => {
    // « SASU au capital de 2 000 euros » : un acte écrit la forme en toutes lettres.
    expect(String(donnees().FORME_EN_CLAIR)).toBe(
      "société par actions simplifiée unipersonnelle"
    );
  });
});
