/**
 * États d'un dossier et transitions permises.
 *
 * Porté depuis routes/formalites.js, où les changements d'état étaient dispersés
 * entre quatre points d'entrée - transition, validate, finalize, upgrade - avec
 * une liste de statuts autorisés à un endroit, des sous-phases à un autre, et
 * aucune règle disant ce qui peut suivre quoi.
 */

export type EtatDossier =
  | "en_cours"
  | "en_attente_validation"
  | "corrections_demandees"
  | "valide"
  | "rejete"
  | "terminee";

export const ETATS: EtatDossier[] = [
  "en_cours",
  "en_attente_validation",
  "corrections_demandees",
  "valide",
  "rejete",
  "terminee",
];

/**
 * Ce qui peut suivre quoi.
 *
 * Un dossier rejeté peut repartir : un refus n'est pas définitif, le client
 * corrige et resoumet. Un dossier terminé, lui, est immatriculé - il ne revient
 * pas en arrière.
 */
const SUITES: Record<EtatDossier, EtatDossier[]> = {
  en_cours: ["en_attente_validation"],
  en_attente_validation: ["corrections_demandees", "valide", "rejete"],
  corrections_demandees: ["en_attente_validation", "en_cours"],
  valide: ["terminee", "corrections_demandees"],
  rejete: ["en_cours"],
  terminee: [],
};

export function estEtat(valeur: string | null | undefined): valeur is EtatDossier {
  return !!valeur && (ETATS as string[]).includes(valeur);
}

export function transitionPermise(depuis: string, vers: string): boolean {
  if (!estEtat(depuis) || !estEtat(vers)) return false;
  return SUITES[depuis].includes(vers);
}

export function etatsSuivants(depuis: string): EtatDossier[] {
  return estEtat(depuis) ? SUITES[depuis] : [];
}

export function libelleEtat(etat: string): string {
  const libelles: Record<EtatDossier, string> = {
    en_cours: "En cours",
    en_attente_validation: "En attente de validation",
    corrections_demandees: "Corrections demandées",
    valide: "Validé",
    rejete: "Refusé",
    terminee: "Immatriculée",
  };
  return estEtat(etat) ? libelles[etat] : etat;
}

/**
 * Offres, de la plus légère à la plus complète.
 *
 * On ne redescend pas : le travail déjà fait au titre d'une offre supérieure
 * n'est pas défait, et rembourser la différence n'est pas prévu.
 */
export const OFFRES = ["starter", "business", "premium"] as const;
export type Offre = (typeof OFFRES)[number];

export function estOffre(valeur: string | null | undefined): valeur is Offre {
  return !!valeur && (OFFRES as readonly string[]).includes(valeur);
}

export function monteeEnOffrePermise(depuis: string | null | undefined, vers: string): boolean {
  if (!estOffre(vers)) return false;

  const rangDepart = estOffre(depuis) ? OFFRES.indexOf(depuis) : -1;
  return OFFRES.indexOf(vers) > rangDepart;
}
