import { describe, it, expect } from "vitest";
import { unParSociete, sansRepetition } from "@/domain/formalite/accueil";

/**
 * L'accueil montre l'ensemble, non ce qu'on vient de faire.
 *
 * Chaque bloc range par date : une journée passée sur un seul dossier suffisait à ce
 * que les quatre documents récents et toute l'activité portent le même nom, sur un
 * compte qui compte vingt et une formalités.
 */

const doc = (societe: string, nom: string) => ({ societe, nom });

describe("une société ne prend pas toute la place", () => {
  it("montre d'abord le plus récent de chaque société", () => {
    const documents = [
      doc("GREMLINS", "Statuts à jour"),
      doc("GREMLINS", "Procès-verbal"),
      doc("GREMLINS", "Justificatif"),
      doc("ATELIER NOVA", "Statuts constitutifs"),
      doc("MAISON VERTE", "Kbis"),
    ];

    const montres = unParSociete(documents, (d) => d.societe, 4);
    expect(montres.map((d) => d.societe)).toEqual([
      "GREMLINS",
      "ATELIER NOVA",
      "MAISON VERTE",
      // La place restante revient au reste, dans l'ordre où il venait.
      "GREMLINS",
    ]);
  });

  it("ne change rien quand il n'y a qu'une société", () => {
    const documents = [doc("GREMLINS", "A"), doc("GREMLINS", "B"), doc("GREMLINS", "C")];
    expect(unParSociete(documents, (d) => d.societe, 4).map((d) => d.nom)).toEqual([
      "A",
      "B",
      "C",
    ]);
  });

  it("garde l'ordre quand chaque société n'apparaît qu'une fois", () => {
    const documents = [doc("A", "1"), doc("B", "2"), doc("C", "3")];
    expect(unParSociete(documents, (d) => d.societe, 3).map((d) => d.societe)).toEqual([
      "A",
      "B",
      "C",
    ]);
  });
});

describe("une rafale de gestes identiques ne fait qu'une ligne", () => {
  it("replie les suites immédiates", () => {
    // Une heure de travail sur un dossier écrit huit fois la même phrase.
    const journal = [
      { dossier: 1, phrase: "a mis à jour le dossier" },
      { dossier: 1, phrase: "a mis à jour le dossier" },
      { dossier: 1, phrase: "a mis à jour le dossier" },
      { dossier: 2, phrase: "a déposé une pièce" },
      { dossier: 1, phrase: "a mis à jour le dossier" },
    ];

    const gardees = sansRepetition(journal, (e) => e.dossier + ":" + e.phrase);
    expect(gardees).toHaveLength(3);
    // Le même geste, repris après autre chose, reste un événement.
    expect(gardees[2]).toEqual({ dossier: 1, phrase: "a mis à jour le dossier" });
  });

  it("laisse intacte une suite de gestes différents", () => {
    const journal = [
      { dossier: 1, phrase: "a produit les actes" },
      { dossier: 1, phrase: "a mis à jour le dossier" },
    ];
    expect(sansRepetition(journal, (e) => e.dossier + ":" + e.phrase)).toHaveLength(2);
  });
});
