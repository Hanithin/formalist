/**
 * Ce qui manque à un dossier de fermeture, et ce qui ne tient pas debout.
 *
 * La vérification suit les phases. Un dossier dont la dissolution est réglée mais dont
 * la liquidation n'a pas commencé n'est pas incomplet : il attend. Réclamer un actif
 * réalisé à ce moment-là bloquerait tous les dossiers en cours pendant des mois.
 *
 * Les incohérences comptent autant que les vides. Une clôture datée avant la
 * dissolution, un mandat de liquidateur dépassé, un actif net négatif : chacune produit
 * un acte que le greffe refuse, ou pire, un acte qu'il accepte et qui laisse un
 * créancier impayé derrière une société radiée.
 */

import { champVisible } from "@/domain/modification/types";
import { CHAMPS_DISSOLUTION, CHAMPS_CLOTURE, CHAMPS_TUP, type Champ } from "./types";
import { decisionDeDissolution } from "./decision";
import { resultatDeLaLiquidation } from "./liquidation";
import { termeDuMandat } from "./delais";
import { estUnipersonnelle } from "./voie";

export interface Anomalie {
  champ: string;
  message: string;
  /** La phase où le manque se répare. */
  phase: "societe" | "dissolution" | "cloture";
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

export interface Contexte {
  voie: "liquidation-amiable" | "tup";
  phase: "dissolution" | "cloture";
  societe: Societe;
  valeurs: Valeurs;
  /** Le nombre d'associés, qui décide de la majorité comme du droit de partage. */
  nombreDAssocies: number;
}

function rempli(valeur: unknown): boolean {
  return String(valeur ?? "").trim().length > 0;
}

function nombre(valeur: unknown): number {
  const lu = Number(String(valeur ?? "").replace(",", "."));
  return Number.isFinite(lu) ? lu : 0;
}

function centimes(valeur: unknown): number {
  return Math.round(nombre(valeur) * 100);
}

export function unipersonnelleDans(contexte: {
  societe: Societe;
  nombreDAssocies: number;
}): boolean {
  return estUnipersonnelle(contexte.societe.forme) || contexte.nombreDAssocies <= 1;
}

/**
 * Les champs que l'écran montre vraiment.
 *
 * Deux conditions ne s'expriment pas dans la définition d'un champ, parce qu'elles
 * portent sur la forme sociale et non sur une valeur saisie : la question de la date du
 * 4 août 2005 ne concerne que les SARL, et celle de la clause statutaire ne se pose que
 * là où la loi renvoie aux statuts. Les poser à tous ferait répondre à côté.
 */
export function champsAffiches(contexte: Contexte): Champ[] {
  const forme = (contexte.societe.forme ?? "").trim().toUpperCase();
  const unipersonnelle = unipersonnelleDans(contexte);
  const regle = decisionDeDissolution({
    forme,
    unipersonnelle,
    avantAout2005: contexte.valeurs.sarlAvant2005 === "Oui",
  });

  const source =
    contexte.voie === "tup"
      ? CHAMPS_TUP
      : contexte.phase === "dissolution"
        ? CHAMPS_DISSOLUTION
        : CHAMPS_CLOTURE;

  return source.filter((champ) => {
    if (!champVisible(champ, contexte.valeurs)) return false;
    if (champ.identifiant === "sarlAvant2005") return forme === "SARL" && !unipersonnelle;
    if (champ.identifiant === "majoriteStatutaire") return regle.auxStatuts && !unipersonnelle;
    return true;
  });
}

function verifierSociete(societe: Societe): Anomalie[] {
  const anomalies: Anomalie[] = [];
  const exiger = (champ: keyof Societe, message: string) => {
    if (!rempli(societe[champ])) anomalies.push({ champ, message, phase: "societe" });
  };

  exiger("denomination", "Cherchez la société au registre");
  exiger("forme", "La forme juridique est requise");
  exiger("siren", "Le SIREN est requis");
  exiger("adresse", "L'adresse du siège est requise");

  /*
   * Le capital n'est pas un détail dans une fermeture.
   *
   * C'est lui qui sépare le boni du mali : sans lui, tout le reste du calcul est faux,
   * et l'acte annonce un partage qui n'a pas eu lieu.
   */
  if (!societe.capital || societe.capital <= 0) {
    anomalies.push({
      champ: "capital",
      message: "Le capital social est requis : c'est lui qui distingue le boni du mali",
      phase: "societe",
    });
  }

  return anomalies;
}

function verifierChamps(contexte: Contexte): Anomalie[] {
  const phase = contexte.voie === "tup" ? "dissolution" : contexte.phase;
  return champsAffiches(contexte)
    .filter((champ) => champ.obligatoire && !rempli(contexte.valeurs[champ.identifiant]))
    .map((champ) => ({
      champ: champ.identifiant,
      message: champ.libelle + " est requis",
      phase,
    }));
}

function verifierDates(contexte: Contexte): Anomalie[] {
  const anomalies: Anomalie[] = [];
  const dissolution = String(contexte.valeurs.dateDissolution ?? "");
  const cloture = String(contexte.valeurs.dateCloture ?? "");
  const arrete = String(contexte.valeurs.dateArreteDesComptes ?? "");

  if (dissolution && cloture && cloture <= dissolution) {
    anomalies.push({
      champ: "dateCloture",
      message: "La clôture ne peut pas précéder la dissolution, ni tomber le même jour",
      phase: "cloture",
    });
  }

  /*
   * Le mandat du liquidateur ne dépasse pas trois ans.
   *
   * Au-delà, il faut faire proroger le mandat par le président du tribunal. Une clôture
   * décidée après le terme, sans prorogation, est irrégulière - et rien dans le dossier
   * ne le signale au greffe, qui l'enregistre.
   */
  const terme = termeDuMandat(dissolution);
  if (terme && cloture && cloture > terme) {
    anomalies.push({
      champ: "dateCloture",
      message:
        "Le mandat du liquidateur a expiré le " +
        terme.split("-").reverse().join("/") +
        " : sa prorogation doit être demandée au président du tribunal avant de clôturer",
      phase: "cloture",
    });
  }

  if (arrete && cloture && arrete > cloture) {
    anomalies.push({
      champ: "dateArreteDesComptes",
      message: "Les comptes s'arrêtent avant d'être approuvés, non après",
      phase: "cloture",
    });
  }

  return anomalies;
}

export function verifierFermeture(contexte: Contexte): Anomalie[] {
  const anomalies: Anomalie[] = [
    ...verifierSociete(contexte.societe),
    ...verifierChamps(contexte),
    ...verifierDates(contexte),
  ];

  if (contexte.voie === "liquidation-amiable" && contexte.phase === "cloture") {
    const resultat = resultatDeLaLiquidation({
      actifRealiseCentimes: centimes(contexte.valeurs.actifRealise),
      passifApureCentimes: centimes(contexte.valeurs.passifApure),
      capitalCentimes: Math.round((contexte.societe.capital ?? 0) * 100),
      fraisDeLiquidationCentimes: centimes(contexte.valeurs.fraisDeLiquidation),
      unipersonnelle: unipersonnelleDans(contexte),
    });

    anomalies.push(
      ...resultat.anomalies.map((message) => ({
        champ: "comptesDeLiquidation",
        message,
        phase: "cloture" as const,
      }))
    );
  }

  return anomalies;
}

/** Ce qui manque pour boucler une phase, sans réclamer celle d'après. */
export function manquesDeLaPhase(contexte: Contexte): Anomalie[] {
  const cible = contexte.voie === "tup" ? "dissolution" : contexte.phase;
  return verifierFermeture(contexte).filter(
    (anomalie) => anomalie.phase === "societe" || anomalie.phase === cible
  );
}
