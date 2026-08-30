/**
 * Ce qui manque à un dossier de cessation, et ce qui ne tient pas debout.
 *
 * Peu de champs, donc peu de vides possibles. Restent deux incohérences qui produisent
 * une déclaration refusée : une date d'arrêt postérieure à aujourd'hui - on ne déclare
 * pas une cessation à venir - et une suspension dont le terme dépasse la durée légale.
 */

import { champVisible } from "@/domain/modification/types";
import { CHAMPS_CESSATION, type Champ } from "./types";
import { dureeMaximaleDeSuspension, type Nature } from "./regles";

export interface Anomalie {
  champ: string;
  message: string;
}

export interface Entreprise {
  denomination?: string;
  siren?: string;
  activite?: string;
  adresse?: string;
  codePostal?: string;
  ville?: string;
}

export type Valeurs = Record<string, string | number | undefined>;

export interface Contexte {
  nature: Nature;
  entreprise: Entreprise;
  valeurs: Valeurs;
  /** La date du jour, paramétrable pour que la règle se teste. */
  aujourdHui?: Date;
}

function rempli(valeur: unknown): boolean {
  return String(valeur ?? "").trim().length > 0;
}

export function champsAffiches(contexte: Contexte): Champ[] {
  return CHAMPS_CESSATION.filter((champ) => champVisible(champ, contexte.valeurs));
}

export function verifierCessation(contexte: Contexte): Anomalie[] {
  const anomalies: Anomalie[] = [];
  const { entreprise, valeurs } = contexte;

  if (!rempli(entreprise.denomination)) {
    anomalies.push({ champ: "denomination", message: "Cherchez votre entreprise au registre" });
  }
  if (!rempli(entreprise.siren)) {
    anomalies.push({ champ: "siren", message: "Le SIREN est requis" });
  }

  for (const champ of champsAffiches(contexte)) {
    if (champ.obligatoire && !rempli(valeurs[champ.identifiant])) {
      anomalies.push({ champ: champ.identifiant, message: champ.libelle + " : à renseigner" });
    }
  }

  /*
   * On ne déclare pas une cessation qui n'a pas eu lieu.
   *
   * Le guichet refuse une date future : l'activité doit avoir cessé pour qu'on puisse
   * en déclarer l'arrêt. Une date au futur est presque toujours une erreur de saisie -
   * l'année, le plus souvent.
   */
  const date = String(valeurs.dateCessation ?? "");
  const aujourdHui = (contexte.aujourdHui ?? new Date()).toISOString().slice(0, 10);
  if (date && date > aujourdHui) {
    anomalies.push({
      champ: "dateCessation",
      message: "La date d'arrêt ne peut pas être dans le futur : le guichet la refuserait",
    });
  }

  /*
   * Une suspension a un terme, et il est court.
   *
   * Un an, deux pour une activité commerciale. Au-delà, ce n'est plus une suspension :
   * c'est une entreprise en sommeil, que l'administration radie d'office.
   */
  if (contexte.nature === "temporaire" && rempli(valeurs.dateReprise) && date) {
    const annees = dureeMaximaleDeSuspension(valeurs.activiteCommerciale === "Oui");
    const terme = new Date(date + "T00:00:00Z");
    terme.setUTCFullYear(terme.getUTCFullYear() + annees);

    if (String(valeurs.dateReprise) > terme.toISOString().slice(0, 10)) {
      anomalies.push({
        champ: "dateReprise",
        message:
          "Une suspension ne peut pas dépasser " +
          (annees > 1 ? "deux ans" : "un an") +
          " : au-delà, il faut reprendre ou fermer",
      });
    }
  }

  return anomalies;
}
