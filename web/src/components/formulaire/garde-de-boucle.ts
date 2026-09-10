/**
 * Le garde-fou contre un rendu qui s'emballe.
 *
 * React signale « Too many re-renders » quand une mise à jour part du rendu lui-même.
 * Il ne dit rien quand elle part d'un effet : l'écran se vide, l'onglet se fige, aucune
 * requête ne part plus, et il n'y a ni message ni pile - rien à quoi se raccrocher. Un
 * dépôt d'accord a figé un onglet ainsi, sans laisser la moindre trace.
 *
 * Le compte vit dans le module plutôt que dans un ref : le lire pendant le rendu est
 * précisément ce qu'un ref interdit, et ce garde n'a pas besoin de distinguer deux
 * instances - il ne cherche pas laquelle s'emballe, mais si l'une d'elles le fait.
 *
 * Le compte se remet à zéro dès qu'une fenêtre de calme passe : un écran qui se
 * redessine vingt fois pendant qu'on tape est normal, trois cents fois en une seconde
 * ne l'est pas. Au-delà, on lève une erreur nommée : la page d'incident la rattrape,
 * dit quoi faire, et la console garde la pile. Une erreur lisible vaut mieux qu'un
 * onglet mort.
 */
const RENDUS_MAXIMUM = 300;
const FENETRE_MS = 1_000;

const comptes = new Map<string, { rendus: number; depuis: number }>();

export function gardeDeBoucle(nom: string): void {
  const maintenant = Date.now();
  const suivi = comptes.get(nom);

  if (!suivi || maintenant - suivi.depuis > FENETRE_MS) {
    comptes.set(nom, { rendus: 1, depuis: maintenant });
    return;
  }

  suivi.rendus += 1;
  if (suivi.rendus <= RENDUS_MAXIMUM) return;

  /* Remis à zéro avant de lever : sans cela, le nouvel essai relèverait aussitôt. */
  comptes.delete(nom);
  throw new Error(
    "L'écran « " +
      nom +
      " » s'est redessiné " +
      RENDUS_MAXIMUM +
      " fois en une seconde : quelque chose le relance sans fin. Le rendu est interrompu pour ne pas figer l'onglet."
  );
}
