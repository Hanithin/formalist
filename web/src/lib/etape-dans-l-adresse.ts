/**
 * L'étape courante, écrite dans l'adresse.
 *
 * Les quatre parcours acceptent `?etape=` au chargement - c'est le serveur qui la lit
 * et la passe au composant - mais aucun ne l'y écrivait en avançant. L'adresse
 * annonçait donc l'étape par laquelle on était entré : actualiser la page, revenir
 * d'un onglet, ou simplement partager le lien renvoyait à l'étape 1, le travail
 * enregistré mais l'écran remis au début.
 *
 * `history.replaceState` plutôt qu'une navigation : rien à recharger, l'étape est déjà
 * affichée. Next.js prend en charge cette mise à jour superficielle de l'adresse, et
 * `replace` plutôt que `push` évite qu'un retour arrière ne repasse par chacune des
 * sept étapes.
 */
export function memoriserEtape(dossier: number, etape: number): void {
  if (typeof window === "undefined") return;

  const adresse = new URL(window.location.href);
  adresse.searchParams.set("dossier", String(dossier));
  adresse.searchParams.set("etape", String(etape));

  /*
   * Le retour de paiement ne se rejoue pas.
   *
   * `session` et `paiement` sont lus une fois, à l'arrivée de la banque. Les laisser
   * dans l'adresse ferait reconfirmer le règlement à chaque actualisation.
   */
  adresse.searchParams.delete("session");
  adresse.searchParams.delete("paiement");

  window.history.replaceState(null, "", adresse.pathname + adresse.search);
}
