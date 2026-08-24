/**
 * Remonter en haut, quand ce n'est pas la fenêtre qui défile.
 *
 * La disposition de l'application tient l'écran entier - `height: 100vh`, colonne de
 * navigation immobile - et confie le défilement à la colonne de contenu. La fenêtre,
 * elle, ne défile jamais : `window.scrollTo({ top: 0 })` n'y a aucun effet.
 *
 * Les quatre parcours l'appelaient à chaque changement d'étape, et l'écran restait où
 * il était. On passait d'un formulaire de vingt champs au suivant en arrivant au
 * milieu, sans voir ni le titre de l'étape, ni la frise, ni ce qu'on venait
 * d'atteindre - et l'on croyait que le clic n'avait rien fait.
 *
 * Le conteneur se cherche plutôt qu'il ne se nomme : la disposition peut changer, une
 * classe de module ne se lit pas d'ici, et le parcours n'a pas à savoir dans quelle
 * boîte on l'a posé.
 */
export function remonterEnHaut(): void {
  if (typeof document === "undefined") return;

  let noeud: HTMLElement | null = document.querySelector("main");

  while (noeud) {
    const defilant = /(auto|scroll|overlay)/.test(getComputedStyle(noeud).overflowY);
    if (defilant && noeud.scrollHeight > noeud.clientHeight) {
      noeud.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    noeud = noeud.parentElement;
  }

  // Aucun conteneur défilant : c'est donc la fenêtre, comme sur les pages publiques.
  window.scrollTo({ top: 0, behavior: "smooth" });
}
