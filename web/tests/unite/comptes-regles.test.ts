import { describe, it, expect } from "vitest";
import {
  affectationProposee,
  dateLimiteApprobation,
  delaisDe,
  dotationDeLaReserveLegale,
  verifierAffectation,
} from "@/domain/comptes/regles";

/**
 * Les règles de l'approbation des comptes.
 *
 * C'est le domaine où les modèles en circulation se trompent le plus, et les erreurs
 * n'y font rien échouer : elles produisent un acte régulier en apparence, que le
 * greffe accepte, et qui fait doter une réserve qui n'est pas due ou distribuer un
 * dividende que la loi interdit.
 */

const CAPITAL = 10_000_00;

describe("la réserve légale", () => {
  it("prélève un vingtième du bénéfice, jusqu'au dixième du capital", () => {
    const due = dotationDeLaReserveLegale({
      forme: "SAS",
      resultatCentimes: 10_000_00,
      reportAnterieurCentimes: 0,
      capitalCentimes: CAPITAL,
      reserveExistanteCentimes: 0,
    });

    expect(due.applicable).toBe(true);
    expect(due.dotationCentimes).toBe(500_00);
    expect(due.plafondCentimes).toBe(1_000_00);
  });

  it("prélève sur le bénéfice diminué des pertes antérieures, non sur le bénéfice brut", () => {
    /*
     * Le piège de l'article L. 232-10, et celui que les modèles ignorent : une société
     * qui gagne 10 000 € en traînant 4 000 € de pertes prélève sur 6 000 €.
     */
    const due = dotationDeLaReserveLegale({
      forme: "SARL",
      resultatCentimes: 10_000_00,
      reportAnterieurCentimes: -4_000_00,
      capitalCentimes: CAPITAL,
      reserveExistanteCentimes: 0,
    });

    expect(due.dotationCentimes).toBe(300_00);
  });

  it("ne dote rien quand les pertes antérieures absorbent le bénéfice", () => {
    const due = dotationDeLaReserveLegale({
      forme: "SARL",
      resultatCentimes: 3_000_00,
      reportAnterieurCentimes: -5_000_00,
      capitalCentimes: CAPITAL,
      reserveExistanteCentimes: 0,
    });

    expect(due.dotationCentimes).toBe(0);
  });

  it("s'arrête au dixième du capital, et ne le dépasse jamais", () => {
    const presque = dotationDeLaReserveLegale({
      forme: "SAS",
      resultatCentimes: 10_000_00,
      reportAnterieurCentimes: 0,
      capitalCentimes: CAPITAL,
      reserveExistanteCentimes: 900_00,
    });
    // Un vingtième ferait 500 €, mais il ne manque que 100 € pour atteindre le plafond.
    expect(presque.dotationCentimes).toBe(100_00);
    expect(presque.apresDotationCentimes).toBe(1_000_00);

    const pleine = dotationDeLaReserveLegale({
      forme: "SAS",
      resultatCentimes: 10_000_00,
      reportAnterieurCentimes: 0,
      capitalCentimes: CAPITAL,
      reserveExistanteCentimes: 1_000_00,
    });
    expect(pleine.dotationCentimes).toBe(0);
  });

  it("ne s'applique pas à une société civile, même à l'impôt sur les sociétés", () => {
    /*
     * L'article L. 232-10 ne vise que les sociétés à responsabilité limitée et les
     * sociétés par actions. Beaucoup de sites affirment le contraire pour la SCI à
     * l'IS : lui faire doter une réserve légale serait inventer une obligation.
     */
    const due = dotationDeLaReserveLegale({
      forme: "SCI",
      resultatCentimes: 50_000_00,
      reportAnterieurCentimes: 0,
      capitalCentimes: CAPITAL,
      reserveExistanteCentimes: 0,
    });

    expect(due.applicable).toBe(false);
    expect(due.dotationCentimes).toBe(0);
  });

  it("ne dote rien sur un exercice déficitaire", () => {
    const due = dotationDeLaReserveLegale({
      forme: "SASU",
      resultatCentimes: -2_000_00,
      reportAnterieurCentimes: 0,
      capitalCentimes: CAPITAL,
      reserveExistanteCentimes: 0,
    });

    expect(due.dotationCentimes).toBe(0);
  });
});

