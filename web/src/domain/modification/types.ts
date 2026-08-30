import { NATURES_PROPOSEES, natureDeLaForme } from "@/domain/formalite/formes";

/**
 * Les formes dont les titres ne sont pas négociables.
 *
 * L'article 1832-2 du code civil impose d'avertir le conjoint quand un bien commun est
 * apporté contre des parts sociales : elles ne se revendent pas librement, à la
 * différence des actions. Quatre formes étaient nommées ici, et une SELARL, une SCP ou
 * une société civile de moyens y échappaient - l'apport se faisait sans l'avertissement,
 * et le conjoint pouvait en demander la nullité pendant deux ans.
 */
const FORMES_A_PARTS = NATURES_PROPOSEES.filter(
  (f) => natureDeLaForme(f).titres === "parts sociales"
);
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
  | "prorogation"
  | "apport_titres";

export type TypeDeChamp =
  | "texte"
  | "nombre"
  | "date"
  | "choix"
  | "long"
  | "adresse"
  /**
   * Une société, cherchée au registre plutôt que recopiée.
   *
   * Le champ porte la dénomination ; les autres - forme, SIREN, siège, capital,
   * ville du RCS - se remplissent seuls quand on retient un résultat, selon la
   * correspondance déclarée dans `remplit`. Recopier six lignes d'un extrait dans
   * un acte est exactement là où l'erreur se glisse, et elle se paie au greffe.
   */
  | "societe";

/**
 * Ce qu'une recherche au registre sait remplir.
 *
 * La clé est ce que le registre rend, la valeur l'identifiant du champ qui le
 * reçoit. Ce qui n'est pas déclaré n'est pas écrit : un changement qui n'a pas
 * besoin du capital ne se le voit pas imposer.
 */
export interface ChampsRemplisParLeRegistre {
  forme?: string;
  siren?: string;
  siege?: string;
  capital?: string;
  villeRcs?: string;
}

