/**
 * Ce qu'il faut savoir pour approuver des comptes, et d'où chaque chose vient.
 *
 * Trois sources se mêlent ici, et l'écran doit les distinguer : ce que le registre
 * donne (la société), ce que le bilan porte (les chiffres), et ce que seul le client
 * sait (la date de l'assemblée, l'affectation qu'il décide, les conventions passées).
 *
 * Les chiffres extraits d'un bilan restent modifiables. Une extraction fausse qu'on
 * ne peut pas corriger serait pire que pas d'extraction du tout : elle produirait un
 * acte faux avec l'autorité d'un chiffre lu dans un document.
 */

import type { ChampModification } from "@/domain/modification/types";

/** Un champ de ce parcours a la même forme que ceux de la modification. */
export type Champ = ChampModification;

/** Ce que l'extraction d'un bilan sait remplir, et que l'écran signale comme tel. */
export const CHAMPS_DU_BILAN = [
  "resultat",
  "reportAnterieur",
  "reserveLegale",
  "capital",
  "totalBilan",
  "chiffreAffaires",
  "effectif",
] as const;

export type ChampDuBilan = (typeof CHAMPS_DU_BILAN)[number];

/** Le groupe que l'écran retire quand la société a plusieurs associés. */
export const GROUPE_ASSOCIE_UNIQUE = "L'associé unique";

