/**
 * Ce qu'on a le droit de supprimer.
 *
 * Un compte accumule des dossiers ouverts puis abandonnés : une création commencée
 * pour voir, une modification lancée sur la mauvaise société, un dépôt de comptes
 * repris ailleurs. Ils restent dans la liste et dans les compteurs, où ils se lisent
 * comme des démarches en cours, et l'on ne distingue plus ce qui attend vraiment.
 *
 * Le seul dossier qu'un client peut retirer est celui qui n'a jamais quitté ses mains.
 * Dès qu'il a payé, dès que le cabinet l'a reçu, dès qu'une signature a été demandée,
 * le dossier ne lui appartient plus seul : il y a une facture, un travail engagé, ou
 * un tiers qui a reçu un lien. On ne le supprime plus - on l'abandonne ou on le fait
 * clore, ce qui n'est pas le même geste et ne se décide pas depuis une liste.
 *
 * Ce module ne connaît ni la base ni les colonnes : il énonce la règle, et le dépôt
 * la vérifie sur les lignes réelles avant d'effacer quoi que ce soit.
 */

/** L'état d'un dossier, réduit à ce qui décide de sa suppression. */
export interface DossierASupprimer {
  /**
   * « en_cours » est le seul statut d'un dossier que le client tient encore.
   *
   * `transmettreALAvocat` le fait passer à « en_attente_validation », et chaque
   * confirmation de règlement fait de même dans son parcours. Tout le reste -
   * corrections demandées, rejeté, terminé, archivé - suppose un dossier déjà vu par
   * le cabinet.
   */
  statut: string | null;
  /** L'avocat qui l'a pris. Il y a alors un travail engagé derrière ce dossier. */
  avocatAssigneId: number | null;
  /** La date de finalisation : le dossier est parti au registre. */
  finaliseLe: Date | null;
  /** Le drapeau du brouillon : `data_json.paye`, écrit par la confirmation Stripe. */
  paye: boolean;
  /** Une ligne de règlement encaissée, quelle que soit ce qu'en dit le brouillon. */
  aUnReglement: boolean;
  /** Une demande de signature envoyée : un tiers a reçu un lien vers ce dossier. */
  aUneSignature: boolean;
}

/**
 * Pourquoi ce dossier ne se supprime pas.
 *
 * Le motif sert à l'expliquer plutôt qu'à masquer le bouton en silence : quelqu'un
 * qui cherche à supprimer une modification déjà payée doit apprendre qu'elle est
 * payée, et non se demander pourquoi la corbeille manque sur cette carte-là.
 */
export type MotifDeRefus = "reglee" | "confiee" | "signature" | "deposee";

export function motifDuRefus(dossier: DossierASupprimer): MotifDeRefus | null {
  if (dossier.paye || dossier.aUnReglement) return "reglee";
  if (dossier.finaliseLe !== null) return "deposee";
  if (dossier.aUneSignature) return "signature";
  if (dossier.avocatAssigneId !== null) return "confiee";
  if (dossier.statut !== "en_cours") return "confiee";
  return null;
}

export function estSupprimable(dossier: DossierASupprimer): boolean {
  return motifDuRefus(dossier) === null;
}

/**
 * Le refus, dit au client.
 *
 * Ces phrases ne s'affichent qu'en cas de course : la liste n'offre la corbeille que
 * sur les dossiers supprimables, mais elle a été rendue à un instant donné, et le
 * dossier a pu être réglé depuis un autre onglet entre-temps.
 */
export function phraseDuRefus(motif: MotifDeRefus): string {
  if (motif === "reglee") return "Cette formalité a été réglée : elle ne peut plus être supprimée.";
  if (motif === "deposee") return "Cette formalité a été déposée : elle ne peut plus être supprimée.";
  if (motif === "signature") {
    return "Une signature a été demandée sur cette formalité : elle ne peut plus être supprimée.";
  }
  return "Cette formalité a été transmise au cabinet : elle ne peut plus être supprimée.";
}
