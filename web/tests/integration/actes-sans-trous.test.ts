import { describe, it, expect } from "vitest";
import PizZip from "pizzip";
import { donneesDuPvAge } from "@/domain/modification/pv-age";
import { donneesDuTraite } from "@/domain/modification/traite-apport";
import { actesDeCession, donneesDeLActeDeCession } from "@/domain/modification/acte-cession";
import { verifierModification } from "@/domain/modification/verification";
import {
  rendreLePvAge,
  rendreLeTraiteDApport,
  rendreLActeDeCession,
} from "@/infrastructure/documents/modeles-cabinet";
import type { ContexteGabarit } from "@/domain/modification/gabarit";

/**
 * Aucun acte ne sort avec un blanc.
 *
 * Les modèles universels portent près de cent balises chacun. Une valeur absente ne
 * fait pas échouer le rendu : elle s'écrit vide, et laisse sa ponctuation derrière
 * elle. « La Société Bénéficiaire a notamment pour objet . », « dont le siège social
 * est situé , », « avec effet au - ». L'acte part alors à l'enregistrement avec
 * l'allure d'un brouillon, et rien dans la chaîne ne l'a signalé.
 *
 * Deux garanties, donc. Un dossier d'avant - ouvert quand ces champs n'existaient pas -
 * doit être refusé par les contrôles, avec un message qui nomme le champ. Et un
 * dossier que les contrôles laissent passer doit produire des actes sans un seul trou.
 *
 * Le second point est ce qui protège l'avenir : une balise ajoutée demain au modèle,
 * sans champ pour l'alimenter, fera échouer ce test au lieu de sortir en production.
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
 * Les traces d'une valeur absente.
 *
 * Un blanc ne se voit pas ; c'est la ponctuation restée seule qui le trahit - une
 * virgule qui suit un espace, une parenthèse vide, un tiret là où un mot manque.
 */
const TROUS: { motif: RegExp; quoi: string }[] = [
  { motif: /\s,\s*[,.]/, quoi: "virgule suspendue" },
  { motif: /\(\s*\)/, quoi: "parenthèse vide" },
  { motif: /:\s*\./, quoi: "deux-points sans suite" },
  { motif: /\bpour objet\s*\./, quoi: "objet social absent" },
  { motif: /\bsitué\s*[,.]/, quoi: "adresse absente" },
  { motif: /\bau -\b|\bdu -\b|\ble -\b/, quoi: "date absente" },
  { motif: / {2,}[,.]/, quoi: "double espace avant ponctuation" },
  { motif: /\{[a-z0-9_]+\}/, quoi: "balise non rendue" },
];

function trousDe(texte: string): string[] {
  const trouves: string[] = [];
  for (const ligne of texte.split("\n")) {
    if (!ligne.trim()) continue;
    for (const { motif, quoi } of TROUS) {
      if (motif.test(ligne)) {
        trouves.push(quoi + " : " + ligne.trim().slice(0, 110));
        break;
      }
    }
  }
  return trouves;
}

/** Un dossier complet, tel que les contrôles l'acceptent. */
const COMPLET = {
  societe: {
    denomination: "ATELIER LAUGIER",
    forme: "SAS",
    siren: "552100554",
    adresse: "12 rue Vauban",
    codePostal: "69006",
    ville: "Lyon",
    capital: 10000,
    villeRcs: "Lyon",
  },
  assemblee: {
    date: "2026-09-15",
    totalParts: 1000,
    associes: [
      {
        nature: "physique",
        civilite: "Monsieur",
        prenom: "Paul",
        nom: "DURAND",
        parts: 600,
        neLe: "1972-06-18",
        neA: "Nantes (Loire-Atlantique)",
        nationalite: "Française",
        adresse: "7 rue Sainte-Catherine, 69001 Lyon",
      },
      {
        nature: "physique",
        civilite: "Madame",
        prenom: "Anne",
        nom: "ROUSSEL",
        parts: 400,
        neLe: "1980-11-02",
        neA: "Grenoble (Isère)",
        nationalite: "Française",
        adresse: "14 cours Gambetta, 69007 Lyon",
      },
    ],
  },
  codes: ["apport_titres", "cession_parts"],
  valeurs: {
    /* L'apport de titres */
    apporteeDenomination: "CIBLE",
    apporteeForme: "SARL",
    apporteeSiren: "512345678",
    apporteeSiege: "34 rue Laugier, 75017 Paris",
    apporteeRcs: "Paris",
    apporteeCapital: "10000",
    apporteeNbTitres: "500",
    apporteeNominale: "20",
    apportNbTitres: "500",
    apportOrigineTitres: "Souscription à la constitution",
    apportValeur: "100000",
    apportMethodeValorisation: "Actif net comptable",
    apportCommissaire: "Oui",
    apportCommissaireNom: "Cabinet AUDIT RHÔNE",
    apportNominaleBeneficiaire: "10",
    beneficiaireObjet: "la prise de participation dans toutes sociétés",
    apporteurNomComplet: "Monsieur Paul DURAND",
    apporteurNeLe: "1985-03-04",
    apporteurNeA: "Lyon (Rhône)",
    apporteurNationalite: "Française",
    apporteurAdresse: "12 rue Vauban, 69006 Lyon",
    apporteurQualite: "Associé unique et représentant légal",
    apportControle: "Oui",
    apportDateEffet: "2026-09-30",
    apportDateSignature: "2026-09-28",
    apportLieuSignature: "Lyon",
    apportDateLimiteCondition: "2026-12-31",
    /* La cession */
    agrementRequis: "Non",
  },
  cessions: [
    {
      cedant: 0,
      parts: 100,
      prix: 1000,
      date: "2026-09-15",
      vers: "tiers",
      nom: "Monsieur Julien BERNARD",
      nature: "physique",
      neLe: "1980-05-12",
      neA: "Paris",
      nationalite: "Française",
      adresse: "3 rue des Lilas, 69003 Lyon",
    },
  ],
} as unknown as ContexteGabarit;

