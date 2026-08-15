/**
 * L'offre de création d'auto-entreprise.
 *
 * Une seule, parce qu'il n'y a qu'une prestation : un avocat prend le dossier, le
 * dépose au guichet unique, et répond de ce qu'il dépose. Proposer trois formules
 * obligerait à inventer deux versions dégradées du même travail.
 *
 * Ce qui est vendu n'est pas la démarche - elle est gratuite sur le guichet de
 * l'INPI, et le dire franchement vaut mieux que de le laisser découvrir. Ce qui est
 * vendu, c'est qu'un avocat s'en charge, vérifie ce qui est déclaré, et engage sa
 * responsabilité : le code APE qui décide de vos cotisations, la qualification que
 * réclame un métier réglementé, la date de début qui déclenche vos échéances.
 */

/** 149 € hors taxes, la TVA en sus. */
export const PRIX_HT_CENTIMES = 14_900;
export const TAUX_TVA_POURCENT = 20;

export function tvaDe(htCentimes: number): number {
  return Math.round((htCentimes * TAUX_TVA_POURCENT) / 100);
}

export function ttcDe(htCentimes: number): number {
  return htCentimes + tvaDe(htCentimes);
}

export const PRIX_TTC_CENTIMES = ttcDe(PRIX_HT_CENTIMES);

/** « 200 € », « 240 € » : les centimes n'apparaissent pas sur un prix rond. */
export function montantLisible(centimes: number): string {
  const euros = centimes / 100;
  return (
    euros.toLocaleString("fr-FR", {
      minimumFractionDigits: euros % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    }) + " €"
  );
}

export function detailDuPrix(htCentimes: number = PRIX_HT_CENTIMES) {
  return {
    ht: montantLisible(htCentimes),
    tva: montantLisible(tvaDe(htCentimes)),
    ttc: montantLisible(ttcDe(htCentimes)),
  };
}

export const INTITULE = "Création de votre auto-entreprise par un avocat";

/**
 * Ce que la prestation comprend.
 *
 * Chaque ligne dit un travail, non une promesse : « dépôt au guichet unique » se
 * vérifie, « accompagnement personnalisé » ne veut rien dire.
 */
export const PRESTATIONS = [
  "Un avocat relit votre déclaration avant le dépôt",
  "Vérification du code APE, du régime fiscal et des plafonds",
  "Contrôle des pièces, et de la qualification si votre métier l'exige",
  "Dépôt au guichet unique de l'INPI en votre nom",
  "Suivi jusqu'à la réception de votre SIRET",
  "Vos documents conservés dans votre espace",
];

/**
 * Ce que le prix ne cache pas.
 *
 * La démarche est gratuite sur le guichet de l'INPI : le taire ferait croire que le
 * prix est un droit à payer. Quelqu'un qui l'apprend après coup ne revient pas.
 */
export const FRANCHISE =
  "La démarche est gratuite si vous la faites vous-même sur le guichet de l'INPI. Ce que vous payez ici, c'est le travail de l'avocat qui la fait à votre place et en répond.";

/**
 * Les frais administratifs : aucun, à une exception près.
 *
 * L'immatriculation d'un micro-entrepreneur au registre national des entreprises est
 * gratuite, quelle que soit l'activité - commerciale, artisanale ou libérale. Il n'y
 * a ni frais de greffe ni annonce légale, contrairement à une société.
 *
 * Le seul cas payant est l'agent commercial : son inscription au registre spécial
 * relève d'un tarif réglementé, perçu par le greffe et non par nous. L'annoncer ici
 * vaut mieux que de le facturer en supplément après coup.
 */
export const FRAIS_ANNONCES = "Aucun frais administratif : l'immatriculation d'un micro-entrepreneur est gratuite, sans frais de greffe ni annonce légale.";

export const FRAIS_AGENT_COMMERCIAL =
  "Seule exception : l'inscription d'un agent commercial au registre spécial est soumise à un droit d'environ 25 €, perçu par le greffe. Nous vous le disons avant, jamais après.";

/** Le délai annoncé : celui du guichet, non le nôtre. */
export const DELAI = "Dossier déposé sous 48 h ouvrées. Le SIRET est délivré par l'INSEE sous 1 à 4 semaines.";

export type EtatPaiement = "a_payer" | "en_cours" | "paye";

export function etatDuPaiement(reference: string | null, paye: boolean): EtatPaiement {
  if (paye) return "paye";
  return reference ? "en_cours" : "a_payer";
}
