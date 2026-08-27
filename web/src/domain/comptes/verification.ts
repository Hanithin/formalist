/**
 * Ce qui manque à un dossier d'approbation, et ce qui ne tient pas debout.
 *
 * Deux familles, comme ailleurs. Les champs vides, qui laisseraient un blanc dans un
 * acte déposé au greffe. Et les incohérences - une clôture avant l'ouverture, une
 * assemblée tenue avant la clôture, une affectation qui ne tombe pas juste - qui
 * passent la validation de forme et se découvrent au refus du greffe, des semaines
 * plus tard.
 */

import { champVisible } from "@/domain/modification/types";
import { CHAMPS_COMPTES, GROUPE_ASSOCIE_UNIQUE, type Champ } from "./types";
import { fonctionsDuDirigeant } from "@/domain/formalite/formes";
import { estCivile, estUnipersonnelle, verifierAffectation, type Affectation } from "./regles";
import { verifierConventions, type Convention } from "./conventions";

export interface Anomalie {
  champ: string;
  message: string;
}

export interface Societe {
  denomination?: string;
  forme?: string;
  siren?: string;
  adresse?: string;
  codePostal?: string;
  ville?: string;
  capital?: number | null;
  villeRcs?: string;
}

export type Valeurs = Record<string, string | number | undefined>;

function rempli(valeur: unknown): boolean {
  return String(valeur ?? "").trim().length > 0;
}

function nombre(valeur: unknown): number {
  const lu = Number(String(valeur ?? "").replace(",", "."));
  return Number.isFinite(lu) ? lu : 0;
}

/**
 * Les champs que cet écran affiche vraiment.
 *
 * L'état civil de l'associé unique n'est demandé qu'aux sociétés qui en ont un : le
 * réclamer à une assemblée de trois associés bloquerait le dossier sur une case que
 * l'écran ne montre pas.
 */
export function champsAffiches(forme: string | null | undefined, valeurs: Valeurs): Champ[] {
  const unipersonnelle = estUnipersonnelle(forme);
  return CHAMPS_COMPTES.filter(
    (champ) =>
      champVisible(champ, valeurs) &&
      (unipersonnelle || champ.groupe !== GROUPE_ASSOCIE_UNIQUE)
  );
}

function verifierSociete(societe: Societe): Anomalie[] {
  const anomalies: Anomalie[] = [];
  if (!rempli(societe.denomination)) {
    anomalies.push({ champ: "denomination", message: "Cherchez la société au registre" });
  }
  if (!rempli(societe.forme)) {
    anomalies.push({ champ: "forme", message: "La forme juridique est requise" });
  }
  if (!rempli(societe.siren)) {
    anomalies.push({ champ: "siren", message: "Le SIREN est requis" });
  }
  if (!rempli(societe.adresse)) {
    anomalies.push({ champ: "adresse", message: "L'adresse du siège est requise" });
  }
  return anomalies;
}

function verifierChamps(forme: string | null | undefined, valeurs: Valeurs): Anomalie[] {
  return champsAffiches(forme, valeurs)
    .filter((champ) => champ.obligatoire && !rempli(valeurs[champ.identifiant]))
    .map((champ) => ({ champ: champ.identifiant, message: champ.libelle + " est requis" }));
}

function verifierDates(valeurs: Valeurs): Anomalie[] {
  const anomalies: Anomalie[] = [];
  const ouverture = String(valeurs.dateOuverture ?? "");
  const cloture = String(valeurs.dateCloture ?? "");
  const assemblee = String(valeurs.dateAssemblee ?? "");

  if (ouverture && cloture && ouverture >= cloture) {
    anomalies.push({
      champ: "dateCloture",
      message: "La clôture doit venir après l'ouverture de l'exercice",
    });
  }

  /*
   * On n'approuve pas des comptes avant de les avoir arrêtés.
   *
   * Une assemblée datée avant la clôture est une faute de saisie dans la quasi-totalité
   * des cas, et elle produit un acte que le greffe refuse.
   */
  if (cloture && assemblee && assemblee < cloture) {
    anomalies.push({
      champ: "dateAssemblee",
      message: "L'assemblée ne peut pas se tenir avant la clôture de l'exercice",
    });
  }

  return anomalies;
}

