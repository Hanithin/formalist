import { describe, expect, it } from "vitest";
import { donneesDuGabarit } from "@/domain/modification/gabarit";
import { verifierLeRepresentant } from "@/domain/modification/verification";

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
