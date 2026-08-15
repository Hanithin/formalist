import type { Brouillon, OptionFiscale } from "./parcours";

/**
 * Les réponses évidentes, écrites d'avance.
 *
 * L'étape 1 affichait seize champs, dont six seulement bloquent le passage. Les dix
 * autres n'étaient pas pour autant sans conséquence : laissés vides, ils partaient
 * vides dans les actes - des statuts sans durée, sans date de clôture, sans option
 * fiscale. On demandait donc dix choses avant de laisser avancer, et on produisait
 * quand même un acte incomplet quand personne ne répondait.
 *
 * Ce module donne la réponse courante à ce qui en a une. Elle est écrite dans le
 * brouillon, visible, et modifiable : ce n'est pas une valeur cachée appliquée à la
 * génération, c'est une proposition qu'on relit.
 *
 * Ce qui n'a pas de réponse courante n'en reçoit pas. Le mode de domiciliation, la
 * banque, la date de début d'activité et le régime de TVA dépendent de la situation :
 * en inventer une reviendrait à décider à la place de quelqu'un.
 */

/** La durée que portent les statuts sauf mention contraire. */
export const DUREE_DE_VIE_ANS = 99;

/**
 * L'option fiscale proposée : l'impôt sur les sociétés.
 *
 * C'est le régime de la quasi-totalité des dossiers, et la proposition reste
 * modifiable sur le champ - une société civile qui relève de l'impôt sur le revenu se
 * corrige d'un choix dans la liste.
 */
export const OPTION_FISCALE_COURANTE: OptionFiscale = "IS";

export function optionFiscaleCourante(): OptionFiscale {
  return OPTION_FISCALE_COURANTE;
}

/** Le 31 décembre d'une année, au format que porte le brouillon. */
function finDAnnee(annee: number): string {
  return annee + "-12-31";
}

/**
 * La clôture du premier exercice.
 *
 * Le 31 décembre, parce que l'exercice social suit l'année civile dans l'immense
 * majorité des sociétés. Celui de l'année en cours si l'activité démarre au premier
 * semestre, celui de l'année suivante sinon : une société créée en octobre aurait
 * autrement un premier exercice de deux mois, qui oblige à produire des comptes
 * complets pour presque rien. Dans les deux cas la durée reste sous les vingt-quatre
 * mois que la loi laisse au premier exercice.
 */
export function clotureCourante(debut: Date): string {
  const annee = debut.getFullYear();
  // Juillet est le septième mois : getMonth() le rend comme 6.
  return finDAnnee(debut.getMonth() < 6 ? annee : annee + 1);
}

/** La date lue depuis le brouillon, ou aujourd'hui si l'activité n'a pas de date. */
function departDe(brouillon: Brouillon, aujourdHui: Date): Date {
  const brut = brouillon.dateDebutActivite?.trim();
  if (!brut) return aujourdHui;

  // Midi, pour qu'un changement d'heure ne fasse pas glisser le jour.
  const jour = new Date(brut + "T12:00:00");
  return Number.isNaN(jour.getTime()) ? aujourdHui : jour;
}

/**
 * La clôture qui découle d'une date de début, telle qu'elle est saisie.
 *
 * L'écran la recalcule à chaque changement de la date de début, tant qu'elle n'a pas
 * été fixée à la main : la même règle sert donc au premier remplissage et aux
 * suivants, plutôt que d'exister en deux exemplaires qui finiraient par diverger.
 */
export function clotureDepuis(iso: string | undefined, aujourdHui: Date): string {
  return clotureCourante(departDe({ dateDebutActivite: iso }, aujourdHui));
}

/**
 * Ce qu'il faut ajouter au brouillon, et rien de plus.
 *
 * Seuls les champs encore vides reçoivent une valeur : une réponse déjà donnée n'est
 * jamais remplacée, y compris quand elle diffère de la nôtre.
 */
export function valeursParDefaut(brouillon: Brouillon, aujourdHui: Date): Partial<Brouillon> {
  const ajouts: Partial<Brouillon> = {};

  if (brouillon.dureeDeVie === undefined) ajouts.dureeDeVie = DUREE_DE_VIE_ANS;
  if (!brouillon.optionFiscale) ajouts.optionFiscale = OPTION_FISCALE_COURANTE;
  if (!brouillon.dateCloturePremierExercice) {
    ajouts.dateCloturePremierExercice = clotureCourante(departDe(brouillon, aujourdHui));
  }

  return ajouts;
}
