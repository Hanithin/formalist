import { describe, it, expect } from "vitest";
import { posteslus } from "@/domain/comptes/extraction";

/**
 * La lecture des postes dans une liasse.
 *
 * Un chiffre mal lu ne fait rien échouer : il devient un dividende faux dans un acte,
 * avec l'autorité d'une valeur « extraite du document ». Ces cas sont ceux où la
 * lecture peut se tromper sans qu'on le voie.
 */

const LIASSE = `
        BILAN - ACTIF                          Brut      Amort.        Net
  Immobilisations corporelles              120 000      45 000      75 000
  TOTAL GENERAL                            410 000      45 000     365 000

        BILAN - PASSIF
  Capital social ou individuel                                      20 000
  Réserve légale                                                       500
  Report à nouveau                                                 (6 000)
  RESULTAT DE L'EXERCICE (bénéfice ou perte)                       48 200,50

        COMPTE DE RESULTAT
  Chiffres d'affaires nets                                        620 000
  Résultat d'exploitation                                          51 300
  Résultat financier                                               -1 200
  Effectif moyen du personnel                                           4
`;

describe("les postes lus dans une liasse", () => {
  const postes = posteslus(LIASSE);
  const valeur = (champ: string) => postes.find((p) => p.champ === champ)?.valeur;

  it("retient le résultat de l'exercice, non celui d'exploitation", () => {
    /*
     * Une liasse porte quatre lignes de « résultat ». Prendre la première venue
     * donnerait le résultat d'exploitation, supérieur au net dans la plupart des
     * dossiers, et l'affectation distribuerait un bénéfice qui n'existe pas.
     */
    expect(valeur("resultat")).toBe(48_200.5);
  });

  it("lit un report à nouveau entre parenthèses comme un débiteur", () => {
    // La convention comptable : un montant entre parenthèses est négatif.
    expect(valeur("reportAnterieur")).toBe(-6_000);
  });

  it("retient la colonne nette du total du bilan, non le brut", () => {
    expect(valeur("totalBilan")).toBe(365_000);
  });

  it("trouve le capital, la réserve légale, le chiffre d'affaires et l'effectif", () => {
    expect(valeur("capital")).toBe(20_000);
    expect(valeur("reserveLegale")).toBe(500);
    expect(valeur("chiffreAffaires")).toBe(620_000);
    expect(valeur("effectif")).toBe(4);
  });

  it("rend la ligne d'origine, pour que l'écran la montre", () => {
    const resultat = postes.find((p) => p.champ === "resultat");
    expect(resultat?.ligne).toContain("RESULTAT DE L'EXERCICE");
  });

  it("ne trouve rien dans un document qui n'est pas une liasse", () => {
    expect(posteslus("Facture n° 42 du 3 mars\nMontant : 1 200 euros")).toEqual([]);
  });

  it("ne prend pas un numéro de ligne pour un montant", () => {
    /*
     * Les liasses numérotent leurs postes - « AA », « FL », parfois « 12 ». Un nombre
     * à deux chiffres n'est jamais un montant de bilan.
     */
    expect(posteslus("Réserve légale   12")).toEqual([]);
  });

  it("lit une liasse sans accents, telle que la reconnaissance la rend", () => {
    /*
     * tesseract perd régulièrement les accents des capitales : « RESULTAT DE
     * L'EXERCICE » arrive sans accent, et la recherche doit s'en moquer.
     */
    const reconnu = posteslus("RESULTAT DE L EXERCICE                    12 340");
    expect(reconnu).toHaveLength(0);

    const avecApostrophe = posteslus("RESULTAT DE L'EXERCICE                 12 340");
    expect(avecApostrophe[0]?.valeur).toBe(12_340);
  });
});