describe("l'affectation du résultat", () => {
  const base = {
    forme: "SAS",
    resultatCentimes: 10_000_00,
    reportAnterieurCentimes: 0,
    capitalCentimes: CAPITAL,
    reserveExistanteCentimes: 0,
  };

  it("répartit le résultat et le report antérieur, non le seul résultat", () => {
    const avecReport = { ...base, reportAnterieurCentimes: 2_000_00 };
    const verdict = verifierAffectation({
      ...avecReport,
      affectation: affectationProposee(avecReport),
    });

    expect(verdict.aRepartirCentimes).toBe(12_000_00);
    expect(verdict.equilibre).toBe(true);
  });

  it("refuse une affectation qui ne tombe pas juste", () => {
    const verdict = verifierAffectation({
      ...base,
      affectation: {
        reserveLegaleCentimes: 500_00,
        autresReservesCentimes: 0,
        dividendesCentimes: 1_000_00,
        reportANouveauCentimes: 0,
      },
    });

    expect(verdict.equilibre).toBe(false);
    expect(verdict.ecartCentimes).toBe(8_500_00);
    expect(verdict.anomalies.join(" ")).toContain("ne tombe pas juste");
  });

  it("refuse une dotation inférieure au minimum légal", () => {
    const verdict = verifierAffectation({
      ...base,
      affectation: {
        reserveLegaleCentimes: 100_00,
        autresReservesCentimes: 0,
        dividendesCentimes: 0,
        reportANouveauCentimes: 9_900_00,
      },
    });

    expect(verdict.anomalies.join(" ")).toContain("inférieure au minimum légal");
  });

  it("refuse un dividende qui dépasse le bénéfice distribuable", () => {
    /*
     * Le report débiteur s'impute avant toute distribution : une société qui gagne
     * 10 000 € en traînant 9 000 € de pertes n'a pas 10 000 € à distribuer.
     */
    const verdict = verifierAffectation({
      ...base,
      reportAnterieurCentimes: -9_000_00,
      affectation: {
        reserveLegaleCentimes: 50_00,
        autresReservesCentimes: 0,
        dividendesCentimes: 10_000_00,
        reportANouveauCentimes: -9_050_00,
      },
    });

    expect(verdict.anomalies.join(" ")).toContain("bénéfice distribuable");
  });

  it("propose de tout reporter, sans distribuer", () => {
    /*
     * Distribuer se décide. Le proposer par défaut engagerait la trésorerie et
     * déclencherait l'imposition des associés sans que personne l'ait voulu.
     */
    const propose = affectationProposee(base);

    expect(propose.dividendesCentimes).toBe(0);
    expect(propose.reserveLegaleCentimes).toBe(500_00);
    expect(propose.reportANouveauCentimes).toBe(9_500_00);
  });

  it("reporte intégralement une perte", () => {
    const perte = { ...base, resultatCentimes: -3_000_00 };
    const propose = affectationProposee(perte);

    expect(propose.reserveLegaleCentimes).toBe(0);
    expect(propose.reportANouveauCentimes).toBe(-3_000_00);
    expect(verifierAffectation({ ...perte, affectation: propose }).equilibre).toBe(true);
  });
});

describe("les délais", () => {
  it("laisse six mois pour approuver, et compte au dernier jour du mois", () => {
    expect(dateLimiteApprobation("SAS", "2026-12-31")).toBe("2027-06-30");
    // Le 31 août plus six mois n'existe pas : on recule au 28 février.
    expect(dateLimiteApprobation("SARL", "2026-08-31")).toBe("2027-02-28");
  });

  it("ne fixe aucun délai légal à une société civile", () => {
    expect(dateLimiteApprobation("SCI", "2026-12-31")).toBeNull();
    expect(delaisDe("SCI").approbationMois).toBeNull();
  });

  it("dispense la société civile de tout dépôt au greffe", () => {
    expect(delaisDe("SCI").depotAuGreffe).toBe(false);
    expect(delaisDe("SAS").depotAuGreffe).toBe(true);
    expect(delaisDe("SARL").depotAuGreffe).toBe(true);
  });
});
