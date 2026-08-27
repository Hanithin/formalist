/**
 * Le formulaire d'une création, déclaré.
 *
 * Les quatre autres parcours décrivent leurs champs dans une table - libellé, groupe,
 * type, aide - et l'écran s'en sert pour les rendre. La création, la plus ancienne,
 * écrivait les siens à la main dans six composants : rien ne permettait de la relire
 * ailleurs, et l'avocat qui voulait corriger une valeur pour reproduire les actes
 * n'avait aucune liste à lui montrer.
 *
 * Ce que cette table couvre, c'est ce que le brouillon porte à plat : l'identité de la
 * société, son siège, son capital, son activité, son régime. Les associés et les
 * dirigeants n'y sont pas - ce sont des listes de personnes, que l'on ajoute et retire,
 * non des champs. Ils se corrigent dans le parcours, comme les autres listes des autres
 * types.
 */

import type { ChampModification } from "@/domain/modification/types";
import {
  BANQUES,
  MODES_DOMICILIATION,
  OCCUPATIONS_DOMICILE,
  OPTIONS_FISCALES,
  REGIMES_TVA,
} from "./parcours";
import { NATURES_PROPOSEES } from "./formes";

const SOCIETE = "La société";
const SIEGE = "Le siège social";
const CAPITAL = "Le capital";
const ACTIVITE = "L'activité";
const REGIME = "Le régime fiscal";

export const CHAMPS_CREATION: ChampModification[] = [
  {
    identifiant: "denomination",
    libelle: "Dénomination sociale",
    groupe: SOCIETE,
    type: "texte",
    obligatoire: true,
  },
  {
    identifiant: "forme",
    libelle: "Forme juridique",
    groupe: SOCIETE,
    type: "choix",
    options: [...NATURES_PROPOSEES],
    obligatoire: true,
    aide: "Changer la forme après la production des actes suppose de les reproduire : les statuts, le titre du dirigeant et les mentions légales en dépendent.",
  },
  {
    identifiant: "dureeDeVie",
    libelle: "Durée de la société, en années",
    groupe: SOCIETE,
    type: "nombre",
    indication: "99 par défaut",
  },

  /* ------------------------------------------------------------ Le siège */
  {
    identifiant: "modeDomiciliation",
    libelle: "Mode de domiciliation",
    groupe: SIEGE,
    type: "choix",
    options: [...MODES_DOMICILIATION],
  },
  {
    identifiant: "adresse",
    libelle: "Adresse du siège",
    groupe: SIEGE,
    type: "adresse",
    pleineLargeur: true,
    obligatoire: true,
  },
  {
    identifiant: "codePostal",
    libelle: "Code postal",
    groupe: SIEGE,
    type: "texte",
    colonnes: 2,
    obligatoire: true,
  },
  { identifiant: "ville", libelle: "Ville", groupe: SIEGE, type: "texte", obligatoire: true },
  {
    /*
     * Le greffe ne se contente pas de l'adresse : le domicilié déclare le nom du
     * domiciliataire et les références de son immatriculation (articles L. 123-10 et
     * R. 123-166-1 du code de commerce).
     */
    identifiant: "domiciliataireDenomination",
    libelle: "Société de domiciliation",
    groupe: SIEGE,
    type: "texte",
    visibleSi: { champ: "modeDomiciliation", vaut: ["Société de domiciliation"] },
  },
  {
    identifiant: "domiciliataireSiren",
    libelle: "SIREN du domiciliataire",
    groupe: SIEGE,
    type: "texte",
    colonnes: 2,
    visibleSi: { champ: "modeDomiciliation", vaut: ["Société de domiciliation"] },
  },
  {
    identifiant: "domiciliataireAgrement",
    libelle: "Numéro d'agrément",
    groupe: SIEGE,
    type: "texte",
    colonnes: 2,
    aide: "Sans lui, l'attestation de domiciliation est refusée : le domiciliataire mentionne ses références d'agrément dans tous les contrats qu'il conclut.",
    visibleSi: { champ: "modeDomiciliation", vaut: ["Société de domiciliation"] },
  },
  {
    identifiant: "occupationDomicile",
    libelle: "Le dirigeant occupe le logement comme",
    groupe: SIEGE,
    type: "choix",
    options: [...OCCUPATIONS_DOMICILE],
    visibleSi: { champ: "modeDomiciliation", vaut: ["Domicile personnel du dirigeant"] },
  },

  /* ------------------------------------------------------------ Le capital */
  {
    identifiant: "capital",
    libelle: "Capital social, en euros",
    groupe: CAPITAL,
    type: "nombre",
    obligatoire: true,
  },
  {
    identifiant: "capitalLibere",
    libelle: "Capital libéré à la constitution, en euros",
    groupe: CAPITAL,
    type: "nombre",
    aide: "La loi impose la moitié pour une société par actions, le cinquième pour une société à responsabilité limitée.",
  },
  {
    identifiant: "partsTotales",
    libelle: "Nombre de titres émis",
    groupe: CAPITAL,
    type: "nombre",
  },
  {
    identifiant: "banque",
    libelle: "Banque du dépôt",
    groupe: CAPITAL,
    type: "choix",
    options: [...BANQUES],
  },

  /* ------------------------------------------------------------ L'activité */
  {
    identifiant: "activite",
    libelle: "Objet social",
    groupe: ACTIVITE,
    type: "long",
    pleineLargeur: true,
    obligatoire: true,
    aide: "Le texte qui figure dans les statuts. Il borne ce que la société peut faire : trop étroit, il oblige à le modifier au premier virage.",
  },
  {
    identifiant: "dateDebutActivite",
    libelle: "Début de l'activité",
    groupe: ACTIVITE,
    type: "date",
  },
  {
    identifiant: "dateCloturePremierExercice",
    libelle: "Clôture du premier exercice",
    groupe: ACTIVITE,
    type: "date",
  },

  /* ------------------------------------------------------------ Le régime */
  {
    identifiant: "optionFiscale",
    libelle: "Impôt",
    groupe: REGIME,
    type: "choix",
    options: [...OPTIONS_FISCALES],
  },
  {
    identifiant: "regimeTva",
    libelle: "Régime de TVA",
    groupe: REGIME,
    type: "choix",
    options: [...REGIMES_TVA],
  },
];

