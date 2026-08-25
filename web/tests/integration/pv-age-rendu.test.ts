import { describe, it, expect } from "vitest";
import PizZip from "pizzip";
import { donneesDuPvAge, verifierLePvAge } from "@/domain/modification/pv-age";
import { rendreLePvAge } from "@/infrastructure/documents/modeles-cabinet";
import type { ContexteGabarit } from "@/domain/modification/gabarit";

/**
 * Le procès-verbal universel, lu dans le document que le client reçoit.
 *
 * Les tests d'unité vérifient la couche d'adaptation - quelles balises portent quelles
 * valeurs. Ils ne disent rien du document : un bloc dont la condition ne s'allume pas
 * laisse un paragraphe vide, une boucle mal fermée duplique une résolution, et rien de
 * tout cela ne se voit dans un objet de données. On rend donc le .docx et on le lit.
 *
 * Deux cas que la mission réclame nommément : une SAS qui décide plusieurs choses le
 * même jour, et le cas limite d'un seul bloc suivi des pouvoirs.
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

/**
 * Les intitulés des résolutions, dans l'ordre où l'acte les porte.
 *
 * Chaque résolution s'annonce par son ordinal puis, en dessous, son objet entre
 * parenthèses. C'est cette seconde ligne qui dit ce qui est décidé, et son rang qui
 * dit dans quel ordre - la « (la « Société ») » de l'en-tête n'en est pas une.
 */
function intitules(texte: string): string[] {
  return [...texte.matchAll(/^\((.+)\)$/gm)]
    .map((m) => m[1])
    .filter((intitule) => !intitule.includes("« Société »"));
}

function rendre(contexte: ContexteGabarit): string {
  // Les contrôles de cohérence précèdent la production, comme en production.
  const bloquants = verifierLePvAge(contexte).filter((a) => a.gravite === "bloquant");
  expect(bloquants.map((a) => a.message)).toEqual([]);
  return texteDu(rendreLePvAge(donneesDuPvAge(contexte)));
}

describe("une SAS qui décide plusieurs choses le même jour", () => {
  /*
   * Transfert du siège, apport de titres sous le report d'imposition de l'article
   * 150-0 B ter, et augmentation du capital qui rémunère cet apport. C'est le montage
   * le plus dense que Formalist propose : trois décisions, dont deux nées d'un seul
   * code, et un capital qui change en cours d'acte.
   */
  const CONTEXTE = {
    societe: {
      denomination: "DURAND HOLDING",
      forme: "SAS",
      siren: "813456789",
      adresse: "18 rue de Prony",
      codePostal: "75017",
      ville: "Paris",
      capital: 50000,
      villeRcs: "Paris",
    },
    assemblee: {
      date: "2026-09-30",
      associes: [
        {
          nature: "physique",
          civilite: "Monsieur",
          prenom: "Paul",
          nom: "DURAND",
          parts: 3000,
        },
        {
          nature: "physique",
          civilite: "Madame",
          prenom: "Anne",
          nom: "DURAND",
          parts: 2000,
        },
      ],
    },
    codes: ["transfert_siege", "apport_titres"],
    valeurs: {
      nouvelleAdresse: "34 rue Laugier",
      nouveauCodePostal: "75017",
      nouvelleVille: "Paris",
      dateEffetTransfert: "2026-10-01",

      apporteeDenomination: "ATELIER DURAND",
      apporteeForme: "SARL",
      apporteeSiren: "512345678",
      apporteeSiege: "12 rue des Artisans, 69003 Lyon",
      apporteeRcs: "Lyon",
      apporteeCapital: "10000",
      apporteeNbTitres: "1000",
      apporteeNominale: "10",
      apportNbTitres: "1000",
      apportOrigineTitres: "Constitution",
      apportValeur: "600000",
      apportMethodeValorisation: "Multiple d'EBE",
      apportCommissaire: "Oui",
      apportCommissaireNom: "Monsieur Marc COMMISSAIRE",
      apportNominaleBeneficiaire: "10",
      apporteurNomComplet: "Monsieur Paul DURAND",
      apportDateSignature: "2026-09-25",
      apportDateEffet: "2026-09-30",
      /*
       * L'apporteur contrôle la holding après l'apport : c'est la condition même du
       * report d'imposition de l'article 150-0 B ter.
       */
      apportControle: "Oui",
    },
  } as unknown as ContexteGabarit;

  const texte = rendre(CONTEXTE);

  it("numérote ses résolutions dans l'ordre du modèle, les pouvoirs en dernier", () => {
    /*
     * L'ordre est celui des blocs du modèle, jamais celui de la saisie : le transfert
     * précède l'apport, l'apport précède sa rémunération, et les pouvoirs closent.
     */
    const ordre = intitules(texte);
    expect(ordre).toEqual([
      "Transfert du siège social",
      "Approbation du traité d'apport",
      "Augmentation du capital social en rémunération de l'apport de titres",
      "Pouvoirs pour l'accomplissement des formalités",
    ]);

    expect(texte).toContain("PREMIÈRE RÉSOLUTION");
    expect(texte).toContain("DEUXIÈME RÉSOLUTION");
    expect(texte).toContain("TROISIÈME RÉSOLUTION");
    expect(texte).toContain("QUATRIÈME RÉSOLUTION");
    expect(texte).not.toContain("CINQUIÈME RÉSOLUTION");
  });

  it("annonce à l'ordre du jour exactement ce qu'elle décide", () => {
    expect(texte).toContain("1.\ttransfert du siège social ;");
    expect(texte).toContain(
      "2.\tapprobation d'un traité d'apport portant sur des titres de la société ATELIER DURAND ;"
    );
    expect(texte).toContain(
      "3.\taugmentation du capital social en rémunération de l'apport de titres ;"
    );
  });

  it("porte le report d'imposition de l'article 150-0 B ter", () => {
    expect(texte).toContain(
      "cet apport est placé sous le régime du report d'imposition prévu à l'article 150-0 B ter"
    );
    // Le traité approuvé porte sa date : un acte qui l'approuve « signé le - » ne vaut rien.
    expect(texte).toContain("traité d'apport signé le 25 septembre 2026");
  });

  it("enchaîne le capital : celui d'avant, celui d'après", () => {
    /*
     * 600 000 euros apportés, une valeur nominale de 10 euros : 60 000 titres émis,
     * et un capital qui passe de 50 000 à 650 000 euros. Un acte qui repartirait du
     * capital d'origine se contredirait d'une résolution à l'autre.
     */
    expect(texte).toContain("50 000");
    expect(texte).toContain("600 000");
    expect(texte).toContain("650 000");
  });

  it("emploie la terminologie des sociétés par actions, d'un bout à l'autre", () => {
    expect(texte).toContain("actionnaires");
    expect(texte).toContain("actions");
    expect(texte).not.toContain("parts sociales de la Société");
    // L'article 1832-2 vise les parts non négociables : il n'a rien à faire ici.
    expect(texte).not.toContain("1832-2");
  });

  it("ne laisse aucune trace des blocs éteints", () => {
    for (const absent of [
      "Changement de dénomination",
      "Réduction du capital",
      "Prorogation",
      "Cession",
      "Dissolution",
    ]) {
      expect(texte, absent).not.toContain(absent);
    }
    // Un bloc éteint qui laisserait son paragraphe se verrait comme une ligne vide.
    expect(texte).not.toMatch(/\n[ \t]+\n/);
  });

  it("se signe par les deux actionnaires présents", () => {
    expect(texte).toContain("Monsieur Paul DURAND");
    expect(texte).toContain("Madame Anne DURAND");
    // Une signataire ne signe pas « Actionnaire » au masculin sur sa propre ligne.
    expect(texte).not.toContain("(e)");
  });
});