function refus(contexte: ContexteGabarit) {
  return verifierModification(
    contexte.codes,
    contexte.valeurs,
    contexte.societe,
    contexte.assemblee,
    contexte.cessions
  );
}

describe("un dossier complet produit des actes sans blanc", () => {
  it("le procès-verbal", () => {
    expect(refus(COMPLET)).toEqual([]);
    expect(trousDe(texteDu(rendreLePvAge(donneesDuPvAge(COMPLET))))).toEqual([]);
  });

  it("le traité d'apport", () => {
    expect(trousDe(texteDu(rendreLeTraiteDApport(donneesDuTraite(COMPLET))))).toEqual([]);
  });

  it("l'acte de cession", () => {
    const groupes = actesDeCession(COMPLET);
    const acte = rendreLActeDeCession(donneesDeLActeDeCession(COMPLET, groupes[0]));
    expect(trousDe(texteDu(acte))).toEqual([]);
  });
});

describe("un dossier d'avant est refusé, non rendu à trous", () => {
  /**
   * Ce qu'un dossier ouvert avant ces champs porte : la société, l'assemblée, et rien
   * de ce que les modèles ont appris à écrire depuis.
   */
  const ANCIEN = {
    ...COMPLET,
    valeurs: {
      apporteeDenomination: "CIBLE",
      apporteeForme: "SARL",
      apporteeSiren: "512345678",
      apporteeCapital: "10000",
      apporteeNbTitres: "500",
      apporteeNominale: "20",
      apportNbTitres: "500",
      apportValeur: "100000",
      apportNominaleBeneficiaire: "10",
      apporteurNomComplet: "Monsieur Paul DURAND",
      apporteurQualite: "Associé unique et représentant légal",
      apportControle: "Oui",
      apportCommissaire: "Oui",
      apportCommissaireNom: "Cabinet AUDIT",
    },
    cessions: [{ cedant: 0, parts: 100, prix: 1000, vers: "tiers", nom: "ACQUEREUR" }],
  } as unknown as ContexteGabarit;

  it("nomme chaque champ qui manque", () => {
    const manques = refus(ANCIEN).map((a) => a.champ);

    /* Ceux que le traité écrit et qui laissaient un blanc. */
    expect(manques).toContain("apporteeSiege");
    expect(manques).toContain("beneficiaireObjet");
    expect(manques).toContain("apportDateSignature");
    expect(manques).toContain("apportDateLimiteCondition");
  });

  it("relève la date de cession, que seul l'écran vérifiait", () => {
    /*
     * Les contrôles des cessions ne tournaient que dans le formulaire. La route de
     * paiement et la production des actes ne les voyaient pas : un dossier sans date
     * produisait un procès-verbal annonçant la cession « avec effet au - ».
     */
    expect(refus(ANCIEN).map((a) => a.champ)).toContain("cession-0-date");
  });

  it("refuse assez tôt pour qu'aucun acte ne soit produit", () => {
    // C'est verifierModification que la production interroge avant d'écrire.
    expect(refus(ANCIEN).length).toBeGreaterThan(0);
  });
});
