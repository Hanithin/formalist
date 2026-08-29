import { motPart, type Associe, type Brouillon } from "./parcours";
import { elider } from "./lettres";

/**
 * Les calculs du capital.
 *
 * Ils vivent à part parce que deux modules s'en servent : le parcours, pour dire
 * si l'étape « Capital » est cohérente, et les gabarits, pour écrire les montants
 * dans les actes. Les faire porter par l'un des deux créerait un cycle entre eux.
 *
 * Une règle en découle : le montant souscrit ne se saisit pas, il se déduit des
 * parts et de la valeur nominale. C'est ce qui garantit que les statuts, la liste
 * des souscripteurs et l'attestation de dépôt annoncent le même chiffre.
 */

/** Ce que chaque part vaut, en euros. Zéro part : zéro, et non une division infinie. */
export function valeurNominale(brouillon: Brouillon): number {
  const parts = brouillon.partsTotales ?? 0;
  if (parts <= 0) return 0;
  return (brouillon.capital ?? 0) / parts;
}

/** Les montants d'un associé, une fois l'apport en nature mis de côté. */
export function apportsDe(associe: Associe, nominale: number) {
  const parts = associe.parts ?? 0;
  // Le souscrit se déduit des parts quand la valeur nominale est connue ; sinon on
  // retombe sur le montant saisi.
  const souscrit = nominale > 0 ? parts * nominale : (associe.apport ?? 0);
  const enNature = associe.apportEnNature?.montant ?? 0;
  const numeraire = Math.max(0, souscrit - enNature);

  // Un apport en nature est libéré d'emblée : seule la part en numéraire peut
  // rester à verser.
  const verse = Math.min(associe.versement ?? numeraire, numeraire) + enNature;
  const reste = Math.max(0, numeraire - (verse - enNature));
  const pourcentageLibere = numeraire > 0 ? Math.round(((verse - enNature) / numeraire) * 100) : 100;

  return { parts, souscrit, enNature, numeraire, verse, reste, pourcentageLibere };
}

/* ------------------------------------------------------ Où en est la répartition */

export type EtatDeRepartition = "vide" | "manque" | "juste" | "trop";

export interface Repartition {
  attribuees: number;
  emises: number;
  /** Ce qu'il reste à attribuer ; négatif quand on a dépassé. */
  reste: number;
  etat: EtatDeRepartition;
  /** Ce qu'il faut faire, ou ce qui cloche, en une phrase. */
  phrase: string;
}

function nb(valeur: number): string {
  return valeur.toLocaleString("fr-FR");
}

/**
 * Ce qu'il reste à attribuer, dit en français.
 *
 * L'étape posait une barre de progression et un camembert avant les deux champs qui
 * les alimentent : on arrivait sur deux graphiques à zéro pour cent, sans savoir que
 * le premier geste était de saisir le nombre de titres émis. La phrase le dit à
 * l'endroit où l'on répartit, et rien qu'à ce moment.
 *
 * Les titres sont féminins - une action, une part - d'où « il en reste une ».
 */
export function repartitionDesTitres(
  forme: string | null | undefined,
  attribuees: number,
  emises: number
): Repartition {
  if (emises <= 0) {
    return {
      attribuees,
      emises: 0,
      reste: 0,
      etat: "vide",
      phrase: "Indiquez d'abord le nombre total " + elider(motPart(forme, true)) + " ci-dessus.",
    };
  }

  const reste = emises - attribuees;
  const mot = (combien: number) => motPart(forme, combien > 1);
  const commun = { attribuees, emises, reste };

  if (reste === 0) {
    return {
      ...commun,
      etat: "juste",
      phrase:
        emises === 1
          ? "L'unique " + mot(1) + " est attribuée."
          : "Les " + nb(emises) + " " + mot(emises) + " sont attribuées.",
    };
  }

  if (reste > 0) {
    return {
      ...commun,
      etat: "manque",
      phrase:
        nb(attribuees) +
        " " +
        mot(attribuees) +
        " sur " +
        nb(emises) +
        ", il en reste " +
        (reste === 1 ? "une" : nb(reste)) +
        " à attribuer.",
    };
  }

  const trop = -reste;
  return {
    ...commun,
    etat: "trop",
    phrase:
      nb(attribuees) +
      " " +
      mot(attribuees) +
      " attribuées pour " +
      nb(emises) +
      " émises : " +
      (trop === 1 ? "une" : nb(trop)) +
      " de trop.",
  };
}
