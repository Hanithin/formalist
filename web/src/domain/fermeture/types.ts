/**
 * Ce qu'il faut savoir pour fermer une société.
 *
 * Deux phases, deux jeux de champs. La dissolution demande qui décide, quand, et qui
 * liquidera. La clôture demande ce que la liquidation a produit. Entre les deux, des
 * mois peuvent passer : les champs de la seconde phase ne s'affichent pas tant que la
 * première n'est pas réglée, sans quoi l'écran demanderait un actif réalisé à quelqu'un
 * qui n'a pas encore nommé son liquidateur.
 *
 * La dissolution sans liquidation n'a qu'une phase, et presque aucun de ces champs :
 * pas de liquidateur, pas de comptes définitifs, pas de partage.
 */

import type { ChampModification } from "@/domain/modification/types";

export type Champ = ChampModification;

export const GROUPE_DECISION = "La décision de dissolution";
export const GROUPE_LIQUIDATEUR = "Le liquidateur";
export const GROUPE_TUP = "L'associé unique";
export const GROUPE_CLOTURE = "La clôture de la liquidation";
export const GROUPE_CHIFFRES = "Les comptes de liquidation";

/** Les champs de la première phase, pour une liquidation amiable. */
export const CHAMPS_DISSOLUTION: Champ[] = [
  {
    identifiant: "dateDissolution",
    libelle: "Date de la décision de dissolution",
    groupe: GROUPE_DECISION,
    type: "date",
    obligatoire: true,
    aide: "C'est elle qui ouvre la liquidation, fait courir le mandat de trois ans du liquidateur et vaut cessation d'activité au regard des impôts.",
  },
  {
    identifiant: "heureDecision",
    libelle: "Heure",
    groupe: GROUPE_DECISION,
    type: "texte",
    indication: "11 heures par défaut",
  },
  {
    identifiant: "lieuDecision",
    libelle: "Lieu de réunion",
    groupe: GROUPE_DECISION,
    type: "texte",
    indication: "Au siège social par défaut",
  },
  {
    identifiant: "motifDissolution",
    libelle: "Pourquoi la société est dissoute",
    groupe: GROUPE_DECISION,
    type: "choix",
    options: [
      "Cessation de l'activité",
      "Objet social réalisé ou épuisé",
      "Mésentente entre associés",
      "Départ à la retraite du dirigeant",
      "Réorganisation du groupe",
      "Autre motif",
    ],
    obligatoire: true,
    pleineLargeur: true,
    aide: "Le motif figure dans le procès-verbal. Il n'engage à rien, mais un acte qui n'en donne aucun se lit mal, et l'administration s'en sert pour apprécier la sincérité de la démarche.",
  },
  {
    identifiant: "sarlAvant2005",
    libelle: "Votre SARL a-t-elle été immatriculée avant le 4 août 2005 ?",
    groupe: GROUPE_DECISION,
    type: "choix",
    options: ["Non", "Oui"],
    pleineLargeur: true,
    aide: "La règle de majorité a changé à cette date. Avant : les trois quarts des parts. Après : les deux tiers des parts des présents ou représentés, avec un quorum. Écrire la mauvaise règle dans l'acte le rend contestable.",
  },
  {
    identifiant: "majoriteStatutaire",
    libelle: "Ce que vos statuts prévoient pour la dissolution",
    groupe: GROUPE_DECISION,
    type: "texte",
    pleineLargeur: true,
    indication: "À défaut de clause, l'unanimité s'impose",
    aide: "Recopiez la clause de vos statuts, telle qu'elle est écrite. La loi ne fixe pas la majorité pour votre forme : c'est le pacte social qui la porte.",
  },

  /* ------------------------------------------------------- Le liquidateur */
  {
    identifiant: "liquidateurCivilite",
    libelle: "Civilité",
    groupe: GROUPE_LIQUIDATEUR,
    type: "choix",
    options: ["Monsieur", "Madame"],
    obligatoire: true,
  },
  {
    identifiant: "liquidateurPrenom",
    libelle: "Prénom",
    groupe: GROUPE_LIQUIDATEUR,
    type: "texte",
    obligatoire: true,
  },
  {
    identifiant: "liquidateurNom",
    libelle: "Nom",
    groupe: GROUPE_LIQUIDATEUR,
    type: "texte",
    obligatoire: true,
  },
  {
    identifiant: "liquidateurNeLe",
    libelle: "Né(e) le",
    groupe: GROUPE_LIQUIDATEUR,
    type: "date",
    obligatoire: true,
  },
  {
    identifiant: "liquidateurNeA",
    libelle: "Né(e) à",
    groupe: GROUPE_LIQUIDATEUR,
    type: "texte",
    obligatoire: true,
    indication: "Commune et département",
  },
  {
    identifiant: "liquidateurNationalite",
    libelle: "Nationalité",
    groupe: GROUPE_LIQUIDATEUR,
    type: "texte",
    obligatoire: true,
    indication: "Française par défaut",
  },
  /*
   * La filiation du liquidateur.
   *
   * Elle n'a rien d'anecdotique : la déclaration de non-condamnation est aussi une
   * déclaration de filiation, et le registre s'en sert pour identifier la personne avec
   * certitude. Un dossier déposé sans elle revient.
   */
  {
    identifiant: "liquidateurPere",
    libelle: "Prénoms et nom du père",
    groupe: GROUPE_LIQUIDATEUR,
    type: "texte",
    obligatoire: true,
    indication: "Tel qu'il figure à l'état civil",
  },
  {
    identifiant: "liquidateurMere",
    libelle: "Prénoms et nom de naissance de la mère",
    groupe: GROUPE_LIQUIDATEUR,
    type: "texte",
    obligatoire: true,
    indication: "Nom de jeune fille",
  },
  {
    identifiant: "liquidateurAdresse",
    libelle: "Adresse personnelle du liquidateur",
    groupe: GROUPE_LIQUIDATEUR,
    type: "adresse",
    obligatoire: true,
    pleineLargeur: true,
    aide: "Elle figure dans l'acte et dans l'annonce légale : c'est là que les créanciers écrivent.",
  },
  {
    identifiant: "siegeDeLaLiquidation",
    libelle: "Siège de la liquidation",
    groupe: GROUPE_LIQUIDATEUR,
    type: "adresse",
    obligatoire: true,
    pleineLargeur: true,
    aide: "L'adresse où la correspondance de la liquidation est reçue. C'est souvent le domicile du liquidateur quand le bail du siège est résilié - mais rien n'oblige à le déplacer.",
  },
];

