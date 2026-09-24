import { describe, expect, it } from "vitest";
import { donneesDuGabarit } from "@/domain/modification/gabarit";
import { verifierLeRepresentant } from "@/domain/modification/verification";
import {
  representantPeutEtreUneSociete,
  pourquoiPasDeSocieteRepresentante,
} from "@/domain/modification/types";

/**
 * Le représentant légal peut être une société.
 *
 * Une société par actions est souvent présidée par une holding. Le pouvoir doit alors
 * désigner cette société comme un acte désigne une personne morale - sa forme, son
 * capital, son siège, son numéro - puis nommer qui la représente elle-même. Le
 * formulaire n'offrait qu'une personne physique : on y saisissait le dirigeant de la
 * holding, et le pouvoir le donnait en son nom propre.
 */

const SOCIETE = {
  denomination: "ESSAI",
  forme: "SAS",
  siren: "940577380",
  capital: 1000,
  adresse: "1 rue de Test",
  codePostal: "75008",
  ville: "Paris",
  villeRcs: "Paris",
};

const HOLDING = {
  signataireNature: "morale",
  signataireSocieteDenomination: "KERGUELEN INVEST",
  signataireSocieteForme: "SAS",
  signataireSocieteCapital: 50_000,
  signataireSocieteSiren: "812345678",
  signataireSocieteSiege: "12 rue de la Paix, 75002 Paris",
  signataireSocieteRcs: "Paris",
  signataireCivilite: "Madame",
  signatairePrenom: "Claire",
  signataireNom: "DUFOUR",
  signataireRepresentantQualite: "présidente",
};

function donnees(valeurs: Record<string, unknown>) {
  return donneesDuGabarit({
    societe: SOCIETE,
    assemblee: { date: "2026-09-12", associes: [] },
    codes: ["denomination"],
    valeurs,
  } as never) as Record<string, string>;
}

describe("le mandant du pouvoir, quand le président est une société", () => {
  it("désigne la société, puis qui la représente", () => {
    const mandant = donnees(HOLDING).POUVOIR_MANDANT;
    expect(mandant).toContain("La société KERGUELEN INVEST");
    expect(mandant).toContain("SAS au capital de 50 000 euros");
    expect(mandant).toContain("dont le siège social est situé 12 rue de la Paix, 75002 Paris");
    expect(mandant).toContain("immatriculée au RCS de Paris sous le numéro 812 345 678");
    expect(mandant).toContain("représentée par Madame Claire DUFOUR, sa présidente");
  });

  it("ne lui prête pas de date de naissance", () => {
    /* L'état civil identifie une personne. Une société n'en a pas : lui en écrire un
       donnerait « La société X, née le - à - », que le guichet refuse. */
    expect(donnees(HOLDING).POUVOIR_MANDANT).not.toContain("né");
  });

  it("signe du même nom au bas de l'acte", () => {
    expect(donnees(HOLDING).POUVOIR_MANDANT_NOM).toBe(
      "La société KERGUELEN INVEST, représentée par Madame Claire DUFOUR, sa présidente"
    );
  });

  it("garde la qualité dans la société du dossier", () => {
    /* « Président » est ce qu'elle est chez nous ; « sa présidente » ce qu'elle est chez
       elle. Les deux paraissent dans la même phrase et ne se confondent pas. */
    expect(donnees({ ...HOLDING, signataireQualite: "président" }).POUVOIR_QUALITE).toBe(
      "président"
    );
  });

  it("désigne aussi le signataire des actes de constatation", () => {
    expect(donnees(HOLDING).AIR_SIGNATAIRE_NOM).toContain("La société KERGUELEN INVEST");
  });

  it("revient à l'état civil dès que le représentant est une personne", () => {
    const mandant = donnees({
      signataireCivilite: "Monsieur",
      signatairePrenom: "Lucas",
      signataireNom: "LARÉGINIE",
      signataireNeLe: "1990-03-04",
      signataireNeA: "Lyon 3e (69003)",
      signataireAdresse: "5 rue des Fleurs, 69003 Lyon",
    }).POUVOIR_MANDANT;
    expect(mandant).toBe(
      "Monsieur Lucas LARÉGINIE, né le 4 mars 1990 à Lyon 3e (69003), de nationalité française, demeurant 5 rue des Fleurs, 69003 Lyon"
    );
  });
});