export const CHAMPS_COMPTES: Champ[] = [
  /* ------------------------------------------------------------ L'exercice */
  {
    identifiant: "dateOuverture",
    libelle: "Ouverture de l'exercice",
    groupe: "L'exercice à approuver",
    type: "date",
    obligatoire: true,
  },
  {
    identifiant: "dateCloture",
    libelle: "Clôture de l'exercice",
    groupe: "L'exercice à approuver",
    type: "date",
    obligatoire: true,
    aide: "Les comptes s'approuvent dans les six mois de la clôture. Au-delà, tout intéressé peut demander au président du tribunal d'enjoindre au dirigeant de les faire approuver.",
  },
  {
    identifiant: "dateAssemblee",
    libelle: "Date de l'assemblée ou de la décision",
    groupe: "L'exercice à approuver",
    type: "date",
    obligatoire: true,
  },
  {
    identifiant: "heureAssemblee",
    libelle: "Heure",
    groupe: "L'exercice à approuver",
    type: "texte",
    indication: "14 heures par défaut",
  },
  {
    identifiant: "lieuAssemblee",
    libelle: "Lieu de réunion",
    groupe: "L'exercice à approuver",
    type: "texte",
    indication: "Au siège social par défaut",
  },

  /* -------------------------------------------------------- Les dirigeants */
  /*
   * Le dirigeant en trois champs, non en une ligne libre.
   *
   * « Qui préside et à qui donner quitus », un seul champ pleine largeur sous-titré
   * « Civilité, prénom et nom » : le nom partait dans l'acte tel qu'il avait été tapé,
   * casse comprise, et rien n'obligeait à donner la civilité que le procès-verbal
   * emploie. Trois champs sur une rangée le demandent séparément - une colonne pour la
   * civilité, deux pour le prénom, trois pour le nom.
   */
  {
    identifiant: "dirigeantCivilite",
    libelle: "Qui préside et reçoit quitus",
    groupe: "Le dirigeant",
    type: "choix",
    options: ["Monsieur", "Madame"],
    obligatoire: true,
    colonnes: 1,
  },
  {
    identifiant: "dirigeantPrenom",
    libelle: "Son prénom",
    groupe: "Le dirigeant",
    type: "texte",
    obligatoire: true,
    colonnes: 2,
  },
  {
    identifiant: "dirigeantNomFamille",
    libelle: "Son nom",
    groupe: "Le dirigeant",
    type: "texte",
    obligatoire: true,
  },
  {
    identifiant: "dirigeantFonction",
    libelle: "Sa fonction",
    groupe: "Le dirigeant",
    type: "choix",
    options: ["Président", "Gérant", "Directeur général", "Co-gérant"],
    obligatoire: true,
  },
  {
    identifiant: "commissaireAuxComptes",
    libelle: "La société a-t-elle un commissaire aux comptes ?",
    groupe: "Le dirigeant",
    type: "choix",
    options: ["Non", "Oui"],
    obligatoire: true,
    aide: "S'il en existe un, c'est lui qui établit le rapport sur les conventions réglementées, et non le dirigeant.",
  },
  {
    identifiant: "commissaireNom",
    libelle: "Nom du commissaire aux comptes",
    groupe: "Le dirigeant",
    type: "texte",
    pleineLargeur: true,
    visibleSi: { champ: "commissaireAuxComptes", vaut: ["Oui"] },
  },

  /*
   * L'état civil de l'associé unique.
   *
   * La décision d'un associé unique le désigne comme personne - « né le, demeurant » -
   * là où un procès-verbal d'assemblée renvoie à la feuille de présence. Ce groupe ne
   * s'affiche donc que pour une SASU ou une EURL ; l'écran l'écarte sur la forme, que
   * la définition d'un champ ne connaît pas.
   */
  {
    identifiant: "associeUniqueNeLe",
    libelle: "Né(e) le",
    groupe: GROUPE_ASSOCIE_UNIQUE,
    type: "date",
  },
  {
    identifiant: "associeUniqueNeA",
    libelle: "Né(e) à",
    groupe: GROUPE_ASSOCIE_UNIQUE,
    type: "texte",
    indication: "Commune et département",
  },
  {
    identifiant: "associeUniqueAdresse",
    libelle: "Adresse personnelle",
    groupe: GROUPE_ASSOCIE_UNIQUE,
    type: "adresse",
    pleineLargeur: true,
  },

  /* ---------------------------------------------------------- Les chiffres */
  {
    identifiant: "resultat",
    libelle: "Résultat de l'exercice, en euros",
    groupe: "Les chiffres de l'exercice",
    type: "nombre",
    obligatoire: true,
    indication: "Négatif s'il s'agit d'une perte",
    aide: "Le résultat net comptable, tel qu'il figure au bas du compte de résultat.",
  },
  {
    identifiant: "reportAnterieur",
    libelle: "Report à nouveau avant affectation, en euros",
    groupe: "Les chiffres de l'exercice",
    type: "nombre",
    indication: "Négatif s'il est débiteur",
    aide: "Il s'ajoute au résultat pour former ce qu'il y a à répartir. Débiteur, il s'impute avant toute distribution et avant le prélèvement pour la réserve légale.",
  },
  {
    identifiant: "reserveLegale",
    libelle: "Réserve légale déjà constituée, en euros",
    groupe: "Les chiffres de l'exercice",
    type: "nombre",
    aide: "Le prélèvement cesse d'être obligatoire lorsqu'elle atteint le dixième du capital social.",
  },
  {
    identifiant: "totalBilan",
    libelle: "Total du bilan, en euros",
    groupe: "Les chiffres de l'exercice",
    type: "nombre",
    aide: "Il sert à déterminer si vous pouvez demander la confidentialité de vos comptes.",
  },
  {
    identifiant: "chiffreAffaires",
    libelle: "Chiffre d'affaires net, en euros",
    groupe: "Les chiffres de l'exercice",
    type: "nombre",
  },
  {
    identifiant: "effectif",
    libelle: "Effectif moyen du personnel",
    groupe: "Les chiffres de l'exercice",
    type: "nombre",
  },
  {
    identifiant: "depensesNonDeductibles",
    libelle: "Dépenses non déductibles de l'article 39-4 du CGI, en euros",
    groupe: "Les chiffres de l'exercice",
    type: "nombre",
    indication: "Zéro dans la plupart des cas",
    pleineLargeur: true,
    aide: "Amortissements de véhicules de tourisme au-delà du plafond, dépenses de chasse ou de pêche, résidences de plaisance. L'assemblée doit les approuver expressément (article 223 quater du CGI) : le procès-verbal le dit, qu'il y en ait ou non.",
  },
];

/** Les champs, dans l'ordre où l'écran les présente. */
export function champsDesComptes(): Champ[] {
  return CHAMPS_COMPTES;
}
