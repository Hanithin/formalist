import { definitions } from "./types";
import { publicationsAPrevoir, type ContextePublication } from "./formalites";

/**
 * Ce que coûte une modification.
 *
 * Deux natures de montant, tenues séparées d'un bout à l'autre :
 *
 *   - nos honoraires, que nous fixons ;
 *   - les frais, que nous avançons et refacturons à l'euro - annonces légales,
 *     greffe, registre, BODACC.
 *
 * Les mélanger dans un prix unique donne un chiffre plus rond, et rend impossible
 * d'expliquer pourquoi un transfert hors ressort coûte plus cher qu'un changement
 * de nom. Ici, la ligne « deuxième annonce légale » apparaît, avec sa raison.
 */

export const TVA = 0.2;

/**
 * Honoraires : la première modification, puis les suivantes.
 *
 * Une deuxième modification décidée dans la même assemblée ne double pas le
 * travail : c'est le même procès-verbal, la même annonce, le même dépôt. Elle
 * ajoute une résolution et une vérification. Le tarif le dit, sans quoi personne
 * ne grouperait ses formalités - et grouper est précisément ce qui coûte le moins
 * cher à tout le monde.
 */
export const HONORAIRES_PREMIERE_CENTIMES = 12_900;
export const HONORAIRES_SUIVANTE_CENTIMES = 4_900;

/**
 * Frais avancés, en centimes.
 *
 * Tarifs 2026. Ils bougent : ils sont ici en un seul endroit, et le récapitulatif
 * les annonce comme une estimation, jamais comme un montant arrêté.
 *
 * L'annonce légale de modification est au forfait dans la plupart des supports
 * habilités. Le greffe, lui, se décompose : émolument, registre national, BODACC.
 */
export const ANNONCE_LEGALE_HT_CENTIMES = 10_800;
export const GREFFE_EMOLUMENT_HT_CENTIMES = 4_226;
export const REGISTRE_NATIONAL_TTC_CENTIMES = 590;
export const BODACC_TTC_CENTIMES = 11_600;
/** Le transfert hors ressort passe par une radiation et une immatriculation. */
export const BODACC_HORS_RESSORT_TTC_CENTIMES = 14_300;
/** Dépôt des statuts à jour, quand le changement les touche. */
export const DEPOT_ACTES_HT_CENTIMES = 605;

export interface Ligne {
  libelle: string;
  /** Ce qui justifie la ligne, quand ce n'est pas évident. */
  precision?: string;
  /** Montant hors taxes en centimes ; les frais déjà TTC ont horsTaxes à false. */
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

export interface ContexteDevis extends ContextePublication {
  /** Les statuts à jour sont-ils déposés au greffe avec la modification ? */
  depotDesStatuts?: boolean;
}

/**
 * Le devis complet.
 *
 * Il se calcule à partir de la seule sélection : c'est ce qui permet de l'afficher
 * dès le choix des modifications, avant toute saisie, plutôt qu'à la fin quand le
 * client a déjà tout rempli.
 */
export function devis(contexte: ContexteDevis): Devis {
  const choisies = definitions(contexte.codes);

  const honoraires: Ligne[] = choisies.map((definition, rang) => ({
    libelle: definition.libelle,
    precision: rang === 0 ? undefined : "Décidée dans la même assemblée",
    centimes: rang === 0 ? HONORAIRES_PREMIERE_CENTIMES : HONORAIRES_SUIVANTE_CENTIMES,
    horsTaxes: true,
  }));

  const publications = publicationsAPrevoir(contexte);
  const horsRessort = publications.length > 1;

  const frais: Ligne[] = publications.map((publication, rang) => ({
    libelle: "Annonce légale - " + publication.ressort,
    precision:
      rang === 1
        ? "Un transfert hors ressort impose une parution dans chaque département (article R. 210-19 du code de commerce)"
        : undefined,
    centimes: ANNONCE_LEGALE_HT_CENTIMES,
    horsTaxes: true,
  }));

  if (choisies.length > 0) {
    frais.push(
      {
        libelle: "Émolument du greffe",
        precision: "Inscription modificative au registre du commerce",
        centimes: GREFFE_EMOLUMENT_HT_CENTIMES,
        horsTaxes: true,
      },
      {
        libelle: "Registre national des entreprises",
        centimes: REGISTRE_NATIONAL_TTC_CENTIMES,
        horsTaxes: false,
      },
      {
        libelle: "Publication au BODACC",
        precision: horsRessort ? "Tarif du transfert hors ressort" : undefined,
        centimes: horsRessort ? BODACC_HORS_RESSORT_TTC_CENTIMES : BODACC_TTC_CENTIMES,
        horsTaxes: false,
      }
    );
  }

  if (contexte.depotDesStatuts) {
    frais.push({
      libelle: "Dépôt des statuts à jour",
      centimes: DEPOT_ACTES_HT_CENTIMES,
      horsTaxes: true,
    });
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

/** « 129,00 € » - le format d'un devis, où les centimes se lisent. */
export function montantLisible(centimes: number): string {
  return (centimes / 100).toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  });
}

export const INTITULE = "Modification de société";

export const PRESTATIONS = [
  "Vérification de votre dossier par un avocat",
  "Procès-verbal d'assemblée et actes rédigés",
  "Statuts mis à jour, retouchés article par article",
  "Publication de l'annonce légale",
  "Dépôt au guichet unique et suivi jusqu'à l'extrait à jour",
];

export const DELAI = "Comptez trois à sept jours ouvrés après la parution de l'annonce.";

/** L'état du règlement d'un dossier, tel que la page l'interroge. */
export function etatDuPaiement(donnees: { paye?: boolean } | null | undefined) {
  return { paye: donnees?.paye === true };
}
