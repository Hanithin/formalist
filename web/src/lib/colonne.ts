/**
 * Le signal qui redemande les compteurs de la colonne.
 *
 * La colonne de navigation vit dans la disposition, qui n'est pas réexécutée quand on
 * reste sur la même page : elle redemande donc ses compteurs à chaque changement de
 * chemin. Une action qui modifie les dossiers sans changer de page - supprimer un
 * brouillon depuis la liste - la laissait annoncer un dossier qui n'existe plus, avec
 * un lien qui menait à une page d'erreur.
 *
 * Un évènement plutôt qu'un état partagé : la colonne et la page qui la fait changer
 * sont dans deux arbres différents, et rien ne les relie sinon le document.
 */
export const EVENEMENT_COLONNE = "formalist:colonne";

/** À appeler après toute action qui change la liste des dossiers du client. */
export function signalerChangementDeColonne(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(EVENEMENT_COLONNE));
}
