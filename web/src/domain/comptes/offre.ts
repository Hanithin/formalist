/**
 * Ce que coûte un dépôt de comptes annuels.
 *
 * Deux natures de montant, tenues séparées comme partout ailleurs : nos honoraires,
 * que nous fixons, et les frais du greffe, que nous avançons et refacturons à l'euro.
 *
 * Une société civile ne dépose rien : elle ne paie donc aucun frais de greffe, et
 * lui en facturer serait lui faire payer une formalité qui n'existe pas.
 */

import { estCivile } from "./regles";

export const TVA = 0.2;

/** Nos honoraires : procès-verbal, affectation, conventions, déclaration et dépôt. */
export const HONORAIRES_CENTIMES = 14_900;

/**
 * Le dépôt des comptes au greffe.
 *
 * Tarif réglementé, arrêté du 26 février 2016 modifié. Il ne dépend ni du chiffre
 * d'affaires ni de la taille, seulement du fait de déposer.
 */
export const GREFFE_DEPOT_TTC_CENTIMES = 45_00;

/** La déclaration de confidentialité s'ajoute au dépôt sans frais propre. */
export const GREFFE_CONFIDENTIALITE_TTC_CENTIMES = 0;

export interface Ligne {
  libelle: string;
  precision?: string;
  centimes: number;
  horsTaxes: boolean;
}

export interface Devis {
  honoraires: Ligne[];
  frais: Ligne[];
  honorairesHT: number;
  honorairesTTC: number;
  fraisTTC: number;
  totalTTC: number;
}

function ttc(ligne: Ligne): number {
  return ligne.horsTaxes ? Math.round(ligne.centimes * (1 + TVA)) : ligne.centimes;
}

export function devisDesComptes(args: {
  forme: string | null | undefined;
  /** Une déclaration de confidentialité est-elle demandée ? */
  confidentialite?: boolean;
}): Devis {
  const honoraires: Ligne[] = [
    {
      libelle: "Approbation et dépôt des comptes annuels",
      precision: "Procès-verbal, affectation du résultat, conventions réglementées",
      centimes: HONORAIRES_CENTIMES,
      horsTaxes: true,
    },
  ];

  const frais: Ligne[] = [];

  if (!estCivile(args.forme)) {
    frais.push({
      libelle: "Dépôt des comptes au greffe",
      precision: "Tarif réglementé, quel que soit le chiffre d'affaires",
      centimes: GREFFE_DEPOT_TTC_CENTIMES,
      horsTaxes: false,
    });

    if (args.confidentialite && GREFFE_CONFIDENTIALITE_TTC_CENTIMES > 0) {
      frais.push({
        libelle: "Déclaration de confidentialité",
        centimes: GREFFE_CONFIDENTIALITE_TTC_CENTIMES,
        horsTaxes: false,
      });
    }
  }

  const honorairesHT = honoraires.reduce((total, l) => total + l.centimes, 0);
  const honorairesTTC = honoraires.reduce((total, l) => total + ttc(l), 0);
  const fraisTTC = frais.reduce((total, l) => total + ttc(l), 0);

  return {
    honoraires,
    frais,
    honorairesHT,
    honorairesTTC,
    fraisTTC,
    totalTTC: honorairesTTC + fraisTTC,
  };
}

export const INTITULE = "Dépôt des comptes annuels";

export const PRESTATIONS = [
  "Procès-verbal d'approbation des comptes, adapté à votre forme sociale",
  "Affectation du résultat, réserve légale calculée",
  "Conventions réglementées : rapport spécial quand la loi l'exige",
  "Déclaration de confidentialité quand vous y avez droit",
  "Dépôt au greffe et suivi jusqu'au récépissé",
];

export const DELAI = "Vos actes sous 48 heures ouvrées, relus par un avocat.";
