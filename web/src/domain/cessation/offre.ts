/**
 * Ce que coûte la fermeture d'une auto-entreprise.
 *
 * Rien d'autre que nos honoraires : la formalité est gratuite au guichet unique - ni
 * annonce légale, ni frais de greffe, ni droit d'enregistrement. C'est la seule
 * formalité de la plateforme dans ce cas, et il faut le dire plutôt que de le laisser
 * découvrir : un client qui apprend après coup qu'il aurait pu le faire seul pour zéro
 * euro ne revient pas.
 *
 * Ce qu'il achète, ce n'est donc pas la démarche : c'est de ne rien oublier après. Une
 * dernière déclaration de chiffre d'affaires manquée entretient un compte URSSAF ouvert,
 * avec ses mises en demeure.
 */

export const TVA = 0.2;

/** Nos honoraires : la déclaration, le calendrier des suites, et le dépôt. */
export const HONORAIRES_CENTIMES = 7_900;

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

export function devisDeCessation(nature: "definitive" | "temporaire"): Devis {
  const honoraires: Ligne[] = [
    {
      libelle:
        nature === "temporaire"
          ? "Suspension d'activité"
          : "Cessation d'activité et radiation",
      precision:
        "Déclaration au guichet unique, calendrier de vos échéances, suivi jusqu'à confirmation",
      centimes: HONORAIRES_CENTIMES,
      horsTaxes: true,
    },
  ];

  const honorairesHT = HONORAIRES_CENTIMES;
  const honorairesTTC = Math.round(HONORAIRES_CENTIMES * (1 + TVA));

  return {
    honoraires,
    frais: [],
    honorairesHT,
    honorairesTTC,
    fraisTTC: 0,
    totalTTC: honorairesTTC,
  };
}

export const INTITULE = "Fermeture d'auto-entreprise";

export const PRESTATIONS = [
  "Déclaration de cessation ou de suspension au guichet unique",
  "Calendrier daté de vos dernières obligations, URSSAF et impôts",
  "Radiation du registre des agents commerciaux quand elle s'impose",
  "Suivi jusqu'à la confirmation de radiation",
];

export const DELAI = "Votre déclaration déposée sous 48 heures ouvrées.";
