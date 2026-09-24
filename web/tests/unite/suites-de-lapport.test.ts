import { describe, it, expect } from "vitest";
import { suitesDeLApport, type ApportDuDossier } from "@/domain/societe/suites-de-lapport";

/**
 * Ce qu'un apport de titres laisse derrière lui.
 *
 * Le dossier se refermait sur le dépôt au guichet. Les trente jours du registre des
 * bénéficiaires effectifs, le mois des statuts de l'autre société et la déclaration
 * annuelle du report tenaient dans la mémoire de celui qui avait signé.
 */

const AUJOURDHUI = new Date("2026-11-15T00:00:00Z");

const APPORT: ApportDuDossier = {
  dateEffet: "2026-10-01",
  apporteeForme: "SAS",
  apporteeDenomination: "LE GREMLIN",
  sousControle: true,
};

function cles(apport: Partial<ApportDuDossier>, quand = AUJOURDHUI) {
  return suitesDeLApport([{ ...APPORT, ...apport }], "552100554", quand).map((o) => o.cle);
}

describe("les suites d'un apport de titres", () => {
  it("n'annonce rien tant que l'apport n'a pas eu lieu", () => {
    // Une échéance qui court depuis une date à venir se lirait comme un retard qu'on n'a pas.
    expect(cles({ dateEffet: "2027-03-01" })).toEqual([]);
    expect(cles({ dateEffet: null })).toEqual([]);
    expect(cles({ dateEffet: "" })).toEqual([]);
  });

  it("ouvre trente jours pour les bénéficiaires effectifs des deux sociétés", () => {
    const suites = suitesDeLApport([APPORT], "552100554", AUJOURDHUI);
    const rbe = suites.filter((o) => o.nature === "beneficiaires-effectifs");

    expect(rbe).toHaveLength(2);
    for (const o of rbe) expect(o.limite).toBe("2026-10-31");
    /* Chacune nomme sa société : on ne dépose pas au greffe de l'une ce qui est à l'autre. */
    expect(rbe[1].intitule).toContain("LE GREMLIN");
  });

  it("ne réclame les statuts de la société apportée que si ses titres sont des parts", () => {
    expect(cles({ apporteeForme: "SARL" })).toContain("statuts-apportee-552100554-0");
    expect(cles({ apporteeForme: "SAS" })).not.toContain("statuts-apportee-552100554-0");
  });

  it("compte le mois des statuts en mois, non en trente jours", () => {
    const [statuts] = suitesDeLApport(
      [{ ...APPORT, apporteeForme: "SARL", dateEffet: "2026-01-31" }],
      "552100554",
      AUJOURDHUI
    ).filter((o) => o.nature === "statuts-societe-apportee");

    /* Le 31 janvier plus un mois n'est pas le 3 mars. */
    expect(statuts.limite).toBe("2026-02-28");
  });

  it("ne rappelle la déclaration annuelle que sous le régime du report", () => {
    expect(cles({ sousControle: true })).toContain("report-imposition-552100554-0");
    // Sans contrôle, c'est un sursis : rien à déclarer chaque année.
    expect(cles({ sousControle: false })).not.toContain("report-imposition-552100554-0");
  });

  it("laisse la déclaration annuelle sans date plutôt que d'en inventer une", () => {
    const [report] = suitesDeLApport([APPORT], "552100554", AUJOURDHUI).filter(
      (o) => o.nature === "report-imposition"
    );

    // La date de la déclaration de revenus change chaque année et selon le département :
    // en poser une ferait annoncer un retard qui n'en est pas un.
    expect(report.limite).toBeNull();
    expect(report.fondement).toContain("150-0 B ter");
  });

  it("distingue deux apports de la même société", () => {
    const suites = suitesDeLApport(
      [APPORT, { ...APPORT, apporteeDenomination: "AUTRE CIBLE" }],
      "552100554",
      AUJOURDHUI
    );

    // Deux clés identiques se seraient écrasées dans la liste rendue par React.
    expect(new Set(suites.map((o) => o.cle)).size).toBe(suites.length);
  });

  it("ne rend rien sans apport", () => {
    expect(suitesDeLApport([], "552100554", AUJOURDHUI)).toEqual([]);
  });
});
