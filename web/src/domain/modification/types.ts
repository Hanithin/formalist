/**
 * Ce qu'on peut changer dans une société, et ce qu'il faut saisir pour chaque
 * changement.
 *
 * Repris de public/js/modification/types.js, dont le port précédent n'avait gardé
 * qu'un à trois champs par type là où l'original en comptait jusqu'à treize. Les
 * champs manquants ne sont pas décoratifs : ce sont eux que les gabarits Word
 * attendent, et sans eux le procès-verbal sort avec des blancs.
 *
 * Les identifiants passent en camelCase, comme partout ailleurs dans le domaine ;
 * la traduction vers les noms des gabarits ({NOUVEAU_SIEGE}, {DATE_EFFET_TRANSFERT_FR})
 * se fait dans gabarit.ts, seul endroit à connaître ces noms-là.
 */

export type TypeModification =
  | "transfert_siege"
  | "denomination"
  | "dirigeant"
  | "objet_social"
  | "augmentation_capital"
  | "reduction_capital"
  | "cession_parts"
  | "prorogation";

export type TypeDeChamp = "texte" | "nombre" | "date" | "choix" | "long" | "adresse";

export interface ChampModification {
  identifiant: string;
  libelle: string;
  type: TypeDeChamp;
  /** Pour les champs de type « choix ». La valeur vide n'y figure pas. */
  options?: string[];
  obligatoire?: boolean;
  /** Le champ occupe les deux colonnes : une adresse ou un texte long. */
  pleineLargeur?: boolean;
  aide?: string;
  indication?: string;
  /**
   * Le champ ne s'affiche que si un autre a l'une de ces valeurs.
   *
   * Nommer une personne, en révoquer une et acter une démission ne demandent pas
   * les mêmes renseignements : tout montrer d'un coup ferait un formulaire de
   * trente champs dont vingt sont sans objet.
   */
  visibleSi?: { champ: string; vaut: string[] };
}

export interface DefinitionModification {
  code: TypeModification;
  libelle: string;
  libelleCourt: string;
  description: string;
  champs: ChampModification[];
}

export const CHANGEMENTS_DIRIGEANT = ["Nomination", "Révocation", "Démission"] as const;

