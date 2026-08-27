import { describe, it, expect } from "vitest";
import PizZip from "pizzip";
import { donneesDuPvAge } from "@/domain/modification/pv-age";
import { rendreLePvAge } from "@/infrastructure/documents/modeles-cabinet";
import type { ContexteGabarit } from "@/domain/modification/gabarit";

/**
 * Trois défauts trouvés en régénérant un dossier réel.
 *
 * Le modèle du cabinet rendait la nomination d'un dirigeant sans condition : une
 * révocation seule sortait avec quatre paragraphes nommant un président sans nom, sous
 * le quitus du sortant. Il écrivait « décide de révoquer de Untel », la préposition
 * étant en dur alors qu'elle n'appartient qu'à la formule de la démission. Et il
 * affirmait toujours une création de titres, là où une augmentation peut se faire en
 * élevant la valeur nominale des titres existants : le nombre et le nominal étant
 * facultatifs, il écrivait « par la création de 0 actions nouvelles d'une valeur
 * nominale de 0 euros chacune ».
 *
 * Aucun des trois ne faisait échouer quoi que ce soit. Il fallait lire l'acte.
 */

function texteDu(docx: Buffer): string {
  return new PizZip(docx)
    .file("word/document.xml")!
    .asText()
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

const SOCIETE = {
  denomination: "ATELIER LAUGIER",
  forme: "SAS",
  siren: "552100554",
  adresse: "12 rue Vauban",
  codePostal: "69006",
  ville: "Lyon",
  capital: 10000,
  villeRcs: "Lyon",
};

const ASSEMBLEE = {
  date: "2026-09-15",
  totalParts: 1000,
  associes: [
    { nature: "physique", civilite: "Monsieur", prenom: "Paul", nom: "DURAND", parts: 600 },
    { nature: "physique", civilite: "Madame", prenom: "Anne", nom: "ROUSSEL", parts: 400 },
  ],
};

function rendre(codes: string[], valeurs: Record<string, string>): string {
  return texteDu(
    rendreLePvAge(
      donneesDuPvAge({ societe: SOCIETE, assemblee: ASSEMBLEE, codes, valeurs } as unknown as ContexteGabarit)
    )
  );
}

describe("la résolution du dirigeant", () => {
  it("ne nomme personne quand on se contente de révoquer", () => {
    const texte = rendre(["dirigeant"], {
      typeChangementDirigeant: "Révocation",
      fonctionDirigeant: "Président",
      dirigeantRevoqueNom: "Monsieur Jean MARTIN",
      dateEffetDirigeant: "2026-09-20",
    });

    expect(texte).toContain("décide de révoquer Monsieur Jean MARTIN de ses fonctions");
    /* Le « de » du modèle doublait celui de la formule. */
    expect(texte).not.toContain("révoquer de ");
    /* Et surtout, plus de nomination à vide. */
    expect(texte).not.toContain("décide de nommer en qualité");
    expect(texte).not.toContain("né(e) le");
    expect(texte).not.toContain("déclare accepter les fonctions");
  });

  it("garde la préposition pour une démission", () => {
    const texte = rendre(["dirigeant"], {
      typeChangementDirigeant: "Démission",
      fonctionDirigeant: "Président",
      dirigeantDemissionnaireNom: "Monsieur Jean MARTIN",
      dateEffetDirigeant: "2026-09-20",
    });

    expect(texte).toContain("prend acte de la démission de Monsieur Jean MARTIN");
  });

  it("nomme, et sans révoquer, quand c'est une nomination", () => {
    const texte = rendre(["dirigeant"], {
      typeChangementDirigeant: "Nomination",
      fonctionDirigeant: "Président",
      dateEffetDirigeant: "2026-09-20",
      nouveauDirigeantCivilite: "Madame",
      nouveauDirigeantPrenom: "Claire",
      nouveauDirigeantNom: "MERCIER",
      nouveauDirigeantDateNaissance: "1985-03-04",
      nouveauDirigeantLieuNaissance: "Lyon",
      nouveauDirigeantNationalite: "Française",
      nouveauDirigeantAdresse: "3 rue des Lilas, 69003 Lyon",
    });

    expect(texte).toContain("décide de nommer en qualité de président");
    expect(texte).toContain("Madame Claire MERCIER");
    expect(texte).not.toContain("décide de révoquer");
    expect(texte).not.toContain("prend acte de la démission");
  });
});

describe("la modalité de l'augmentation de capital", () => {
  const BASE = {
    modeAugmentation: "Apport en numéraire",
    capitalActuelAugm: "10000",
    nouveauCapitalAugm: "42000",
    dateEffetAugm: "2026-10-01",
    banqueDepot: "Banque Essai",
    dateDepotFonds: "2026-09-10",
  };

  it("crée des titres quand leur nombre et leur nominal sont donnés", () => {
    const texte = rendre(["augmentation_capital"], {
      ...BASE,
      nbPartsNouvelles: "3200",
      valeurNominaleAugm: "10",
    });

    expect(texte).toContain(
      "par la création de 3 200 actions nouvelles d'une valeur nominale de 10 euros chacune"
    );
    expect(texte).toContain("sans prime d'émission et entièrement libérées");
  });

  it("élève le nominal quand aucun titre n'est créé", () => {
    /*
     * Les deux champs sont facultatifs, et à raison : une augmentation peut se faire
     * en élevant la valeur nominale des titres existants. Le modèle écrivait alors
     * « la création de 0 actions nouvelles d'une valeur nominale de 0 euros ».
     */
    const texte = rendre(["augmentation_capital"], BASE);

    expect(texte).toContain("par élévation de la valeur nominale des actions existantes");
    expect(texte).not.toContain("création de 0");
    expect(texte).not.toContain("nominale de 0 euros");
    /* « Entièrement libérées » qualifie des titres qu'on émet, non ceux qu'on élève. */
    expect(texte).not.toContain("existantes et entièrement libérées");
  });

  it("chiffre la prime d'émission quand il y en a une", () => {
    const texte = rendre(["augmentation_capital"], {
      ...BASE,
      nbPartsNouvelles: "3200",
      valeurNominaleAugm: "10",
      primeEmission: "5000",
    });

    expect(texte).toContain("assorties d'une prime d'émission de 5 000 euros");
  });
});
