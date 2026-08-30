import { describe, it, expect } from "vitest";
import { nominaleDeduite, verifierApport } from "@/domain/modification/apport";
import { valeursParDefautDesChamps, MODIFICATIONS } from "@/domain/modification/types";

/**
 * Ce que le formulaire de l'apport de titres cesse de demander.
 *
 * Trente-quatre cases dans une seule colonne : le bloc le plus long de l'application.
 * Trois d'entre elles n'appelaient pourtant aucune décision - une valeur qui se déduit,
 * un renseignement que l'acte sait déjà, une réponse vraie neuf fois sur dix.
 */
describe("la valeur nominale se déduit", () => {
  it("du capital divisé par le nombre de titres", () => {
    expect(nominaleDeduite({ apporteeCapital: "10000", apporteeNbTitres: "500" })).toBe(20);
  });

  it("au centime près, et pas au-delà", () => {
    /* 10 000 / 3 ne fait pas une nominale : c'est une division qu'il faut trancher. */
    expect(nominaleDeduite({ apporteeCapital: "10000", apporteeNbTitres: "3" })).toBeNull();
    /* Deux décimales tombent juste : 1 250 / 8 = 156,25. */
    expect(nominaleDeduite({ apporteeCapital: "1250", apporteeNbTitres: "8" })).toBe(156.25);
  });

  it("ne se déduit pas de ce qui manque", () => {
    expect(nominaleDeduite({})).toBeNull();
    expect(nominaleDeduite({ apporteeCapital: "10000" })).toBeNull();
    expect(nominaleDeduite({ apporteeNbTitres: "500" })).toBeNull();
    expect(nominaleDeduite({ apporteeCapital: "0", apporteeNbTitres: "500" })).toBeNull();
  });
});

describe("le compte de la société apportée", () => {
  const base = {
    apporteeDenomination: "CIBLE",
    apporteeSiren: "512345678",
    apporteurCivilite: "Monsieur",
    apporteurPrenom: "Jean",
    apporteurNom: "ESSAI",
    apporteurAdresse: "3 rue des Lilas, 69003 Lyon",
    apporteurNeLe: "1980-01-01",
    apporteurNeA: "Lyon",
    apportMethodeValorisation: "Actif net comptable corrigé",
    apportDateEffet: "2026-10-01",
    apportNbTitres: "100",
    apportValeur: "50000",
    apportNominaleBeneficiaire: "10",
  };

  it("doit tomber juste : titres fois nominale font le capital", () => {
    const faux = verifierApport({
      ...base,
      apporteeCapital: "10000",
      apporteeNbTitres: "500",
      apporteeNominale: "25",
    });

    const compte = faux.find((a) => a.champ === "apporteeNominale");
    expect(compte).toBeDefined();
    expect(compte!.message).toBe(
      "500 titres à 25 euros font 12500 euros, non le capital de 10000 euros déclaré"
    );
  });

  it("se tait quand il tombe juste", () => {
    const juste = verifierApport({
      ...base,
      apporteeCapital: "10000",
      apporteeNbTitres: "500",
      apporteeNominale: "20",
    });

    expect(juste.filter((a) => a.champ === "apporteeNominale")).toEqual([]);
  });

  it("se tait aussi quand un des trois manque : ce n'est pas une incohérence", () => {
    const partiel = verifierApport({ ...base, apporteeCapital: "10000", apporteeNbTitres: "500" });
    expect(partiel.filter((a) => a.champ === "apporteeNominale")).toEqual([]);
  });
});

describe("ce qui s'écrit d'avance", () => {
  it("propose la nationalité de l'apporteur", () => {
    expect(valeursParDefautDesChamps(["apport_titres"], {})).toEqual({
      apporteurNationalite: "Française",
    });
  });

  it("n'écrit jamais par-dessus une saisie", () => {
    expect(
      valeursParDefautDesChamps(["apport_titres"], { apporteurNationalite: "Belge" })
    ).toEqual({});
  });

  it("ne propose rien là où la réponse est une décision", () => {
    /* Un montant, une date d'effet, une méthode de valorisation : personne ne peut les
       deviner à la place de celui qui les décide. */
    const champs = MODIFICATIONS.find((m) => m.code === "apport_titres")!.champs;
    const avecDefaut = champs.filter((c) => c.valeurParDefaut).map((c) => c.identifiant);
    expect(avecDefaut).toEqual(["apporteurNationalite"]);
  });
});

describe("le lieu de signature du traité", () => {
  it("n'est plus exigé : le traité prend la ville du siège", () => {
    const champs = MODIFICATIONS.find((m) => m.code === "apport_titres")!.champs;
    const lieu = champs.find((c) => c.identifiant === "apportLieuSignature")!;
    expect(lieu.obligatoire).toBeFalsy();
  });
});
