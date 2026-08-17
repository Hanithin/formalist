/**
 * Ce que le client peut voir d'un acte, et quand.
 *
 * Un acte produit à partir du formulaire n'est pas encore un acte : c'est un projet.
 * L'avocat le relit, corrige ce qu'il faut, et c'est sa relecture qui en fait un
 * document signable. Il était pourtant versé dans la bibliothèque du client à la
 * seconde où il sortait du gabarit - le client pouvait donc le télécharger, l'envoyer
 * à sa banque ou le signer avant que quiconque l'ait lu.
 *
 * Le verrou est ici, dans une règle unique, plutôt que dans chaque écran : un écran
 * qu'on ajoute demain ne peut pas l'oublier s'il passe par cette fonction.
 */

/** Produit par le cabinet, en attente de la relecture de l'avocat. */
export const A_RELIRE = "a_relire";

/** Ce qui identifie un acte produit par nous, par opposition à une pièce déposée. */
const PRODUIT_PAR_NOUS = "system";

export interface DocumentPublie {
  uploaded_by: string | null;
  status: string | null;
}

/**
 * Le client peut-il voir ce document ?
 *
 * Tout ce qu'il a lui-même déposé, oui, toujours. Ce que nous produisons, seulement
 * une fois l'avocat passé dessus.
 */
export function visibleParLeClient(document: DocumentPublie): boolean {
  if (document.uploaded_by !== PRODUIT_PAR_NOUS) return true;
  return document.status !== A_RELIRE;
}

/** Les actes qu'il reste à relire, ceux qui retiennent la mise à disposition. */
export function aRelire<T extends DocumentPublie>(documents: T[]): T[] {
  return documents.filter((d) => d.uploaded_by === PRODUIT_PAR_NOUS && d.status === A_RELIRE);
}

/**
 * Ce qu'on dit au client à la place.
 *
 * Le silence serait pire : un dossier dont les actes sont produits mais retenus
 * paraîtrait vide, et il rappellerait pour demander où ils sont.
 */
export function mentionDAttente(nombre: number): string {
  return nombre === 1
    ? "Un acte est en cours de relecture par votre avocat. Il apparaîtra ici dès qu'il sera validé."
    : nombre + " actes sont en cours de relecture par votre avocat. Ils apparaîtront ici dès qu'ils seront validés.";
}
