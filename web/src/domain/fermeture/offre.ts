/**
 * Ce que coûte la fermeture d'une société.
 *
 * Nos honoraires couvrent la fermeture entière - dissolution et clôture - et se règlent
 * une seule fois, au moment de la dissolution. C'est le moment où la décision est prise ;
 * revenir demander de l'argent six mois plus tard, quand le client a oublié le dossier,
 * ferait échouer des liquidations à la dernière étape.
 *
 * Les frais restent séparés, comme partout ailleurs : ils sont réglementés, nous ne les
 * fixons pas, et ils diffèrent du simple au triple selon la voie et la forme. Une SASU
 * dont l'associé unique préside paie 61,01 € de greffe là où une SARL à trois associés
 * en paie 177,01 € - le devis doit le dire, sans quoi le prix paraît arbitraire.
 *
 * Tarifs 2026. Ils bougent chaque année : ils sont ici, en un seul endroit, et le
 * récapitulatif les annonce comme une estimation.
 */

export const TVA = 0.2;

/** Nos honoraires, quelle que soit la voie : la fermeture complète. */
export const HONORAIRES_CENTIMES = 50_000;

/**
 * Les annonces légales, au forfait.
 *
 * Depuis le 1er janvier 2022, les avis de dissolution et de clôture sont au forfait :
 * ni le nombre de mots ni la forme sociale n'entrent en compte. Arrêté du 19 novembre
 * 2025, applicable au 1er janvier 2026.
 */
export const ANNONCE_DISSOLUTION_HT_CENTIMES = 15_300;
export const ANNONCE_CLOTURE_HT_CENTIMES = 11_100;

/** La Réunion et Mayotte ont leur propre grille. */
export const ANNONCE_DISSOLUTION_OUTREMER_HT_CENTIMES = 18_100;
export const ANNONCE_CLOTURE_OUTREMER_HT_CENTIMES = 12_900;

/**
 * Le greffe, à la dissolution.
 *
 * Le tarif tombe pour une société unipersonnelle dont l'associé unique dirige : le
 * greffe n'a alors qu'une inscription modificative à porter, sans changement de
 * représentant légal.
 */
export const GREFFE_DISSOLUTION_TTC_CENTIMES = 17_701;
export const GREFFE_DISSOLUTION_ASSOCIE_UNIQUE_TTC_CENTIMES = 6_101;

/** La radiation, une fois la liquidation close. */
export const GREFFE_RADIATION_TTC_CENTIMES = 919;

/** Le droit de partage, quand il y a un boni à partager. */
export const TAUX_DROIT_DE_PARTAGE = 0.025;

export interface Ligne {
  libelle: string;
  precision?: string;
  centimes: number;
  horsTaxes: boolean;
  /** Un montant qui dépend de chiffres pas encore connus. */
  estime?: boolean;
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

export interface ContexteDevis {
  voie: "liquidation-amiable" | "tup";
  /** Une société unipersonnelle dont l'associé unique dirige paie moins au greffe. */
  associeUniqueDirigeant: boolean;
  /** La Réunion et Mayotte ont leur propre tarif d'annonce. */
  outreMer?: boolean;
  /** L'assiette du droit de partage, si elle est déjà connue. */
  assietteDuPartageCentimes?: number;
}

export function devisDeFermeture(contexte: ContexteDevis): Devis {
  const honoraires: Ligne[] = [
    {
      libelle:
        contexte.voie === "tup"
          ? "Dissolution sans liquidation"
          : "Dissolution et liquidation amiable",
      precision:
        contexte.voie === "tup"
          ? "Décision, publicité, suivi du délai d'opposition, dissolution et radiation"
          : "Les deux phases : dissolution, puis clôture de liquidation et radiation",
      centimes: HONORAIRES_CENTIMES,
      horsTaxes: true,
    },
  ];

  const frais: Ligne[] = [];

  /*
   * La dissolution sans liquidation ne paie pas d'annonce légale.
   *
   * Depuis le décret n° 2024-751, sa publicité se fait au BODACC, à l'inscription au
   * registre : elle est comprise dans les frais de greffe. C'est la principale économie
   * de cette voie, et le devis doit la montrer plutôt que de la taire.
   */
  if (contexte.voie === "liquidation-amiable") {
    frais.push({
      libelle: "Annonce légale de dissolution",
      precision: "Forfait réglementé, quelle que soit la longueur du texte",
      centimes: contexte.outreMer
        ? ANNONCE_DISSOLUTION_OUTREMER_HT_CENTIMES
        : ANNONCE_DISSOLUTION_HT_CENTIMES,
      horsTaxes: true,
    });
  }

  frais.push({
    libelle:
      contexte.voie === "tup"
        ? "Greffe - inscription de la dissolution et publication au BODACC"
        : "Greffe - inscription de la dissolution",
    precision: contexte.associeUniqueDirigeant
      ? "Tarif réduit : associé unique également dirigeant"
      : undefined,
    centimes: contexte.associeUniqueDirigeant
      ? GREFFE_DISSOLUTION_ASSOCIE_UNIQUE_TTC_CENTIMES
      : GREFFE_DISSOLUTION_TTC_CENTIMES,
    horsTaxes: false,
  });

  if (contexte.voie === "liquidation-amiable") {
    frais.push({
      libelle: "Annonce légale de clôture de liquidation",
      precision: "Dans le même support que l'avis de dissolution",
      centimes: contexte.outreMer
        ? ANNONCE_CLOTURE_OUTREMER_HT_CENTIMES
        : ANNONCE_CLOTURE_HT_CENTIMES,
      horsTaxes: true,
    });
  }

  frais.push({
    libelle: "Greffe - radiation du registre",
    centimes: GREFFE_RADIATION_TTC_CENTIMES,
    horsTaxes: false,
  });

  /*
   * Le droit de partage n'est pas un frais que nous avançons.
   *
   * Il se paie au service des impôts, par la société, à l'enregistrement du procès-verbal
   * de clôture. Il figure au devis parce qu'il fait partie du coût de la fermeture, et
   * qu'un boni de cent mille euros le rend plus lourd que tout le reste réuni.
   */
  const assiette = contexte.assietteDuPartageCentimes ?? 0;
  if (assiette > 0) {
    frais.push({
      libelle: "Droit de partage",
      precision: "2,5 % de l'actif net partagé, réglé au service des impôts des entreprises",
      centimes: Math.round(assiette * TAUX_DROIT_DE_PARTAGE),
      horsTaxes: false,
      estime: true,
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

export const INTITULE = "Fermeture de société";

export const PRESTATIONS = [
  "Orientation : liquidation amiable, dissolution sans liquidation, ou tribunal",
  "Décision de dissolution rédigée selon la majorité propre à votre forme",
  "Nomination du liquidateur, déclaration de non-condamnation, pouvoirs",
  "Textes des annonces légales, prêts à publier",
  "Comptes définitifs de liquidation, boni ou mali calculé",
  "Décision de clôture, quitus au liquidateur et radiation",
  "Dépôt au guichet unique et suivi jusqu'à la radiation",
];

export const DELAI = "Vos actes de dissolution sous 48 heures ouvrées, relus par un avocat.";

/** Ce que le prix ne comprend pas, dit avant le paiement plutôt qu'après. */
export const HORS_FORFAIT = [
  "Le droit de partage de 2,5 %, dû au service des impôts s'il y a un boni à partager",
  "Les déclarations fiscales de cessation, que votre comptable dépose",
  "La reprise en nature d'un bien apporté, qui demande un calcul propre",
];
