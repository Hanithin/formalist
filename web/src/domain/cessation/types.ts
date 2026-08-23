/**
 * Ce qu'il faut savoir pour fermer une auto-entreprise.
 *
 * Peu de choses : l'entreprise, la date, et quatre questions dont les réponses
 * décident du calendrier. C'est le parcours le plus court de la plateforme, et il
 * doit le rester - une auto-entreprise se ferme en dix minutes, pas en trois écrans
 * de formulaire.
 */

import type { ChampModification } from "@/domain/modification/types";

export type Champ = ChampModification;

export const GROUPE_CESSATION = "L'arrêt de l'activité";
export const GROUPE_REGIME = "Votre régime";

export const CHAMPS_CESSATION: Champ[] = [
  {
    identifiant: "dateCessation",
    libelle: "Date d'arrêt de l'activité",
    groupe: GROUPE_CESSATION,
    type: "date",
    obligatoire: true,
    aide: "Le jour où vous cessez effectivement. La déclaration doit suivre dans les trente jours, et c'est de cette date que courent toutes les autres échéances.",
  },
  {
    identifiant: "motif",
    libelle: "Pourquoi vous arrêtez",
    groupe: GROUPE_CESSATION,
    type: "choix",
    options: [
      "Activité insuffisante",
      "Reprise d'un emploi salarié",
      "Création d'une société",
      "Départ à la retraite",
      "Changement de projet",
      "Autre motif",
    ],
    obligatoire: true,
    pleineLargeur: true,
    aide: "Le motif figure sur la déclaration. Il n'a aucune conséquence sur vos droits, mais le guichet le demande.",
  },
  {
    identifiant: "activiteCommerciale",
    libelle: "Votre activité est-elle commerciale ?",
    groupe: GROUPE_REGIME,
    type: "choix",
    options: ["Oui", "Non"],
    obligatoire: true,
    aide: "Achat-revente, restauration, hébergement. Une activité commerciale peut suspendre deux ans, les autres un an seulement.",
  },
  {
    identifiant: "periodicite",
    libelle: "À quelle fréquence déclarez-vous votre chiffre d'affaires ?",
    groupe: GROUPE_REGIME,
    type: "choix",
    options: ["Mensuelle", "Trimestrielle"],
    obligatoire: true,
    aide: "Elle décide de la date de votre dernière déclaration à l'URSSAF : trente jours après l'arrêt en mensuel, le mois suivant le trimestre en trimestriel.",
  },
  {
    identifiant: "assujettiTva",
    libelle: "Êtes-vous redevable de la TVA ?",
    groupe: GROUPE_REGIME,
    type: "choix",
    options: ["Non", "Oui"],
    obligatoire: true,
    aide: "Oui si vous avez dépassé la franchise en base et facturez la TVA. Vous devrez alors déposer une déclaration 3517-S-SD dans les soixante jours.",
  },
  {
    identifiant: "agentCommercial",
    libelle: "Êtes-vous inscrit comme agent commercial ?",
    groupe: GROUPE_REGIME,
    type: "choix",
    options: ["Non", "Oui"],
    obligatoire: true,
    aide: "L'inscription au registre spécial des agents commerciaux se radie séparément, dans les deux mois.",
  },
];
