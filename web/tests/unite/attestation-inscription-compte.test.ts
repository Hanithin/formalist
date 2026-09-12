import { describe, expect, it } from "vitest";
import {
  actesAProduire,
  MODELE_AIR_ATTESTATION_COMPTE,
  MODELE_AIR_CONSTATATION,
} from "@/domain/modification/gabarit";
import { donneesDeLaConstatation } from "@/domain/modification/constatation";
import type { Valeurs } from "@/domain/modification/types";

/**
 * L'attestation d'inscription en compte.
 *
 * Dans une société par actions, les titres sont nominatifs : ce n'est pas l'acte qui
 * fait l'associé, c'est l'inscription en compte. Le dossier produisait la décision qui
 * constate la conversion et les statuts qui en portent le capital, mais rien que le
 * souscripteur puisse produire pour prouver qu'il est actionnaire - or c'est la seule
 * pièce qu'il détient en propre, et celle qu'on lui réclamera.
 */

const VALEURS: Valeurs = {
  airActionsExistantes: 1000,
  airValeurNominale: 1,
  airDateEvenement: "2026-09-12",
  airEvenement: "Levée de fonds ultérieure",
};

const gabarits = (valeurs: Valeurs = VALEURS) =>
  actesAProduire(["constatation_augmentation"], "SAS", valeurs, 2, []).map((a) => a.gabarit);

describe("l'attestation d'inscription en compte", () => {
  it("est produite par une constatation de conversion", () => {
    expect(gabarits()).toContain(MODELE_AIR_ATTESTATION_COMPTE);
  });

  it("vient après la décision qu'elle présuppose", () => {
    /* Elle constate une inscription en compte : cela suppose la conversion constatée et
       les registres tenus. Elle ne peut pas précéder la décision du président. */
    const liste = gabarits();
    expect(liste.indexOf(MODELE_AIR_ATTESTATION_COMPTE)).toBeGreaterThan(
      liste.indexOf(MODELE_AIR_CONSTATATION)
    );
  });

  it("n'apparaît pas pour un changement qui ne convertit rien", () => {
    const autres = actesAProduire(["transfert_siege"], "SAS", {}, 2, []).map((a) => a.gabarit);
    expect(autres).not.toContain(MODELE_AIR_ATTESTATION_COMPTE);
  });
});

describe("ce que l'attestation met sous les yeux du titulaire", () => {
  /*
   * Le gabarit répète le même jeu de balises que le tableau annexé à la décision, une
   * page par titulaire : c'est la liste des conversions qui l'alimente, et elle doit
   * porter tout ce que l'attestation affirme - le nom, le nombre d'actions, la part.
   */
  const donnees = donneesDeLaConstatation({
    valeurs: VALEURS,
    air: [
      { investisseur: "FIGTUS", montant: 17_500, valorisation: 3_500_000 },
      { investisseur: "FINANCIERE BM 26", montant: 15_000, valorisation: 3_500_000 },
    ],
  } as never);

  const lignes = donnees.AIR_LIGNES as Record<string, string>[];

  it("porte une ligne par souscripteur", () => {
    expect(lignes).toHaveLength(2);
    expect(lignes.map((l) => l.INVESTISSEUR)).toEqual(["FIGTUS", "FINANCIERE BM 26"]);
  });

  it("donne à chacun son nombre d'actions et sa part", () => {
    /* 17 500 sur une valorisation de 3 500 000, c'est un demi pour cent du capital
       d'après - et le capital d'après dépend de toutes les conversions à la fois. */
    expect(lignes[0].PART).toBe("0,500 %");
    expect(lignes[1].PART).toBe("0,429 %");
    expect(Number(lignes[0].ACTIONS.replace(/\s/g, ""))).toBeGreaterThan(0);
  });

  it("dit la valeur nominale, que l'attestation reprend", () => {
    /* L'attestation affirme « actions d'une valeur nominale de X euro chacune » : sans
       cette balise, elle affirmerait un nominal vide. */
    expect(donnees.AIR_NOMINALE).toBeTruthy();
  });
});