export interface ChampModification {
  identifiant: string;
  libelle: string;
  type: TypeDeChamp;
  /**
   * L'intertitre sous lequel ce champ se range.
   *
   * Trois ou quatre champs se lisent d'affilée ; vingt-six ne se lisent plus du tout.
   * Les changements simples s'en passent - un intertitre pour deux champs n'aide
   * personne - mais l'apport de titres décrit trois sociétés, une valorisation et un
   * régime fiscal dans le même écran, et rien n'y disait où l'un finissait.
   *
   * Les champs d'un même groupe doivent se suivre : l'intertitre s'affiche au premier
   * champ visible dont le groupe change.
   */
  groupe?: string;
  /**
   * La largeur du champ, en colonnes sur six.
   *
   * Trois par défaut, soit la moitié de la ligne. Un code postal n'a pas besoin de la
   * moitié d'un écran, et l'imposer à toute la grille repoussait la ville et l'adresse
   * sur trois lignes distinctes.
   */
  colonnes?: 1 | 2 | 4;
  /**
   * Les formes juridiques que ce champ concerne.
   *
   * L'information du conjoint sur l'apport d'un bien commun (article 1832-2 du code
   * civil) ne vaut que pour les sociétés dont les titres ne sont pas négociables :
   * SARL, EURL, SCI, SNC. La poser à une SAS demanderait à quelqu'un de se prononcer
   * sur une règle qui ne s'applique pas à lui.
   *
   * Forme inconnue : le champ paraît. Mieux vaut une question de trop qu'une mention
   * légale tue parce qu'on ne savait pas à qui l'on parlait.
   */
  formes?: string[];
  /** Pour les champs de type « choix ». La valeur vide n'y figure pas. */
  options?: string[];
  /** Pour les champs de type « societe » : où verser ce que le registre rend. */
  remplit?: ChampsRemplisParLeRegistre;
  obligatoire?: boolean;
  /** Le champ occupe les deux colonnes : une adresse ou un texte long. */
  pleineLargeur?: boolean;
  aide?: string;
  indication?: string;
  /**
   * Ce qui s'écrit d'avance, faute d'autre réponse.
   *
   * Une indication grise se lit et ne se garde pas : « Française par défaut » sous une
   * case vide laisse l'acte sans nationalité si l'on passe outre. Une valeur par défaut
   * est là, modifiable, et part avec le dossier.
   *
   * Elle ne vaut que pour ce qui est vrai presque toujours et faux sans gravité : la
   * nationalité d'un apporteur, non le montant d'un apport.
   */
  valeurParDefaut?: string;
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
      /*
       * L'adresse, la ville et le code postal sur une seule ligne.
       *
       * Ils s'écrivent ensemble sur une enveloppe et se remplissent ensemble ici : la
       * complétion de l'adresse pose les deux autres. Sur trois lignes, ils repoussaient
       * le reste du formulaire sans rien apprendre de plus.
       */
      {
        identifiant: "nouvelleAdresse",
        libelle: "Nouvelle adresse",
        type: "adresse",
        obligatoire: true,
      },
      {
        identifiant: "nouveauCodePostal",
        libelle: "Code postal",
        type: "texte",
        colonnes: 1,
        obligatoire: true,
      },
      {
        identifiant: "nouvelleVille",
        libelle: "Ville",
        type: "texte",
        colonnes: 2,
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

      /*
       * Le domiciliataire, quand le siège part chez une société de domiciliation.
       *
       * Ces trois informations ne sont pas de confort. La société de domiciliation
       * exerce une activité réglementée : elle doit détenir un agrément préfectoral
       * (articles R. 123-166-2 et suivants du code de commerce), et le contrat de
       * domiciliation doit en porter les références. Le domicilié déclare au registre
       * la dénomination et l'immatriculation de celui qui l'héberge ; une attestation
       * sans numéro d'agrément se fait refuser au dépôt.
       *
       * Le parcours de création les demandait déjà - `verifierDomiciliation` dans
       * domain/formalite/parcours.ts. Le transfert de siège les oubliait, et le
       * dossier repartait du guichet unique pour cette seule ligne.
       */
      {
        /* À côté du mode qui le fait paraître : les deux se lisent d'un trait. */
        identifiant: "domiciliataireDenomination",
        libelle: "Nom de la société de domiciliation",
        type: "texte",
        obligatoire: true,
        visibleSi: { champ: "nouveauModeDomiciliation", vaut: ["Société de domiciliation"] },
      },
      {
        identifiant: "domiciliataireSiren",
        libelle: "SIREN du domiciliataire",
        type: "texte",
        obligatoire: true,
        visibleSi: { champ: "nouveauModeDomiciliation", vaut: ["Société de domiciliation"] },
        aide: "Neuf chiffres, sur le contrat.",
      },
      {
        identifiant: "domiciliataireAgrement",
        libelle: "Numéro d'agrément préfectoral",
        type: "texte",
        obligatoire: true,
        visibleSi: { champ: "nouveauModeDomiciliation", vaut: ["Société de domiciliation"] },
        aide: "Sur le contrat : sans lui, le greffe refuse.",
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
        /*
         * Facultative, elle laissait « de nationalité , » dans le procès-verbal.
         *
         * L'acte présente le dirigeant d'une phrase qui l'énonce toujours, et le
         * greffe la demande sur la déclaration qui accompagne la nomination : c'est
         * un renseignement dû, non un complément.
         */
        obligatoire: true,
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
        /*
         * Quatre modes, non trois.
         *
         * La compensation de créances - l'incorporation au capital du compte courant
         * d'un associé - est le cas le plus fréquent dans une petite société, et
         * n'était pas proposée : le dirigeant qui transforme son compte courant
         * n'avait aucune case qui lui corresponde.
         */
        options: [
          "Apport en numéraire",
          "Compensation de créances",
          "Incorporation de réserves",
          "Apport en nature",
        ],
        pleineLargeur: true,
        obligatoire: true,
        aide: "Chaque mode appelle ses propres pièces : elles se demandent ensuite, selon celui que vous choisissez.",
      },

      /* ---------- Apport en numéraire ---------- */
      {
        identifiant: "banqueDepot",
        libelle: "Banque dépositaire des fonds",
        type: "texte",
        obligatoire: true,
        visibleSi: { champ: "modeAugmentation", vaut: ["Apport en numéraire"] },
        indication: "Celle qui délivrera l'attestation de dépôt",
      },
      {
        identifiant: "dateDepotFonds",
        libelle: "Date du dépôt des fonds",
        type: "date",
        visibleSi: { champ: "modeAugmentation", vaut: ["Apport en numéraire"] },
      },

      /* ---------- Compensation de créances ---------- */
      {
        identifiant: "titulaireCreance",
        libelle: "Titulaire de la créance",
        type: "texte",
        obligatoire: true,
        visibleSi: { champ: "modeAugmentation", vaut: ["Compensation de créances"] },
        aide: "L'associé dont le compte courant est incorporé au capital.",
      },
      {
        identifiant: "montantCreance",
        libelle: "Montant de la créance, en euros",
        type: "nombre",
        obligatoire: true,
        visibleSi: { champ: "modeAugmentation", vaut: ["Compensation de créances"] },
      },
      {
        identifiant: "dateArreteCompte",
        libelle: "Date de l'arrêté de compte",
        type: "date",
        obligatoire: true,
        visibleSi: { champ: "modeAugmentation", vaut: ["Compensation de créances"] },
        aide: "La créance doit être liquide et exigible : l'arrêté de compte l'établit, certifié par le commissaire aux comptes s'il en existe un, à défaut par l'expert-comptable.",
      },

      /* ---------- Incorporation de réserves ---------- */
      {
        identifiant: "posteIncorpore",
        libelle: "Poste prélevé",
        type: "choix",
        options: ["Réserves", "Report à nouveau", "Prime d'émission", "Réserve légale"],
        obligatoire: true,
        visibleSi: { champ: "modeAugmentation", vaut: ["Incorporation de réserves"] },
        aide: "La réserve légale ne peut être incorporée que pour la part qui excède le dixième du capital.",
      },
      {
        identifiant: "montantIncorpore",
        libelle: "Montant incorporé, en euros",
        type: "nombre",
        obligatoire: true,
        visibleSi: { champ: "modeAugmentation", vaut: ["Incorporation de réserves"] },
      },

      /* ---------- Apport en nature ---------- */
      {
        identifiant: "descriptionApport",
        libelle: "Description du bien apporté",
        type: "long",
        pleineLargeur: true,
        obligatoire: true,
        visibleSi: { champ: "modeAugmentation", vaut: ["Apport en nature"] },
        indication: "Nature, désignation et, s'il y a lieu, références du bien",
      },
      {
        identifiant: "valeurApport",
        libelle: "Valeur retenue de l'apport, en euros",
        type: "nombre",
        obligatoire: true,
        visibleSi: { champ: "modeAugmentation", vaut: ["Apport en nature"] },
      },
      {
        identifiant: "dispenseCommissaire",
        libelle: "Les associés dispensent-ils du commissaire aux apports ?",
        type: "choix",
        options: ["Non, un commissaire est désigné", "Oui, à l'unanimité"],
        pleineLargeur: true,
        obligatoire: true,
        visibleSi: { champ: "modeAugmentation", vaut: ["Apport en nature"] },
        aide: "La dispense suppose une décision unanime, aucun apport au-dessus de 30 000 € et un total des apports en nature inférieur à la moitié du capital (art. L. 223-33 et L. 223-9 du code de commerce, art. D. 223-6-1). Sans commissaire, les associés répondent solidairement de la valeur retenue pendant cinq ans.",
      },
      {
        identifiant: "commissaireApports",
        libelle: "Nom du commissaire aux apports désigné",
        type: "texte",
        obligatoire: true,
        visibleSi: { champ: "dispenseCommissaire", vaut: ["Non, un commissaire est désigné"] },
      },

      /*
       * L'information du conjoint - article 1832-2 du code civil.
       *
       * Un époux marié sous un régime de communauté ne peut employer un bien commun
       * pour apporter à une société dont les parts ne sont pas négociables sans que son
       * conjoint en soit averti, et sans que cet avertissement soit justifié dans
       * l'acte. À défaut, l'opération encourt la nullité relative, que le conjoint peut
       * demander pendant deux ans à compter du jour où il en a eu connaissance
       * (article 1427 du code civil).
       *
       * Le conjoint peut en outre revendiquer la qualité d'associé pour la moitié des
       * parts souscrites : il faut donc savoir s'il renonce ou s'il revendique, car
       * l'acte ne dit pas la même chose dans les deux cas.
       *
       * La question ne vaut que pour les parts non négociables - SARL, EURL, SCI, SNC.
       * Les actions d'une SAS ou d'une SA sont négociables : l'article ne s'y applique
       * pas, et la poser ferait répondre à côté.
       */
      {
        identifiant: "apportBienCommun",
        libelle: "Le bien apporté est-il un bien commun des époux ?",
        type: "choix",
        options: [
          "Non : apporteur non marié, séparation de biens, ou bien propre",
          "Oui : le bien apporté est un bien commun",
        ],
        pleineLargeur: true,
        obligatoire: true,
        visibleSi: { champ: "modeAugmentation", vaut: ["Apport en nature"] },
        formes: FORMES_A_PARTS,
        aide: "Le conjoint doit être averti de l'apport, et l'acte doit en porter la mention : sans cela, il peut en demander la nullité pendant deux ans (article 1832-2 du code civil).",
      },
      {
        identifiant: "conjointNomComplet",
        libelle: "Civilité, prénom et nom du conjoint averti",
        type: "texte",
        obligatoire: true,
        pleineLargeur: true,
        visibleSi: {
          champ: "apportBienCommun",
          vaut: ["Oui : le bien apporté est un bien commun"],
        },
        formes: FORMES_A_PARTS,
      },
      {
        identifiant: "conjointRevendication",
        libelle: "Le conjoint revendique-t-il la qualité d'associé ?",
        type: "choix",
        options: [
          "Non : il renonce à la qualité d'associé",
          "Oui : il revendique la moitié des parts",
        ],
        pleineLargeur: true,
        obligatoire: true,
        visibleSi: {
          champ: "apportBienCommun",
          vaut: ["Oui : le bien apporté est un bien commun"],
        },
        formes: FORMES_A_PARTS,
        aide: "La revendication peut intervenir plus tard, jusqu'à la dissolution. Recueillie maintenant, elle est acquise et l'acte la constate.",
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
  {
    code: "apport_titres",
    libelle: "Apport de titres à une holding",
    libelleCourt: "Apport de titres",
    description: "Apporter les titres d'une société au capital d'une autre, en report d'imposition.",
    /*
     * Le seul changement dont la saisie se range sous des intertitres.
     *
     * Trois sociétés s'y croisent, plus une personne physique, une valorisation et un
     * régime fiscal : vingt-six champs à la file formaient un mur où l'on ne savait
     * plus lequel décrivait quoi. Les libellés s'en trouvent allégés du même coup -
     * « Sa forme juridique » n'a de sens qu'immédiatement après la ligne qui nomme la
     * société ; sous un intertitre, « Forme juridique » suffit et se lit mieux.
     */
    champs: [
      /* ------------------------------------------------- La société apportée */
      {
        identifiant: "apporteeDenomination",
        libelle: "Dénomination",
        groupe: "La société dont les titres sont apportés",
        type: "societe",
        remplit: {
          forme: "apporteeForme",
          siren: "apporteeSiren",
          siege: "apporteeSiege",
          capital: "apporteeCapital",
          villeRcs: "apporteeRcs",
        },
        obligatoire: true,
        pleineLargeur: true,
        aide: "Celle dans laquelle l'apporteur détient les titres. Elle n'est pas modifiée par l'opération, mais l'acte doit la désigner sans ambiguïté. Cherchez-la au registre : sa forme, son SIREN, son siège, son capital et son greffe se remplissent seuls.",
      },
      {
        identifiant: "apporteeForme",
        libelle: "Forme juridique",
        groupe: "La société dont les titres sont apportés",
        type: "choix",
        options: NATURES_PROPOSEES,
        obligatoire: true,
      },
      {
        identifiant: "apporteeSiren",
        libelle: "SIREN",
        groupe: "La société dont les titres sont apportés",
        type: "texte",
        obligatoire: true,
      },
      {
        identifiant: "apporteeSiege",
        libelle: "Siège social",
        groupe: "La société dont les titres sont apportés",
        type: "adresse",
        obligatoire: true,
        pleineLargeur: true,
      },
      {
        identifiant: "apporteeRcs",
        libelle: "Ville du RCS",
        groupe: "La société dont les titres sont apportés",
        type: "texte",
        obligatoire: true,
      },
      {
        identifiant: "apporteeCapital",
        libelle: "Capital social, en euros",
        groupe: "La société dont les titres sont apportés",
        type: "nombre",
        obligatoire: true,
      },
      {
        identifiant: "apporteeNbTitres",
        libelle: "Nombre total de titres",
        groupe: "La société dont les titres sont apportés",
        type: "nombre",
        obligatoire: true,
      },
      {
        identifiant: "apporteeNominale",
        libelle: "Valeur nominale d'un titre, en euros",
        groupe: "La société dont les titres sont apportés",
        type: "nombre",
        obligatoire: true,
      },
      {
        identifiant: "apporteeDateStatuts",
        libelle: "Date des statuts",
        groupe: "La société dont les titres sont apportés",
        type: "date",
      },

      /* ---------------------------------------------------- Les titres apportés */
      {
        identifiant: "apportNbTitres",
        libelle: "Nombre de titres apportés",
        groupe: "Les titres apportés",
        type: "nombre",
        obligatoire: true,
        aide: "Le pourcentage du capital qu'ils représentent se calcule seul, à partir du nombre total de titres.",
      },
      {
        identifiant: "apportOrigineTitres",
        libelle: "Comment l'apporteur les a obtenus",
        groupe: "Les titres apportés",
        type: "choix",
        options: [
          "Souscription à la constitution",
          "Souscription à une augmentation de capital",
          "Acquisition auprès d'un tiers",
          "Donation ou succession",
        ],
        obligatoire: true,
      },
      {
        identifiant: "apportNumerotation",
        libelle: "Numérotation des titres",
        groupe: "Les titres apportés",
        type: "texte",
        indication: "Facultatif - « 1 à 50 » par exemple",
      },

      /* -------------------------------------------------------- La valorisation */
      {
        identifiant: "apportValeur",
        libelle: "Valeur retenue, en euros",
        groupe: "Ce que valent les titres",
        type: "nombre",
        obligatoire: true,
        aide: "C'est le chiffre que le report d'imposition prend pour base. L'administration peut le contrôler des années plus tard : il doit reposer sur une méthode qu'on puisse expliquer.",
      },
      {
        identifiant: "apportMethodeValorisation",
        libelle: "Méthode retenue",
        groupe: "Ce que valent les titres",
        type: "choix",
        options: [
          "Actif net comptable",
          "Actif net comptable corrigé",
          "Rentabilité prévisionnelle",
          "Actif net comptable et rentabilité prévisionnelle",
          "Multiple de résultat",
        ],
        obligatoire: true,
      },
      {
        identifiant: "apportCommissaire",
        libelle: "Recourir à un commissaire aux apports ?",
        groupe: "Ce que valent les titres",
        type: "choix",
        options: ["Oui", "Non, dispense décidée à l'unanimité"],
        obligatoire: true,
        pleineLargeur: true,
        aide: "La dispense suppose que l'apport ne dépasse pas 30 000 € et reste sous la moitié du capital après l'opération. Elle est écrite pour les SARL (article L. 223-33) ; pour une société par actions, le texte ne la prévoit qu'à la constitution, et la pratique est partagée. Sans commissaire, les associés répondent de la valeur pendant cinq ans.",
      },
      {
        identifiant: "apportCommissaireNom",
        libelle: "Nom du commissaire aux apports",
        groupe: "Ce que valent les titres",
        type: "texte",
        pleineLargeur: true,
        visibleSi: { champ: "apportCommissaire", vaut: ["Oui"] },
      },

      /* ------------------------------------------- Ce que la holding émet en échange */
      /*
       * Ce que le traité d'apport dit de la holding, et que rien d'autre ne dit.
       *
       * Le procès-verbal se contente de nommer la société : il l'a déjà en tête d'acte.
       * Le traité, lui, la présente à un tiers - le préambule décrit son objet, et le
       * corps de l'acte nomme celui qui l'engage. Deux mentions qu'aucun autre champ
       * ne porte : la société modifiée arrive du registre avec sa dénomination, son
       * capital et son siège, jamais avec son objet ni son représentant.
       */
      {
        identifiant: "beneficiaireObjet",
        libelle: "Objet de la holding",
        groupe: "Ce que la holding émet en échange",
        type: "long",
        pleineLargeur: true,
        obligatoire: true,
        aide: "En une phrase, tel que les statuts le rédigent : « la prise de participation dans toutes sociétés ». Le traité le reprend dans son préambule.",
      },
      {
        identifiant: "beneficiaireRepresentant",
        libelle: "Qui représente la holding à la signature",
        groupe: "Ce que la holding émet en échange",
        type: "texte",
        pleineLargeur: true,
        obligatoire: true,
        /*
         * Inutile de le demander quand l'apporteur est lui-même le représentant légal :
         * le traité le nomme alors des deux côtés, et l'article 1161 du code civil
         * l'autorise expressément. Le poser quand même ferait retaper le même nom.
         */
        visibleSi: {
          champ: "apporteurQualite",
          vaut: ["Associé, sans mandat social", "Tiers entrant au capital"],
        },
        aide: "Civilité, prénom, nom et qualité : « Monsieur Paul DURAND, en sa qualité de Président ».",
      },
      {
        identifiant: "apportNominaleBeneficiaire",
        libelle: "Valeur nominale des titres émis, en euros",
        groupe: "Ce que la holding émet en échange",
        type: "nombre",
        obligatoire: true,
        aide: "Elle doit diviser exactement la valeur de l'apport : sinon il faut une prime d'émission, et l'acte doit la chiffrer.",
      },
      /*
       * La parité d'échange, et la prime qu'elle dégage.
       *
       * Le plus souvent, la valeur de l'apport se divise par le nominal et l'affaire
       * est close : mille titres de dix euros pour dix mille euros apportés. Mais rien
       * n'oblige à cette égalité, et il est fréquent de vouloir l'éviter - émettre
       * moins de titres pour ne pas diluer les autres associés, ou parce que le
       * nominal de la holding ne divise pas la valeur retenue. L'écart entre ce qui
       * est apporté et ce qui entre au capital est la prime d'apport : elle va en
       * réserve, pas au capital, et l'acte doit la chiffrer.
       *
       * Laissé vide, le nombre se calcule et la prime est nulle. C'est le cas courant,
       * et il ne coûte pas une ligne de saisie de plus.
       */
      {
        identifiant: "apportActionsEmises",
        libelle: "Nombre de titres émis en rémunération",
        groupe: "Ce que la holding émet en échange",
        type: "nombre",
        aide: "Laissez vide pour que la valeur de l'apport entre entièrement au capital. Un nombre plus faible dégage une prime d'apport, que le traité chiffrera.",
      },
      {
        identifiant: "apportNumeraire",
        libelle: "Augmentation en numéraire préalable, en euros",
        groupe: "Ce que la holding émet en échange",
        type: "nombre",
        indication: "Zéro s'il n'y en a pas",
        aide: "Une augmentation en numéraire décidée juste avant l'apport grossit le capital et fait passer l'apport sous la moitié de celui-ci - l'une des deux conditions pour se dispenser d'un commissaire aux apports. Il faut au moins la valeur de l'apport, moins le capital actuel.",
      },

      /* ------------------------------------------------------------ L'apporteur */
      {
        /*
         * Trois champs, une ligne, comme pour le dirigeant nommé.
         *
         * « Civilité, prénom et nom » tenait dans un seul champ de pleine largeur : on y
         * tapait ce qu'on voulait, dans l'ordre qu'on voulait, et l'acte devait ensuite
         * deviner où finit le prénom. Le formulaire demande maintenant les trois
         * séparément, comme il le fait déjà pour la nomination d'un dirigeant.
         */
        identifiant: "apporteurCivilite",
        libelle: "Civilité",
        groupe: "L'apporteur",
        type: "choix",
        options: ["Monsieur", "Madame"],
        colonnes: 2,
        obligatoire: true,
        aide: "L'apport est consenti par une personne physique. C'est elle qui bénéficie du report d'imposition.",
      },
      {
        identifiant: "apporteurPrenom",
        libelle: "Prénom",
        groupe: "L'apporteur",
        type: "texte",
        colonnes: 2,
        obligatoire: true,
      },
      {
        identifiant: "apporteurNom",
        libelle: "Nom",
        groupe: "L'apporteur",
        type: "texte",
        colonnes: 2,
        obligatoire: true,
      },
      { identifiant: "apporteurNeLe", libelle: "Né(e) le", groupe: "L'apporteur", type: "date", obligatoire: true },
      {
        identifiant: "apporteurNeA",
        libelle: "Né(e) à",
        groupe: "L'apporteur",
        type: "texte",
        obligatoire: true,
        indication: "Commune et département",
      },
      {
        identifiant: "apporteurNationalite",
        libelle: "Nationalité",
        groupe: "L'apporteur",
        type: "texte",
        /* Écrite d'avance : c'est la réponse de la quasi-totalité des dossiers. */
        valeurParDefaut: "Française",
      },
      {
        identifiant: "apporteurAdresse",
        libelle: "Adresse personnelle",
        groupe: "L'apporteur",
        type: "adresse",
        obligatoire: true,
        pleineLargeur: true,
      },
      {
        identifiant: "apporteurQualite",
        libelle: "Sa qualité dans la holding",
        groupe: "L'apporteur",
        type: "choix",
        options: [
          "Associé unique et représentant légal",
          "Associé et représentant légal",
          "Associé, sans mandat social",
          "Tiers entrant au capital",
        ],
        obligatoire: true,
        aide: "Quand l'apporteur représente aussi la société qui reçoit l'apport, il signe des deux côtés : l'acte doit alors porter l'autorisation prévue à l'article 1161 du code civil.",
      },
      {
        identifiant: "apportControle",
        libelle: "Contrôlera-t-il la holding après l'apport ?",
        groupe: "L'apporteur",
        type: "choix",
        options: ["Oui", "Non"],
        obligatoire: true,
        pleineLargeur: true,
        aide: "C'est cette réponse, et elle seule, qui décide du régime fiscal : report d'imposition de l'article 150-0 B ter s'il y a contrôle, sursis de l'article 150-0 B sinon. Le contrôle s'apprécie en droits de vote comme en droits financiers, seul ou de concert.",
      },

      /* ----------------------------------------------------------- Le traité */
      {
        identifiant: "apportDateEffet",
        libelle: "Date d'effet de l'apport",
        groupe: "Le traité d'apport",
        type: "date",
        obligatoire: true,
      },
      {
        identifiant: "apportDateSignature",
        libelle: "Date de signature",
        groupe: "Le traité d'apport",
        type: "date",
        obligatoire: true,
        aide: "Le traité se signe avant la décision qui approuve les augmentations de capital : c'est elle qui lève la condition suspensive.",
      },
      {
        identifiant: "apportLieuSignature",
        libelle: "Lieu de signature",
        groupe: "Le traité d'apport",
        type: "texte",
        /*
         * Facultatif : le traité prend la ville du siège quand la case est vide.
         *
         * Il l'a toujours fait - « texte(valeurs.apportLieuSignature) || societe.ville » -
         * et le formulaire l'exigeait quand même. On réclamait un renseignement dont
         * l'acte n'a pas besoin, dans le bloc le plus long de l'application.
         */
        indication: "La ville du siège, si vous ne dites rien",
      },
      {
        identifiant: "apportDateLimiteCondition",
        libelle: "Date limite de la condition suspensive",
        groupe: "Le traité d'apport",
        type: "date",
        obligatoire: true,
        aide: "Au-delà, faute de décision approuvant les augmentations de capital, le traité devient caduc.",
      },
      /*
       * La cour d'appel ne se demande plus : elle se déduit du siège.
       *
       * On la faisait saisir, et personne ne la connaît - Nanterre relève de
       * Versailles, Bobigny de Paris, Marseille d'Aix-en-Provence, et aucune des trois
       * ne porte le nom de sa cour. Un champ obligatoire qu'on remplit au jugé produit
       * une clause attributive fausse ; le département, lui, la donne exactement
       * (voir courDAppel dans traite-apport.ts).
       */
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
export function champVisible(
  champ: ChampModification,
  valeurs: Valeurs,
  forme?: string | null
): boolean {
  if (champ.formes) {
    const propre = (forme ?? "").trim().toUpperCase();
    // Forme inconnue : on montre. Forme connue et hors liste : on tait.
    if (propre && !champ.formes.includes(propre)) return false;
  }

  if (!champ.visibleSi) return true;
  const valeur = valeurs[champ.visibleSi.champ];
  return typeof valeur === "string" && champ.visibleSi.vaut.includes(valeur);
}

/** Les champs réellement affichés pour cette sélection, ces valeurs et cette forme. */
export function champsASaisir(
  codes: string[],
  valeurs: Valeurs,
  forme?: string | null
): ChampModification[] {
  return definitions(codes)
    .flatMap((d) => d.champs)
    .filter((c) => champVisible(c, valeurs, forme));
}

/**
 * Ce qui s'écrit d'avance dans un formulaire qui s'ouvre.
 *
 * Le bloc de l'apport de titres compte trente-quatre cases. Toutes n'appellent pas une
 * décision : la nationalité de l'apporteur est française neuf fois sur dix, et la date
 * du traité est celle de l'assemblée qui l'approuve. Les proposer remplies enlève du
 * travail sans rien enlever à la liberté - elles se modifient comme les autres.
 *
 * Rien n'est écrit par-dessus une saisie : la fonction ne rend que ce qui manque.
 */
export function valeursParDefautDesChamps(
  codes: string[],
  valeurs: Valeurs,
  forme?: string | null
): Valeurs {
  const ajouts: Valeurs = {};

  for (const champ of champsASaisir(codes, valeurs, forme)) {
    if (!champ.valeurParDefaut) continue;
    const dejaLa = valeurs[champ.identifiant];
    if (typeof dejaLa === "string" && dejaLa.trim()) continue;
    if (typeof dejaLa === "number") continue;
    ajouts[champ.identifiant] = champ.valeurParDefaut;
  }

  return ajouts;
}

