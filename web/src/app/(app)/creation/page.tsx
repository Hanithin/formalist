import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { ouvrirBrouillon, commencerFormalite } from "@/infrastructure/db/depots/brouillons";
import { etapeAccessible, ETAPES } from "@/domain/formalite/parcours";
import { Parcours } from "./Parcours";

export const metadata: Metadata = {
  title: "Créer une société - Formalist",
  robots: { index: false, follow: false },
};

export default async function Creation({
  searchParams,
}: {
  searchParams: Promise<{ dossier?: string; etape?: string }>;
}) {
  const utilisateur = await exigerUtilisateur();
  const { dossier, etape } = await searchParams;

  // Pas de dossier : on en ouvre un et on redirige, pour que l'adresse porte
  // l'identifiant. Sans ça, un rechargement créerait un dossier de plus.
  if (!dossier) {
    const nouveau = await commencerFormalite(utilisateur);
    redirect("/creation?dossier=" + nouveau);
  }

  const { brouillon } = await ouvrirBrouillon(utilisateur, Number(dossier));
  const courante = etapeAccessible(Number(etape) || 1, brouillon);

  return (
    <main>
      <h1>Créer une société</h1>
      <Parcours
        dossierId={Number(dossier)}
        etapes={ETAPES}
        etapeCourante={courante}
        brouillonInitial={brouillon}
      />
    </main>
  );
}