/** Les champs propres à la dissolution sans liquidation. */
export const CHAMPS_TUP: Champ[] = [
  {
    identifiant: "dateDissolution",
    libelle: "Date de la décision de dissolution",
    groupe: GROUPE_TUP,
    type: "date",
    obligatoire: true,
    aide: "La dissolution est décidée par l'associé unique. La transmission du patrimoine, elle, n'interviendra qu'à l'expiration du délai d'opposition des créanciers.",
  },
  {
    identifiant: "associeDenomination",
    libelle: "Dénomination de l'associé unique",
    groupe: GROUPE_TUP,
    type: "texte",
    obligatoire: true,
    pleineLargeur: true,
  },
  {
    identifiant: "associeForme",
    libelle: "Sa forme juridique",
    groupe: GROUPE_TUP,
    type: "texte",
    obligatoire: true,
  },
  {
    identifiant: "associeSiren",
    libelle: "Son SIREN",
    groupe: GROUPE_TUP,
    type: "texte",
    obligatoire: true,
  },
  {
    identifiant: "associeCapital",
    libelle: "Son capital social, en euros",
    groupe: GROUPE_TUP,
    type: "nombre",
  },
  {
    identifiant: "associeSiege",
    libelle: "Son siège social",
    groupe: GROUPE_TUP,
    type: "adresse",
    obligatoire: true,
    pleineLargeur: true,
  },
  {
    identifiant: "associeRepresentant",
    libelle: "Qui le représente, et à quel titre",
    groupe: GROUPE_TUP,
    type: "texte",
    obligatoire: true,
    pleineLargeur: true,
    indication: "Monsieur Jean DUPONT, président",
  },
  {
    identifiant: "publicationBodacc",
    libelle: "Date de publication au BODACC",
    groupe: GROUPE_TUP,
    type: "date",
    pleineLargeur: true,
    aide: "À renseigner une fois la dissolution inscrite au registre. C'est cette date, depuis le 1er octobre 2024, qui fait courir les trente jours d'opposition des créanciers - nous en calculons le terme.",
  },
];