/**
 * Le domiciliataire vit dans un sous-objet, non à plat.
 *
 * Le brouillon le range sous `domiciliataire`, avec trois clés ; la table le déclare à
 * plat pour que la fenêtre le rende comme les autres. Ces deux fonctions font la
 * traduction, dans un sens et dans l'autre.
 */
const DOMICILIATAIRE: Record<string, string> = {
  domiciliataireDenomination: "denomination",
  domiciliataireSiren: "siren",
  domiciliataireAgrement: "agrement",
};

type Valeurs = Record<string, string | number | undefined>;

export function valeursDuBrouillon(brouillon: Record<string, unknown>): Valeurs {
  const valeurs: Valeurs = {};

  for (const champ of CHAMPS_CREATION) {
    const sousCle = DOMICILIATAIRE[champ.identifiant];
    const lu = sousCle
      ? (brouillon.domiciliataire as Record<string, unknown> | undefined)?.[sousCle]
      : brouillon[champ.identifiant];

    if (typeof lu === "string" || typeof lu === "number") valeurs[champ.identifiant] = lu;
  }
  return valeurs;
}

/** Les valeurs corrigées, remises à leur place dans le brouillon. */
export function brouillonAvecValeurs(
  brouillon: Record<string, unknown>,
  valeurs: Valeurs
): Record<string, unknown> {
  const resultat = { ...brouillon };
  const domiciliataire = {
    ...((brouillon.domiciliataire as Record<string, unknown> | undefined) ?? {}),
  };

  for (const [identifiant, valeur] of Object.entries(valeurs)) {
    const sousCle = DOMICILIATAIRE[identifiant];
    if (sousCle) domiciliataire[sousCle] = valeur;
    else resultat[identifiant] = valeur;
  }

  resultat.domiciliataire = domiciliataire;
  return resultat;
}
