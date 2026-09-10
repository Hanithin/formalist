import { describe, it, expect } from "vitest";
import {
  dateDUnAccord,
  lireUnAir,
  nombreDUnAccord,
  valeurDuChamp,
} from "@/domain/modification/lecture-air";

/* Extraits réels, avec leurs défauts : champs de formulaire, coupures, dollar pour euro. */
const ANGLAIS = `                        FAST INVESTMENT AGREEMENT

                                           (BSA AIR)

    LEND ONCHAIN, a simplified joint-stock company with a share capital of 1,000 euros,
    registered under number 940 577 380, represented by its President,

                                              hereinafter referred to as the "Company";

    AND :

    If legal entity:
                              FINANCIERE BM 26
         - Corporate name: _______________
         - Legal form: SARL
                        _______________

                                                      Hereinafter referred to as the "AIR Investor".

    The AIR Investor has expressed interest in investing a total amount of €15 ________
                                                                                    000     euros
    through the subscription of a BSA AIR issued by the Company.

       -   Post-money Valuation: means the valuation of the Company after taking into account
           the total amount raised under this fundraising, contractually set at 3,500,000 euros.

    In Paris, on 10/09/2025
`;

const FRANCAIS = `ENTRE LES SOUSSIGNÉS :

La société LEND ONCHAIN, Société par actions simplifiée au capital de mille euros (1.000 €),

                                                  ci-après désignée la « Société » ou « LEND »,

D'UNE PART,

ET :

La société SFDI - SOCIÉTÉ FRANÇAISE DE DISTRIBUTION INFORMATIQUE, Société à
responsabilité limitée au capital de un million sept cent trente-trois mille euros
(1.733.736 €), dont le siège social est sis 10, rue Flandres Dunkerque 40, 44300 Nantes,

                                                  ci-après désignée l'« Investisseur » ou « SFDI »,

l'Investisseur s'est déclaré désireux de participer à l'Opération de Levée de Fonds par la
souscription d'un BSA AIR pour un montant total de cent mille euros (100.000 €).

celles-ci sont convenues que la valorisation post-money de la Société, aux fins du calcul du
nombre d'actions, serait fixée à deux millions d'euros (2.000.000 €).
`;

describe("la lecture d'un accord d'investissement rapide", () => {
  it("lit le gabarit anglais, champs de formulaire compris", () => {
    const lu = lireUnAir(ANGLAIS);
    expect(lu.investisseur).toBe("FINANCIERE BM 26");
    expect(lu.montant).toBe(15_000);
    expect(lu.valorisation).toBe(3_500_000);
    expect(lu.signeLe).toBe("2025-09-10");
    expect(lu.manques).toEqual([]);
  });

  it("lit le gabarit français", () => {
    const lu = lireUnAir(FRANCAIS);
    expect(lu.investisseur).toBe("SFDI - SOCIÉTÉ FRANÇAISE DE DISTRIBUTION INFORMATIQUE");
    expect(lu.montant).toBe(100_000);
    expect(lu.valorisation).toBe(2_000_000);
  });

  /*
   * Les deux parties sont introduites par la même formule, et l'émetteur vient en
   * premier. Sans coupure, chaque accord désignait la société émettrice comme
   * souscripteur - et tout le tableau de conversion était faux.
   */
  it("ne prend pas l'émetteur pour le souscripteur", () => {
    expect(lireUnAir(FRANCAIS).investisseur).not.toContain("LEND");
  });

  it("ne confond pas le capital de l'investisseur avec la valorisation", () => {
    expect(lireUnAir(FRANCAIS).valorisation).not.toBe(1_733_736);
  });

  /* Un accord signé porte « $626 euros » : le mot qui suit tranche, pas le symbole. */
  it("accepte un symbole de monnaie erroné", () => {
    const lu = lireUnAir(ANGLAIS.replace("€15 ________\n                                                                                    000", "$626"));
    expect(lu.montant).toBe(626);
  });

  it("dit ce qu'il n'a pas su lire plutôt que de le deviner", () => {
    const lu = lireUnAir("Un document qui n'est pas un accord d'investissement.");
    expect(lu.montant).toBeNull();
    expect(lu.manques).toHaveLength(4);
  });

  describe("les nombres", () => {
    it("lit les trois écritures d'un même montant", () => {
      expect(nombreDUnAccord("3,500,000")).toBe(3_500_000);
      expect(nombreDUnAccord("2.000.000")).toBe(2_000_000);
      expect(nombreDUnAccord("15 ___ 000")).toBe(15_000);
      expect(nombreDUnAccord("")).toBeNull();
    });
  });

  describe("les dates", () => {
    it("tranche quand l'un des deux nombres dépasse douze", () => {
      expect(dateDUnAccord("07/16/2025")).toBe("2025-07-16");
      expect(dateDUnAccord("24/03/2026")).toBe("2026-03-24");
    });

    /* Ambigu : on retient le français, qui est celui des actes, et l'écran corrige. */
    it("retient le français quand rien ne tranche", () => {
      expect(dateDUnAccord("10/09/2025")).toBe("2025-09-10");
    });

    it("accepte l'ISO tel quel", () => {
      expect(dateDUnAccord("Born on: 1997-07-30")).toBe("1997-07-30");
    });
  });

  describe("les champs de formulaire", () => {
    /* La valeur saisie tombe tantôt après l'étiquette, tantôt une ligne au-dessus. */
    it("trouve la valeur au-dessus de son étiquette", () => {
      const lignes = ["   FINANCIERE BM 26", "  - Corporate name: _______________"];
      expect(valeurDuChamp(lignes, /Corporate name\s*:/i)).toBe("FINANCIERE BM 26");
    });

    it("trouve la valeur à la suite de son étiquette", () => {
      expect(valeurDuChamp(["  - Legal form: SARL", "     ______"], /Legal form\s*:/i)).toBe("SARL");
    });

    it("ne rend pas un blanc pour une valeur", () => {
      expect(valeurDuChamp(["", "  - Corporate name: ______", ""], /Corporate name\s*:/i)).toBeNull();
    });
  });
});
