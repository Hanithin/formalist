/**
 * Ce qu'est une consultation, et ce qu'elle coûte.
 *
 * Ces valeurs sont écrites ici, une fois : la carte d'appel, le récapitulatif de
 * l'assistant, le montant porté au paiement et le panneau de détail doivent dire la
 * même chose. Un prix annoncé à un endroit et encaissé à un autre est le genre
 * d'écart qu'on ne découvre qu'en relevé bancaire.
 */

export const DUREE_MINUTES = 30;
export const DELAI_REPONSE = "24 h ouvrées";

/**
 * Le prix est hors taxes.
 *
 * La page d'origine affichait « 99 € » sans préciser, ce qui laissait deux lectures
 * possibles. C'est un prix hors taxes : la TVA s'y ajoute, et c'est le total qui est
 * encaissé - sinon la TVA serait prélevée sur la marge sans avoir été demandée.
 */
export const PRIX_HT_CENTIMES = 9900;

/** Taux en points de pourcentage : le calcul reste entier, sans arrondi flottant. */
export const TAUX_TVA_POURCENT = 20;

export function tvaDe(htCentimes: number): number {
  return Math.round((htCentimes * TAUX_TVA_POURCENT) / 100);
}

export function ttcDe(htCentimes: number): number {
  return htCentimes + tvaDe(htCentimes);
}

export const PRIX_TTC_CENTIMES = ttcDe(PRIX_HT_CENTIMES);

/**
 * « 99 € », « 118,80 € ».
 *
 * Les centimes ne s'écrivent que s'il y en a, comme le faisait fmtEur : un prix
 * rond suivi de « ,00 » se lit moins bien, et c'est le cas le plus fréquent.
 */
export function montantLisible(centimes: number): string {
  const euros = centimes / 100;
  const ecrit = Number.isInteger(euros) ? String(euros) : euros.toFixed(2).replace(".", ",");
  return ecrit + " €";
}

/** Le détail montré au récapitulatif, avant de payer. */
export function detailDuPrix(htCentimes: number = PRIX_HT_CENTIMES) {
  return {
    ht: htCentimes,
    tva: tvaDe(htCentimes),
    ttc: ttcDe(htCentimes),
  };
}
