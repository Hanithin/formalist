import { describe, it, expect } from "vitest";
import {
  anomaliesDuTour,
  divisionRecommandee,
  repartition,
  type ContratAir,
} from "@/domain/modification/air";
import { rangSuivant } from "@/app/api/formalites/modification/air/route";

/* Le tour réel qui a servi de modèle : trois valorisations, des tickets de 626 à 100 000 euros. */
const TOUR: ContratAir[] = [
  { investisseur: "SFDI", montant: 100_000, valorisation: 2_000_000 },
  { investisseur: "SFDI - tranche complémentaire", montant: 50_000, valorisation: 2_500_000 },
  { investisseur: "NovaTerra Nouvelle SL", montant: 100_000, valorisation: 2_000_000 },
  { investisseur: "FIGTUS", montant: 17_500, valorisation: 3_500_000 },
  { investisseur: "FINANCIÈRE BM 26", montant: 15_000, valorisation: 3_500_000 },
  { investisseur: "Lenny DELOYA", montant: 5_000, valorisation: 3_500_000 },
  { investisseur: "Eliot BERDAH", montant: 626, valorisation: 3_500_000 },
];

describe("la conversion d'un tour de BSA AIR", () => {
  it("donne à chacun la part que son propre accord lui promet", () => {
    const parts = repartition(1_000_000, TOUR);
    for (const investisseur of parts.investisseurs) {
      const promise = investisseur.montant / investisseur.valorisation;
      expect(investisseur.actions / parts.actionsApres).toBeCloseTo(promise, 5);
    }
  });

  it("laisse aux fondateurs ce que les accords ne prennent pas", () => {
    const parts = repartition(1_000_000, TOUR);
    expect(1 - parts.sommeDesParts).toBeCloseTo(0.8691, 4);
    expect(parts.actionsExistantes / parts.actionsApres).toBeCloseTo(0.8691, 4);
  });

  /*
   * Le point qui a motivé tout le module.
   *
   * À mille actions, le plus petit souscripteur a droit à un cinquième d'action. Aucun
   * arrondi n'est alors honnête : il reçoit zéro, ou cinq fois ses droits.
   */
  it("refuse de convertir quand la valeur nominale est trop grosse", () => {
    const anomalies = anomaliesDuTour(1_000, TOUR);
    expect(anomalies.some((a) => a.gravite === "bloquant")).toBe(true);
    expect(anomalies.some((a) => a.message.includes("BERDAH") && a.message.includes("aucune action entière"))).toBe(
      true
    );
  });

  it("propose la division qui rend les arrondis honnêtes", () => {
    const diviseur = divisionRecommandee(1_000, TOUR);
    expect(diviseur).toBe(1_000);
    expect(anomaliesDuTour(1_000 * diviseur, TOUR).filter((a) => a.gravite === "bloquant")).toEqual([]);
  });

  it("signale que les accords n'ont pas tous la même valorisation", () => {
    const anomalies = anomaliesDuTour(1_000_000, TOUR);
    expect(anomalies.some((a) => a.message.includes("3 valorisations"))).toBe(true);
  });

  /* Un tour qui promet plus de cent pour cent ne se calcule pas : il se signale. */
  it("arrête un tour qui promet plus que le capital", () => {
    const impossible: ContratAir[] = [
      { investisseur: "A", montant: 600_000, valorisation: 1_000_000 },
      { investisseur: "B", montant: 600_000, valorisation: 1_000_000 },
    ];
    expect(repartition(1_000, impossible).investisseurs).toEqual([]);
    expect(anomaliesDuTour(1_000, impossible)[0].gravite).toBe("bloquant");
  });

  it("compte les actions créées par la somme des arrondis, non par l'arrondi de la somme", () => {
    const parts = repartition(1_000_000, TOUR);
    const somme = parts.investisseurs.reduce((t, i) => t + i.actions, 0);
    expect(parts.actionsCreees).toBe(somme);
    expect(parts.actionsApres).toBe(1_000_000 + somme);
  });

  it("ne divise pas quand rien ne l'exige", () => {
    expect(divisionRecommandee(1_000_000, TOUR)).toBe(1);
    expect(divisionRecommandee(1_000, [])).toBe(1);
  });
});

describe("le rang du prochain accord déposé", () => {
  /*
   * Retirer le deuxième de trois ramenait le compte à deux, et le dépôt suivant
   * reprenait le titre du troisième - dont le fichier était remplacé alors qu'il
   * figurait toujours dans la liste.
   */
  it("passe au-dessus du plus haut déjà employé", () => {
    expect(rangSuivant([])).toBe(1);
    expect(
      rangSuivant([
        { fichier: "a.pdf", document: "Accord BSA AIR 01", investisseur: "A", montant: 1, valorisation: 2 },
        { fichier: "c.pdf", document: "Accord BSA AIR 03", investisseur: "C", montant: 1, valorisation: 2 },
      ])
    ).toBe(4);
  });

  /* Une liste d'avant ce champ n'a pas de titre : on repart de un plutôt que d'échouer. */
  it("supporte une ligne sans titre de document", () => {
    expect(
      rangSuivant([{ fichier: "a.pdf", investisseur: "A", montant: 1, valorisation: 2 }])
    ).toBe(1);
  });
});

describe("les lignes incomplètes", () => {
  /*
   * L'écran calcule sur toutes les lignes, complètes ou non, pour garder les rangs
   * alignés sur le tableau. Une ligne sans valorisation doit donc peser zéro, et non
   * fausser le total.
   */
  it("pèsent zéro sans fausser le total", () => {
    const avec = repartition(1_000_000, [...TOUR, { investisseur: "À compléter", montant: 0, valorisation: 0 }]);
    const sans = repartition(1_000_000, TOUR);
    expect(avec.actionsApres).toBe(sans.actionsApres);
    expect(avec.investisseurs[avec.investisseurs.length - 1].actions).toBe(0);
    expect(avec.investisseurs[avec.investisseurs.length - 1].part).toBe(0);
  });

  it("laissent chaque ligne à son rang", () => {
    const parts = repartition(1_000_000, [
      { investisseur: "Jumeau", montant: 5_000, valorisation: 3_500_000 },
      { investisseur: "Jumeau", montant: 5_000, valorisation: 3_500_000 },
    ]);
    expect(parts.investisseurs).toHaveLength(2);
    expect(parts.actionsCreees).toBe(parts.investisseurs[0].actions * 2);
  });
});
