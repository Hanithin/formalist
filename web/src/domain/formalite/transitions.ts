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

/**
 * Le chemin d'un dossier jusqu'à sa clôture.
 *
 * « Validé » est le cran que le cabinet n'a jamais employé : le dossier vivait en
 * « attente de validation » du début à la fin, et rien ne le fermait. Le franchir
 * plutôt que de l'ignorer garde la table des transitions vraie - on ne saute pas un
 * état parce qu'on ne s'en sert pas.
 */
export function etatsJusquALaFin(depuis: string): EtatDossier[] {
  if (!estEtat(depuis) || depuis === "terminee") return [];

  /* Le plus court chemin, pour ne pas faire passer un dossier par un refus. */
  const files: EtatDossier[][] = [[depuis]];
  const vus = new Set<EtatDossier>([depuis]);

  while (files.length > 0) {
    const chemin = files.shift()!;
    for (const suivant of etatsSuivants(chemin[chemin.length - 1])) {
      if (vus.has(suivant)) continue;
      if (suivant === "terminee") return [...chemin.slice(1), suivant];
      vus.add(suivant);
      files.push([...chemin, suivant]);
    }
  }
  return [];
}

export function libelleEtat(etat: string): string {
  const libelles: Record<EtatDossier, string> = {
    en_cours: "En cours",
    en_attente_validation: "En attente de validation",
    corrections_demandees: "Corrections demandées",
    valide: "Validé",
    rejete: "Refusé",
    terminee: "Terminé",
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
