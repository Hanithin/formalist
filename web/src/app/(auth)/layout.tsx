import type { ReactNode } from "react";

/**
 * Connexion et inscription occupent tout l'écran.
 *
 * Elles n'ont ni l'en-tête de la vitrine ni la colonne de l'application : on y
 * vient pour une seule chose, et le reste ne ferait que distraire.
 *
 * Rendues à chaque requête, comme la vitrine : une page produite à la
 * compilation ne peut pas porter le jeton de la politique de sécurité.
 */
export const dynamic = "force-dynamic";

export default function DispositionAuthentification({ children }: { children: ReactNode }) {
  return children;
}