export const MODIFICATIONS: DefinitionModification[] = [
  {
    code: "transfert_siege",
    libelle: "Transfert de siège social",
    libelleCourt: "Siège social",
    description: "Changer l'adresse officielle de la société.",
    champs: [
      {
        identifiant: "nouvelleAdresse",
        libelle: "Nouvelle adresse",
        type: "adresse",
        pleineLargeur: true,
        obligatoire: true,
      },
      { identifiant: "nouvelleVille", libelle: "Nouvelle ville", type: "texte", obligatoire: true },
      {
        identifiant: "nouveauCodePostal",
        libelle: "Nouveau code postal",
        type: "texte",
        obligatoire: true,
      },
      {
        identifiant: "nouveauModeDomiciliation",
        libelle: "Mode de domiciliation",
        type: "choix",
        options: [
          "Bail commercial ou professionnel",
          "Société de domiciliation",
          "Domicile personnel du dirigeant",
        ],
      },
      {
        identifiant: "dateEffetTransfert",
        libelle: "Date d'effet du transfert",
        type: "date",
        obligatoire: true,
      },
    ],
  },
  {
    code: "denomination",
    libelle: "Changement de dénomination",
    libelleCourt: "Dénomination",
    description: "Changer le nom de la société.",
    champs: [
      {
        identifiant: "nouvelleDenomination",
        libelle: "Nouvelle dénomination sociale",
        type: "texte",
        pleineLargeur: true,
        obligatoire: true,
      },
      { identifiant: "sigle", libelle: "Sigle", type: "texte", indication: "Facultatif" },
      {
        identifiant: "dateEffetDenomination",
        libelle: "Date d'effet",
        type: "date",
        obligatoire: true,
      },
    ],
  },
  {
    code: "dirigeant",
    libelle: "Changement de dirigeant",
    libelleCourt: "Dirigeant",
    description: "Nommer un dirigeant, en révoquer un, acter une démission.",
    champs: [
      {
        identifiant: "typeChangementDirigeant",
        libelle: "Nature du changement",
        type: "choix",
        options: [...CHANGEMENTS_DIRIGEANT],
        pleineLargeur: true,
        obligatoire: true,
      },
      {
        identifiant: "fonctionDirigeant",
        libelle: "Fonction",
        type: "choix",
        options: ["Président", "Gérant", "Directeur général", "Co-gérant"],
        obligatoire: true,
      },
      {
        identifiant: "dateEffetDirigeant",
        libelle: "Date de prise d'effet",
        type: "date",
        obligatoire: true,
      },

      {
        identifiant: "nouveauDirigeantCivilite",
        libelle: "Civilité",
        type: "choix",
        options: ["Monsieur", "Madame"],
        obligatoire: true,
        visibleSi: { champ: "typeChangementDirigeant", vaut: ["Nomination"] },
      },
      {
        identifiant: "nouveauDirigeantPrenom",
        libelle: "Prénom",
        type: "texte",
        obligatoire: true,
        visibleSi: { champ: "typeChangementDirigeant", vaut: ["Nomination"] },
      },
      {
        identifiant: "nouveauDirigeantNom",
        libelle: "Nom",
        type: "texte",
        obligatoire: true,
        visibleSi: { champ: "typeChangementDirigeant", vaut: ["Nomination"] },
      },
      {
        identifiant: "nouveauDirigeantDateNaissance",
        libelle: "Date de naissance",
        type: "date",
        obligatoire: true,
        visibleSi: { champ: "typeChangementDirigeant", vaut: ["Nomination"] },
      },
      {
        identifiant: "nouveauDirigeantLieuNaissance",
        libelle: "Lieu de naissance",
        type: "texte",
        indication: "Ville, pays",
        obligatoire: true,
        visibleSi: { champ: "typeChangementDirigeant", vaut: ["Nomination"] },
      },
      {
        identifiant: "nouveauDirigeantNationalite",
        libelle: "Nationalité",
        type: "texte",
        indication: "Française",
        visibleSi: { champ: "typeChangementDirigeant", vaut: ["Nomination"] },
      },
      {
        identifiant: "nouveauDirigeantAdresse",
        libelle: "Adresse personnelle",
        type: "adresse",
        pleineLargeur: true,
        obligatoire: true,
        visibleSi: { champ: "typeChangementDirigeant", vaut: ["Nomination"] },
      },
      {
        identifiant: "nouveauDirigeantNomPere",
        libelle: "Nom et prénom du père",
        type: "texte",
        obligatoire: true,
        aide: "La déclaration de non-condamnation est aussi une déclaration de filiation : le greffe l'exige.",
        visibleSi: { champ: "typeChangementDirigeant", vaut: ["Nomination"] },
      },
      {
        identifiant: "nouveauDirigeantNomMere",
        libelle: "Nom et prénom de la mère",
        type: "texte",
        obligatoire: true,
        indication: "Nom de jeune fille en capitales",
        visibleSi: { champ: "typeChangementDirigeant", vaut: ["Nomination"] },
      },
      {
        identifiant: "remunerationDirigeant",
        libelle: "Rémunération",
        type: "choix",
        options: ["Non rémunéré", "Fixe", "Variable"],
        visibleSi: { champ: "typeChangementDirigeant", vaut: ["Nomination"] },
      },

      {
        identifiant: "dirigeantRevoqueNom",
        libelle: "Nom du dirigeant révoqué",
        type: "texte",
        pleineLargeur: true,
        obligatoire: true,
        visibleSi: { champ: "typeChangementDirigeant", vaut: ["Révocation"] },
      },
      {
        identifiant: "motifRevocation",
        libelle: "Motif",
        type: "long",
        pleineLargeur: true,
        indication: "Facultatif",
        visibleSi: { champ: "typeChangementDirigeant", vaut: ["Révocation"] },
      },

      {
        identifiant: "dirigeantDemissionnaireNom",
        libelle: "Nom du dirigeant démissionnaire",
        type: "texte",
        pleineLargeur: true,
        obligatoire: true,
        visibleSi: { champ: "typeChangementDirigeant", vaut: ["Démission"] },
      },
    ],
  },
  {
    code: "objet_social",
    libelle: "Modification de l'objet social",
    libelleCourt: "Objet social",
    description: "Changer l'activité déclarée de la société.",
    champs: [
      {
        identifiant: "objetSocialActuel",
        libelle: "Objet social actuel",
        type: "long",
        pleineLargeur: true,
        aide: "Recopiez-le des statuts : le procès-verbal doit dire ce qui est remplacé.",
      },
      {
        identifiant: "nouvelObjetSocial",
        libelle: "Nouvel objet social",
        type: "long",
        pleineLargeur: true,
        obligatoire: true,
      },
      { identifiant: "dateEffetObjet", libelle: "Date d'effet", type: "date", obligatoire: true },
    ],
  },
  {
    code: "augmentation_capital",
    libelle: "Augmentation de capital",
    libelleCourt: "Capital +",
    description: "Augmenter le capital social.",
    champs: [
      {
        identifiant: "capitalActuelAugm",
        libelle: "Capital actuel, en euros",
        type: "nombre",
        obligatoire: true,
      },
      {
        identifiant: "nouveauCapitalAugm",
        libelle: "Nouveau capital, en euros",
        type: "nombre",
        obligatoire: true,
      },
      {
        identifiant: "modeAugmentation",
        libelle: "Mode d'augmentation",
        type: "choix",
        options: ["Apport en numéraire", "Incorporation de réserves", "Apport en nature"],
        pleineLargeur: true,
        obligatoire: true,
        aide: "Un apport en nature impose un commissaire aux apports ; un apport en numéraire, une attestation de dépôt des fonds.",
      },
      {
        identifiant: "nbPartsNouvelles",
        libelle: "Nombre de parts ou actions nouvelles",
        type: "nombre",
      },
      { identifiant: "valeurNominaleAugm", libelle: "Valeur nominale", type: "nombre" },
      { identifiant: "primeEmission", libelle: "Prime d'émission, en euros", type: "nombre" },
      { identifiant: "dateEffetAugm", libelle: "Date d'effet", type: "date", obligatoire: true },
    ],
  },
  {
    code: "reduction_capital",
    libelle: "Réduction de capital",
    libelleCourt: "Capital -",
    description: "Réduire le capital social.",
    champs: [
      {
        identifiant: "capitalActuelRed",
        libelle: "Capital actuel, en euros",
        type: "nombre",
        obligatoire: true,
      },
      {
        identifiant: "nouveauCapitalRed",
        libelle: "Nouveau capital, en euros",
        type: "nombre",
        obligatoire: true,
      },
      {
        identifiant: "motifReduction",
        libelle: "Motif",
        type: "choix",
        options: ["Pertes", "Remboursement aux associés"],
        obligatoire: true,
        aide: "Hors pertes, les créanciers disposent d'un délai d'opposition : le dépôt ne peut pas partir avant son terme.",
      },
      { identifiant: "nbPartsAnnulees", libelle: "Nombre de parts annulées", type: "nombre" },
      { identifiant: "dateEffetRed", libelle: "Date d'effet", type: "date", obligatoire: true },
    ],
  },
  {
    code: "cession_parts",
    libelle: "Cession de parts ou d'actions",
    libelleCourt: "Cession",
    description: "Transférer des parts d'un associé à un autre.",
    /*
     * Aucun champ générique.
     *
     * Une cession désigne des associés, se compte à plusieurs dans une assemblée, et sa
     * répartition se calcule : six cases côte à côte ne peuvent rien vérifier de tout
     * cela. L'écran a son propre bloc, et sa vérification est dans le domaine des
     * cessions. Les laisser déclarés ici les rendait obligatoires alors qu'ils ne
     * s'affichent plus : on ne pouvait plus passer l'étape.
     */
    champs: [],
  },
  {
    code: "prorogation",
    libelle: "Prorogation de la durée",
    libelleCourt: "Prorogation",
    description: "Prolonger la durée de vie de la société.",
    champs: [
      {
        identifiant: "dureeActuelle",
        libelle: "Durée actuelle, en années",
        type: "nombre",
        obligatoire: true,
      },
      {
        identifiant: "nouvelleDuree",
        libelle: "Nouvelle durée, en années",
        type: "nombre",
        obligatoire: true,
      },
      {
        identifiant: "dateExpirationActuelle",
        libelle: "Date d'expiration actuelle",
        type: "date",
        obligatoire: true,
        aide: "La prorogation se décide avant le terme. Les associés doivent être consultés au moins un an avant (article 1844-6 du code civil).",
      },
    ],
  },
];