export interface ContexteVerification {
  societe: Societe;
  valeurs: Valeurs;
  affectation: Affectation;
  conventions: Convention[];
}

export function verifierComptes(contexte: ContexteVerification): Anomalie[] {
  const { societe, valeurs, affectation, conventions } = contexte;

  const anomalies: Anomalie[] = [
    ...verifierSociete(societe),
    ...verifierChamps(societe.forme, valeurs),
    ...verifierDates(valeurs),
  ];

  const verdict = verifierAffectation({
    forme: societe.forme,
    resultatCentimes: Math.round(nombre(valeurs.resultat) * 100),
    reportAnterieurCentimes: Math.round(nombre(valeurs.reportAnterieur) * 100),
    capitalCentimes: Math.round((societe.capital ?? 0) * 100),
    reserveExistanteCentimes: Math.round(nombre(valeurs.reserveLegale) * 100),
    affectation,
  });
  anomalies.push(...verdict.anomalies.map((message) => ({ champ: "affectation", message })));

  /*
   * Les conventions ne se vérifient que là où elles existent.
   *
   * Une société civile patrimoniale n'a aucun régime de conventions réglementées :
   * réclamer l'objet d'une convention qu'elle n'avait pas à déclarer bloquerait son
   * dossier sur une obligation inventée.
   */
  if (!estCivile(societe.forme)) {
    anomalies.push(...verifierConventions(conventions));
  }

  /*
   * La fonction du dirigeant doit exister dans cette forme.
   *
   * L'écran n'offre plus que les titres de la forme choisie, mais un dossier commencé
   * avant en garde un autre - et la déclaration de confidentialité, signée sur
   * l'honneur, part au greffe avec ce titre. Une société d'exercice libéral par actions
   * simplifiée s'y est déposée « en sa qualité de Gérant », titre qui n'existe pas chez
   * elle. Le contrôle se fait ici, où il retient aussi le règlement.
   */
  const fonction = typeof valeurs.dirigeantFonction === "string" ? valeurs.dirigeantFonction : "";
  const admises = fonctionsDuDirigeant(societe.forme);
  if (fonction && societe.forme && !admises.includes(fonction)) {
    anomalies.push({
      champ: "dirigeantFonction",
      message:
        "Une " +
        societe.forme +
        " n'a pas de " +
        fonction.toLowerCase() +
        " : choisissez " +
        admises.slice(0, 2).join(" ou ").toLowerCase() +
        ".",
    });
  }

  return anomalies;
}

/** L'avancement du dossier, pour la barre du parcours. */
export function avancement(contexte: ContexteVerification): number {
  const societeFaite = verifierSociete(contexte.societe).length === 0;
  const champsFaits =
    verifierChamps(contexte.societe.forme, contexte.valeurs).length === 0 &&
    verifierDates(contexte.valeurs).length === 0;
  const affectationFaite =
    verifierAffectation({
      forme: contexte.societe.forme,
      resultatCentimes: Math.round(nombre(contexte.valeurs.resultat) * 100),
      reportAnterieurCentimes: Math.round(nombre(contexte.valeurs.reportAnterieur) * 100),
      capitalCentimes: Math.round((contexte.societe.capital ?? 0) * 100),
      reserveExistanteCentimes: Math.round(nombre(contexte.valeurs.reserveLegale) * 100),
      affectation: contexte.affectation,
    }).anomalies.length === 0;

  const faits = [societeFaite, champsFaits, affectationFaite].filter(Boolean).length;
  return Math.round((faits / 3) * 100);
}
