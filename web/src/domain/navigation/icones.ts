/**
 * Icônes de la navigation.
 *
 * Reprises de la sidebar d'origine : chaque entrée avait la sienne, et sans elles
 * la colonne n'est qu'une liste de mots. Elles sont ici en données plutôt que
 * recopiées dans le composant, pour que la navigation reste décrite à un seul
 * endroit.
 *
 * Une règle : deux entrées ne partagent jamais la même icône. Une icône répétée
 * ne distingue rien et fait lire le mot deux fois pour comprendre où l'on est -
 * « Créer une société » et « Créer une auto-entreprise » portaient toutes deux la
 * maison.
 */

const OUVERTURE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">';

/** Assemble une icône à partir de ses formes, avec les mêmes réglages de trait. */
function icone_(formes: string): string {
  return OUVERTURE + formes + "</svg>";
}

export const ICONES: Record<string, string> = {
  // Tableau de bord : les quatre tuiles de l'accueil.
  "/tableau-de-bord": icone_(
    '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/>' +
      '<rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>'
  ),
  // Mes formalités : le suivi, donc une coche dans un cercle.
  "/formalites": icone_(
    '<path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>'
  ),
  // Créer une société : le fronton, comme dans la page d'origine.
  /*
   * Créer une société : un immeuble, non une maison.
   *
   * Le pignon triangulaire disait « habitation », et c'est justement ce qu'une société
   * n'est pas. Un bâtiment à fenêtres se lit comme un siège social, et se distingue de
   * la personne seule de l'auto-entreprise juste en dessous.
   */
  "/creation": icone_(
    '<path d="M3 21h18"/><path d="M5 21V5a2 2 0 012-2h6a2 2 0 012 2v16"/><path d="M15 9h4a2 2 0 012 2v10"/><path d="M9 7h2M9 11h2M9 15h2"/>'
  ),
  // Auto-entreprise : une personne seule - c'est précisément ce qui la distingue
  // d'une société.
  "/auto-entrepreneur": icone_(
    '<circle cx="12" cy="7" r="4"/><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>'
  ),
  // Modifier : le crayon sur la feuille.
  "/modification": icone_(
    '<path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>' +
      '<path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>'
  ),
  // Dépôt des comptes : des documents qu'on remet, donc la boîte d'archives.
  "/depot-des-comptes": icone_(
    '<rect x="2" y="4" width="20" height="5" rx="1"/><path d="M4 9v10a2 2 0 002 2h12a2 2 0 002-2V9"/>' +
      '<line x1="10" y1="13" x2="14" y2="13"/>'
  ),
  // Fermer ma société : la croix dans un cercle.
  /*
   * Fermer ma société : le volet qu'on baisse, non la croix.
   *
   * La croix dans un cercle est le signe universel de « supprimer » ou « annuler » -
   * un geste destructeur et immédiat. Fermer une société est une formalité, longue et
   * réversible jusqu'au bout : le rideau baissé le dit sans effrayer.
   */
  "/fermeture": icone_(
    '<path d="M3 21h18"/><path d="M5 21V8h14v13"/><path d="M4 8l1.5-4h13L20 8"/><path d="M8 21v-4h8v4"/>'
  ),
  // Documents : le dossier.
  "/documents": icone_(
    '<path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>'
  ),
  // Contrats : la feuille écrite, comme dans la page d'origine.
  "/contrats": icone_(
    '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>' +
      '<line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>'
  ),
  // Consultation juridique : on prend rendez-vous, donc le calendrier.
  "/consultations": icone_(
    '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>' +
      '<line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>'
  ),
  // Messagerie : la bulle.
  "/messagerie": icone_('<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>'),
  // Support : la bouée - on vient y chercher de l'aide, pas discuter.
  "/support": icone_(
    '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><line x1="4.93" y1="4.93" x2="9.17" y2="9.17"/>' +
      '<line x1="14.83" y1="14.83" x2="19.07" y2="19.07"/><line x1="14.83" y1="9.17" x2="19.07" y2="4.93"/>' +
      '<line x1="4.93" y1="19.07" x2="9.17" y2="14.83"/>'
  ),
  // Équipe : plusieurs personnes.
  "/equipe": icone_(
    '<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>' +
      '<path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>'
  ),
  // Espace avocat : la mallette du cabinet.
  "/avocat": icone_(
    '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/>'
  ),
  // Recherche d'entreprise : la loupe.
  "/recherche-entreprise": icone_(
    '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>'
  ),
  // Administration : les curseurs de réglage de la plateforme.
  "/administration": icone_(
    '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/>' +
      '<line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/>' +
      '<line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/>' +
      '<line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/>' +
      '<line x1="17" y1="16" x2="23" y2="16"/>'
  ),
  // Les sociétés : deux immeubles, pour dire le portefeuille plutôt que l'entreprise.
  "/societes": icone_(
    '<path d="M3 21h18"/><path d="M5 21V6a1 1 0 011-1h6a1 1 0 011 1v15"/>' +
      '<path d="M13 10h5a1 1 0 011 1v10"/><path d="M8 9h2M8 13h2M8 17h2"/>'
  ),
  // Paramètres : la roue crantée.
  "/parametres": icone_(
    '<circle cx="12" cy="12" r="3"/>' +
      '<path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 ' +
      "1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 " +
      "11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 " +
      "1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 " +
      "114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 " +
      '00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"/>'
  ),
  // Les disponibilités de l'avocat : une horloge, c'est du temps qu'on y donne.
  "/avocat/disponibilites": icone_(
    '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>'
  ),
  // Aide : le point d'interrogation.
  "/aide": icone_(
    '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/>' +
      '<line x1="12" y1="17" x2="12.01" y2="17"/>'
  ),
};

/** Icône d'une entrée, ou celle du tableau de bord à défaut. */
export function icone(lien: string): string {
  const nu = lien.split("?")[0];
  return ICONES[nu] ?? ICONES["/tableau-de-bord"];
}
