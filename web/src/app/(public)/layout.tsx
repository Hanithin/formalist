import type { ReactNode } from "react";

/**
 * La vitrine est rendue à chaque requête, non pré-générée.
 *
 * Une page produite à la compilation ne peut pas porter le jeton de la requête,
 * et ses scripts seraient donc bloqués par la politique de sécurité. Maintenir la
 * liste des pages pré-générées à la main a échoué deux fois - /aide puis
 * /inscription - avec à chaque fois une page cassée ou une politique relâchée
 * sans qu'on le voie.
 *
 * Le coût est faible : ces pages n'interrogent que des fichiers de contenu, et
 * Next garde leur rendu en cache.
 */
export const dynamic = "force-dynamic";

export default function DispositionPublique({ children }: { children: ReactNode }) {
  return children;
}
