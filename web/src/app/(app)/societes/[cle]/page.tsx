import type { Metadata } from "next";
import { Fiche } from "../Fiche";

export const metadata: Metadata = {
  title: "Société - Formalist",
  robots: { index: false, follow: false },
};

/**
 * La fiche d'une société, par son adresse propre.
 *
 * Le contenu vit dans `Fiche` : la page des sociétés l'affiche aussi, sans fil
 * d'Ariane, quand le compte n'en compte qu'une.
 */
export default async function PageSociete({
  params,
}: {
  params: Promise<{ cle: string }>;
}) {
  const { cle } = await params;
  return <Fiche cle={cle} />;
}