export const CODES_MODIFICATION: TypeModification[] = MODIFICATIONS.map((m) => m.code);

export function definitionModification(code: string): DefinitionModification | null {
  return MODIFICATIONS.find((m) => m.code === code) ?? null;
}

export function estUnTypeConnu(code: string): code is TypeModification {
  return CODES_MODIFICATION.includes(code as TypeModification);
}

/** Les définitions correspondant à une sélection, dans l'ordre d'affichage. */
export function definitions(codes: string[]): DefinitionModification[] {
  return MODIFICATIONS.filter((m) => codes.includes(m.code));
}

export type Valeurs = Record<string, string | number | undefined>;

/**
 * Un champ conditionnel est-il à saisir ?
 *
 * Un champ caché n'est jamais exigé : le demander reviendrait à bloquer un dossier
 * sur une case que le formulaire ne montre pas.
 */
export function champVisible(champ: ChampModification, valeurs: Valeurs): boolean {
  if (!champ.visibleSi) return true;
  const valeur = valeurs[champ.visibleSi.champ];
  return typeof valeur === "string" && champ.visibleSi.vaut.includes(valeur);
}

/** Les champs réellement affichés pour cette sélection et ces valeurs. */
export function champsASaisir(codes: string[], valeurs: Valeurs): ChampModification[] {
  return definitions(codes)
    .flatMap((d) => d.champs)
    .filter((c) => champVisible(c, valeurs));
}
