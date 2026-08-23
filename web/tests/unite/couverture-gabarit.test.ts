import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { unzipSync } from "node:zlib";
import { donneesDeGabarit } from "@/domain/formalite/gabarit";
import type { Brouillon } from "@/domain/formalite/parcours";

/**
 * Le contrat avec les gabarits Word.
 *
 * Les noms de champs vivent dans les .docx : c'est eux qui font foi. Ce test les
 * relève dans les fichiers et vérifie que le domaine les fournit tous - c'est la
 * seule façon d'éviter qu'un acte sorte avec un blanc là où le nom de la société
 * devrait être, ce qui est arrivé.
 *
 * Il lit les gabarits réels : s'ils changent, il le dit.
 */

const GABARITS = path.join(process.cwd(), "..", "templates");

/** Les champs et les sections d'un .docx, lus dans son XML. */
function champsDuGabarit(fichier: string): { champs: Set<string>; sections: Set<string> } {
  const contenu = readFileSync(path.join(GABARITS, fichier));
  // Un .docx est un zip : word/document.xml en est l'entrée principale. On y accède
  // sans dépendance, en repérant l'entrée puis en la dégonflant.
  const xml = extraireDocumentXml(contenu);
  const texte = xml.replace(/<[^>]+>/g, "");

  const champs = new Set<string>();
  const sections = new Set<string>();
  for (const trouve of texte.matchAll(/\{([^{}]{1,60})\}/g)) {
    const cle = trouve[1];
    if (cle.startsWith("#") || cle.startsWith("^")) sections.add(cle.slice(1));
    else if (!cle.startsWith("/")) champs.add(cle);
  }
  return { champs, sections };
}

/** word/document.xml d'un zip, décompressé. */
function extraireDocumentXml(zip: Buffer): string {
  const cible = Buffer.from("word/document.xml");
  let position = 0;

  while (position < zip.length - 4) {
    // En-tête d'entrée locale : 0x04034b50
    if (zip.readUInt32LE(position) !== 0x04034b50) {
      position += 1;
      continue;
    }
    const compression = zip.readUInt16LE(position + 8);
    const tailleCompressee = zip.readUInt32LE(position + 18);
    const tailleNom = zip.readUInt16LE(position + 26);
    const tailleExtra = zip.readUInt16LE(position + 28);
    const nom = zip.subarray(position + 30, position + 30 + tailleNom);
    const debut = position + 30 + tailleNom + tailleExtra;

    if (nom.equals(cible)) {
      const donnees = zip.subarray(debut, debut + tailleCompressee);
      return compression === 0 ? donnees.toString("utf8") : unzipSync(donnees).toString("utf8");
    }
    position = debut + tailleCompressee;
  }
  throw new Error("word/document.xml introuvable");
}

/** Un dossier renseigné de bout en bout : c'est ce que les gabarits reçoivent. */
const complet: Brouillon = {
  forme: "SASU",
  denomination: "ATELIER MERIDIEN",
  activite: "Conseil en design.",
  adresse: "12 rue des Lilas",
  codePostal: "75011",
  ville: "Paris",
  modeDomiciliation: "Bail commercial ou professionnel",
  capital: 10000,
  partsTotales: 1000,
  capitalLibere: 10000,
  banque: "Qonto",
  dateDebutActivite: "2026-09-01",
  dateCloturePremierExercice: "2027-12-31",
  dureeDeVie: 99,
  optionFiscale: "IS",
  regimeTva: "Régime réel simplifié",
  paraphes: "CD",
  offre: "business",
  associes: [
    {
      type: "physique",
      personne: {
        civilite: "Madame",
        prenom: "Camille",
        nom: "Durand",
        email: "camille@exemple.fr",
        adresse: "8 avenue des Tilleuls",
        dateDeNaissance: "1990-04-12",
        villeDeNaissance: "Lyon",
        codePostalDeNaissance: "69003",
        paysDeNaissance: "France",
        nomDuPere: "Jean MARTIN",
        nomDeLaMere: "Anne DUBOIS",
        nationalite: "Française",
        situationMatrimoniale: "Marié(e)",
        conjoint: {
          civilite: "Monsieur",
          prenom: "Paul",
          nom: "DURAND",
          regimeMatrimonial: "Séparation de biens",
          dateMariage: "2018-06-16",
          villeMariage: "Paris",
          contratDeMariage: true,
        },
      },
      parts: 1000,
      versement: 10000,
    },
  ],
  dirigeants: [{ associe: 0, remuneration: "Fixe", regimeSocial: "Assimilé salarié" }],
};

const donnees = donneesDeGabarit(complet, {
  maintenant: new Date("2026-08-11T10:00:00"),
  villeRcs: "Paris",
});
const fournis = new Set(Object.keys(donnees));

/*
 * Les gabarits de la création, et eux seuls.
 *
 * Les autres parcours ont leurs propres données et leur propre couverture : celle de
 * la modification, et celle de l'approbation des comptes dans comptes-actes. Les
 * mesurer ici avec les données d'une création signalerait comme manquants des champs
 * qu'aucune création ne connaît.
 */
const gabarits = readdirSync(GABARITS).filter(
  (f) => f.endsWith(".docx") && !f.startsWith("modif-") && !f.startsWith("comptes-")
);

describe("les gabarits de création reçoivent tous leurs champs", () => {
  it("il y a bien des gabarits à vérifier", () => {
    expect(gabarits.length).toBeGreaterThan(20);
  });

  for (const gabarit of gabarits) {
    it(gabarit + " n'a aucun champ sans valeur", () => {
      const { champs, sections } = champsDuGabarit(gabarit);
      const manquants = [...champs].filter((c) => !fournis.has(c)).sort();
      const sectionsManquantes = [...sections].filter((c) => !fournis.has(c)).sort();

      expect(manquants, "champs absents du domaine").toEqual([]);
      expect(sectionsManquantes, "sections absentes du domaine").toEqual([]);
    });
  }
});
