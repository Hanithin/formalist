import { describe, it, expect } from "vitest";
import {
  estUneModification,
  recapitulatifDeModification,
} from "@/domain/modification/recapitulatif";

/**
 * Le dossier de modification vu par l'avocat.
 *
 * L'espace avocat cherchait les champs d'une création à la racine du dossier. Une
 * modification ne les y a pas : le récapitulatif annonçait « le client n'a encore
 * rien renseigné » sur un dossier réglé et complet.
 */

const DOSSIER = {
  codes: ["transfert_siege", "dirigeant"],
  societe: {
    denomination: "STERLING PEAK",
    forme: "SAS",
    siren: "899979934",
    adresse: "34 rue Laugier",
    codePostal: "75017",
    ville: "Paris",
    capital: 10000,
  },
  valeurs: {
    nouvelleAdresse: "5 avenue Victor Hugo",
    nouvelleVille: "Lyon",
    nouveauCodePostal: "69003",
    dateEffetTransfert: "2026-09-15",
    typeChangementDirigeant: "Nomination",
    fonctionDirigeant: "Président",
    nouveauDirigeantNom: "BERNARD",
    dirigeantRevoqueNom: "DUPONT",
  },
  assemblee: {
    date: "2026-09-01",
    associes: [{ civilite: "Monsieur", prenom: "Jean", nom: "DUPONT", parts: 1000 }],
  },
  statuts: { source: "inpi", nature: "Statuts mis à jour", deposeLe: "2024-03-12" },
  statutsAJour: true,
};

describe("reconnaître un dossier de modification", () => {
  it("se voit à sa forme, sans dépendre du type déclaré", () => {
    expect(estUneModification(DOSSIER)).toBe(true);
    expect(estUneModification({ denomination: "ACME", forme: "SAS" })).toBe(false);
  });
});

describe("le récapitulatif de l'avocat", () => {
  const sections = recapitulatifDeModification(DOSSIER);
  const titres = sections.map((s) => s.titre);

  it("annonce ce que le client change", () => {
    expect(titres[0]).toBe("Ce que le client change");
    expect(sections[0].faits.map((f) => f.libelle)).toEqual([
      "Transfert de siège social",
      "Changement de dirigeant",
    ]);
  });

  it("porte l'identité de la société", () => {
    const societe = sections.find((s) => s.titre === "La société")!;
    expect(societe.faits.map((f) => f.valeur)).toContain("STERLING PEAK");
    expect(societe.faits.map((f) => f.valeur)).toContain("899979934");
  });

  it("range les valeurs sous leur changement, non toutes ensemble", () => {
    const transfert = sections.find((s) => s.titre === "Transfert de siège social")!;
    expect(transfert.faits.map((f) => f.valeur)).toContain("5 avenue Victor Hugo");
    // Une valeur de dirigeant n'a rien à faire dans la section du transfert.
    expect(transfert.faits.map((f) => f.valeur)).not.toContain("BERNARD");
  });

  it("écarte les champs sans objet", () => {
    /*
     * « Nom du dirigeant révoqué » est renseigné dans le dossier, mais la nature du
     * changement est une nomination : l'afficher ferait chercher une révocation qui
     * n'existe pas.
     */
    const dirigeant = sections.find((s) => s.titre === "Changement de dirigeant")!;
    expect(dirigeant.faits.map((f) => f.valeur)).toContain("BERNARD");
    expect(dirigeant.faits.map((f) => f.valeur)).not.toContain("DUPONT");
  });

  it("dit d'où viennent les statuts et s'ils sont retouchés", () => {
    const statuts = sections.find((s) => s.titre === "Les statuts")!;
    expect(statuts.faits[0].valeur).toContain("Registre national");
    expect(statuts.faits.map((f) => f.valeur)).toContain("Statuts à jour produits et joints");
  });

  it("une section vide n'apparaît pas", () => {
    // Mieux vaut un récapitulatif court qu'une suite de titres sans contenu.
    const nu = recapitulatifDeModification({ codes: [], societe: {}, valeurs: {} });
    expect(nu).toEqual([]);
  });
});