describe("le cas limite : un seul bloc, plus les pouvoirs", () => {
  /*
   * Une SARL qui ne fait qu'une chose. Le procès-verbal ne peut pourtant jamais
   * annoncer une résolution unique : les pouvoirs au porteur en sont une, et c'est
   * elle que le greffe cherche pour accepter le dépôt.
   */
  const texte = rendre({
    societe: {
      denomination: "ATELIER DURAND",
      forme: "SARL",
      siren: "512345678",
      adresse: "12 rue des Artisans",
      codePostal: "69003",
      ville: "Lyon",
      capital: 10000,
      villeRcs: "Lyon",
    },
    assemblee: {
      date: "2026-09-15",
      associes: [
        { nature: "physique", civilite: "Monsieur", prenom: "Paul", nom: "DURAND", parts: 600 },
        { nature: "physique", civilite: "Madame", prenom: "Anne", nom: "DURAND", parts: 400 },
      ],
    },
    codes: ["prorogation"],
    valeurs: { nouvelleDuree: "99", dateEffetProrogation: "2026-10-01" },
  } as unknown as ContexteGabarit);

  it("compte deux résolutions, jamais une résolution unique", () => {
    const ordre = intitules(texte);
    expect(ordre).toEqual([
      "Prorogation de la durée de la Société",
      "Pouvoirs pour l'accomplissement des formalités",
    ]);
    expect(texte).not.toContain("RÉSOLUTION UNIQUE");
    expect(texte).toContain("PREMIÈRE RÉSOLUTION");
    expect(texte).toContain("DEUXIÈME RÉSOLUTION");
    expect(texte).not.toContain("TROISIÈME RÉSOLUTION");
  });

  it("emploie la terminologie des sociétés à responsabilité limitée", () => {
    expect(texte).toContain("associés");
    expect(texte).toContain("parts sociales");
    expect(texte).toContain("sur convocation de la gérance");
    expect(texte).not.toContain("actionnaires");
  });

  it("garde son en-tête, son ordre du jour et sa clôture", () => {
    expect(texte).toContain("Société à responsabilité limitée au capital de 10 000 euros");
    expect(texte).toContain("512 345 678 RCS Lyon");
    expect(texte).toContain("PROCÈS-VERBAL DES DÉLIBÉRATIONS");
    expect(texte).toContain("la séance est levée");
    expect(texte).toContain("Fait à Lyon, le 15 septembre 2026");
  });
});