/** Les champs de la seconde phase : ce que la liquidation a produit. */
export const CHAMPS_CLOTURE: Champ[] = [
  {
    identifiant: "dateCloture",
    libelle: "Date de la décision de clôture",
    groupe: GROUPE_CLOTURE,
    type: "date",
    obligatoire: true,
    aide: "Elle doit se tenir dans les trois ans de la dissolution : c'est le terme du mandat du liquidateur.",
  },
  {
    identifiant: "dateArreteDesComptes",
    libelle: "Date d'arrêté des comptes de liquidation",
    groupe: GROUPE_CLOTURE,
    type: "date",
    obligatoire: true,
    indication: "Souvent la veille de la décision de clôture",
  },
  {
    identifiant: "lieuCloture",
    libelle: "Lieu de réunion",
    groupe: GROUPE_CLOTURE,
    type: "texte",
    indication: "Au siège de la liquidation par défaut",
  },

  /* ---------------------------------------------------------- Les chiffres */
  {
    identifiant: "actifRealise",
    libelle: "Actif réalisé, en euros",
    groupe: GROUPE_CHIFFRES,
    type: "nombre",
    obligatoire: true,
    aide: "Tout ce que la liquidation a encaissé : trésorerie restante, produit de la vente du matériel, du stock, du fonds, créances recouvrées.",
  },
  {
    identifiant: "passifApure",
    libelle: "Passif apuré, en euros",
    groupe: GROUPE_CHIFFRES,
    type: "nombre",
    obligatoire: true,
    aide: "Tout ce qui a été payé aux créanciers : fournisseurs, impôts, cotisations, emprunts, comptes courants d'associés remboursés.",
  },
  {
    identifiant: "fraisDeLiquidation",
    libelle: "Frais de la liquidation, en euros",
    groupe: GROUPE_CHIFFRES,
    type: "nombre",
    indication: "Annonces, greffe, honoraires",
    aide: "Ils se déduisent avant de calculer le boni. Les y oublier gonfle le boni, donc le droit de partage et l'impôt de l'associé.",
  },
  {
    identifiant: "repriseEnNature",
    libelle: "Un associé reprend-il en nature un bien qu'il avait apporté ?",
    groupe: GROUPE_CHIFFRES,
    type: "choix",
    options: ["Non", "Oui"],
    pleineLargeur: true,
    aide: "Un immeuble, un fonds de commerce, du matériel apporté à la constitution et repris tel quel. Cette reprise échappe au droit de mutation, et change l'assiette du droit de partage : l'avocat reprendra le calcul avec vous.",
  },
];

export function champsDeLaPhase(
  voie: "liquidation-amiable" | "tup",
  phase: "dissolution" | "cloture"
): Champ[] {
  if (voie === "tup") return phase === "dissolution" ? CHAMPS_TUP : [];
  return phase === "dissolution" ? CHAMPS_DISSOLUTION : CHAMPS_CLOTURE;
}

/** Tous les champs, pour la vérification et les gabarits. */
export const CHAMPS_FERMETURE: Champ[] = [
  ...CHAMPS_DISSOLUTION,
  ...CHAMPS_CLOTURE,
  ...CHAMPS_TUP.filter(
    (champ) => !CHAMPS_DISSOLUTION.some((autre) => autre.identifiant === champ.identifiant)
  ),
];
