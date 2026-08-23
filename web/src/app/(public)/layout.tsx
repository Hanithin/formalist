import type { ReactNode } from "react";

/**
 * Ce qui se voit sans session : la redirection de la racine et la page de
 * signature, où l'associé arrive avec son jeton et sans compte.
 *
 * Il n'y a plus d'en-tête ni de pied : la vitrine est partie sur un autre site, et
 * ces pages n'ont rien à proposer d'autre que ce pour quoi on y vient.
 *
 * Rendu à chaque requête, non pré-généré. Une page produite à la compilation ne
 * peut pas porter le jeton de la requête, et ses scripts seraient donc bloqués par
 * la politique de sécurité. Maintenir la liste des pages pré-générées à la main a
 * échoué deux fois - /aide puis /inscription - avec à chaque fois une page cassée
 * ou une politique relâchée sans qu'on le voie.
 */
export const dynamic = "force-dynamic";

export default function DispositionPublique({ children }: { children: ReactNode }) {
  return children;
}
