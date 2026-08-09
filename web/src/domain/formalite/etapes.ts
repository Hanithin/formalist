/**
 * Où en est un dossier, et ce qu'on en dit à son propriétaire.
 *
 * Porté depuis public/formalites.html, où le calcul était refait dans chaque page
 * qui affichait un dossier - tableau de bord, liste, espace avocat - avec des
 * écarts entre les copies.
 */

export type EtatDossier = "en_cours" | "terminee" | "en_attente";
export type Ton = "avance" | "attente" | "termine";

/** Une offre au-delà de la formule d'entrée ajoute l'étape de révision par l'avocat. */
export function nombreDEtapes(offre: string | null | undefined): number {
  return offre && offre !== "starter" ? 6 : 5;
}

export function avancement(phase: number, offre: string | null | undefined): number {
  const total = nombreDEtapes(offre);
  const atteinte = Math.min(Math.max(phase, 0), total);
  return Math.round((atteinte / total) * 100);
}

/**
 * Ce qu'on attend à cette étape, dit du point de vue du client.
 *
 * Le nom de la banque est repris quand il est connu : « À déposer chez Qonto » se
 * comprend sans réfléchir, « En attente du dépôt du capital » demande un effort.
 */
export function libelleEtape(phase: number, banque?: string | null): string {
  const p = Number.isFinite(phase) && phase > 0 ? Math.floor(phase) : 1;

  if (p === 1) return banque ? "À déposer chez " + banque : "En attente du dépôt du capital";
  if (p === 2) return "En attente d'attestation";
  if (p === 3) return "En attente de signature";
  if (p === 4) return "En révision par l'avocat";
  if (p === 5) return "En cours d'immatriculation";
  return "Terminée";
}

export interface Dossier {
  status: string | null;
  phase: number | null;
  offer?: string | null;
  banque?: string | null;
}

export function libelleDossier(dossier: Dossier): string {
  if (dossier.status === "terminee") return "Terminée";
  return libelleEtape(dossier.phase ?? 1, dossier.banque);
}

export function tonDossier(dossier: Dossier): Ton {
  if (dossier.status === "terminee") return "termine";
  if (dossier.status === "en_attente") return "attente";
  return "avance";
}

/**
 * Accord du participe selon le nombre.
 *
 * « 1 formalité terminées » est passé en revue une fois : le pluriel se décide
 * ici plutôt que dans chaque page.
 */
export function accorder(nombre: number, singulier: string, pluriel: string): string {
  return nombre + " " + (nombre <= 1 ? singulier : pluriel);
}
