import { describe, expect, it } from "vitest";
import { donneesDuGabarit } from "@/domain/modification/gabarit";

/**
 * La qualité du signataire, quand personne ne l'a choisie.
 *
 * Le champ est un choix sans valeur par défaut. Le pouvoir doit retomber sur la qualité
 * que la forme impose - président pour une société par actions - et non sur le tiret de
 * remplacement, qui sortait « agissant en qualité de - de la Société » sur un document
 * destiné au guichet.
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

function donnees(valeurs: Record<string, unknown>) {
  return donneesDuGabarit({
    societe: SOCIETE,
    assemblee: { date: "2026-09-12", associes: [] },
    codes: ["denomination"],
    valeurs,
  } as never) as Record<string, string>;
}

describe("la qualité du signataire du pouvoir", () => {
  it("retombe sur la qualité de la forme quand rien n'est choisi", () => {
    const rendu = JSON.stringify(donnees({}));
    expect(rendu).not.toContain("qualité de -");
    expect(rendu).toContain("président");
  });

  it("retient la qualité saisie", () => {
    expect(JSON.stringify(donnees({ signataireQualite: "directeur général" }))).toContain(
      "directeur général"
    );
  });
});