describe("ce que le dossier exige avant de produire le pouvoir", () => {
  it("réclame l'état civil d'une personne physique", () => {
    const champs = verifierLeRepresentant({}).map((a) => a.champ);
    expect(champs).toEqual([
      "signatairePrenom",
      "signataireNom",
      "signataireNeLe",
      "signataireNeA",
      "signataireAdresse",
    ]);
  });

  it("n'exige pas la nationalité, qui a une mention par défaut", () => {
    expect(verifierLeRepresentant({}).map((a) => a.champ)).not.toContain("signataireNationalite");
  });

  it("réclame l'identification de la société représentante", () => {
    const champs = verifierLeRepresentant({ signataireNature: "morale" }).map((a) => a.champ);
    expect(champs).toContain("signataireSocieteDenomination");
    expect(champs).toContain("signataireSocieteSiren");
    expect(champs).toContain("signataireRepresentantQualite");
    /* Une société n'est pas née quelque part : ces champs disparaissent avec elle. */
    expect(champs).not.toContain("signataireNeLe");
    expect(champs).not.toContain("signataireAdresse");
  });

  it("relève un SIREN qui n'a pas neuf chiffres", () => {
    const anomalie = verifierLeRepresentant({
      signataireNature: "morale",
      signataireSocieteSiren: "8123456",
    }).find((a) => a.champ === "signataireSocieteSiren");
    expect(anomalie?.message).toContain("neuf chiffres");
  });

  it("ne réclame plus rien quand tout est là", () => {
    expect(verifierLeRepresentant(HOLDING)).toEqual([]);
  });
});

/**
 * Mais pas dans toutes les formes.
 *
 * Le choix était offert partout, et un client l'a pris sur une SARL. « La société à
 * responsabilité limitée est gérée par une ou plusieurs personnes physiques » : l'article
 * L. 223-18 ne laisse aucune marge, et la société anonyme n'en laisse pas davantage - son
 * président comme son directeur général doivent être des personnes physiques.
 */
describe("les formes qui admettent un représentant personne morale", () => {
  it("l'admettent là où la loi le permet", () => {
    // Une holding présidente de SAS est le cas courant ; une personne morale peut gérer
    // une société civile ou une société en nom collectif.
    for (const forme of ["SAS", "SASU", "SCI", "SNC", "SCA"]) {
      expect(representantPeutEtreUneSociete(forme)).toBe(true);
      expect(pourquoiPasDeSocieteRepresentante(forme)).toBeNull();
    }
  });

  it("le refusent à la SARL et à la SA", () => {
    for (const forme of ["SARL", "EURL", "SELARL"]) {
      expect(representantPeutEtreUneSociete(forme)).toBe(false);
      expect(pourquoiPasDeSocieteRepresentante(forme)).toContain("L. 223-18");
    }

    expect(representantPeutEtreUneSociete("SA")).toBe(false);
    /* L'article de la SARL n'est pas celui de la SA : le motif ne le cite pas. */
    expect(pourquoiPasDeSocieteRepresentante("SA")).toMatch(/personnes physiques/);
    expect(pourquoiPasDeSocieteRepresentante("SA")).not.toContain("223-18");
  });

  it("ne devinent rien tant que la forme est inconnue", () => {
    // C'est l'état de tout dossier dont la société n'est pas encore identifiée : on n'y
    // suppose pas une interdiction.
    for (const forme of [null, undefined, "", "GMBH"]) {
      expect(representantPeutEtreUneSociete(forme)).toBe(true);
    }
  });

  it("font refuser la société représentante là où la loi l'interdit", () => {
    const manques = verifierLeRepresentant(HOLDING, "SARL");
    expect(manques.map((m) => m.champ)).toContain("signataireNature");
    expect(manques.find((m) => m.champ === "signataireNature")?.message).toContain("L. 223-18");
  });

  it("la laissent passer là où la loi la permet", () => {
    expect(verifierLeRepresentant(HOLDING, "SAS")).toEqual([]);
  });

  it("ne refusent rien quand la forme ne leur est pas dite", () => {
    /* L'appelant qui ne connaît pas la société ne doit pas voir un reproche qu'il ne
       peut pas situer. */
    expect(verifierLeRepresentant(HOLDING)).toEqual([]);
  });
});
