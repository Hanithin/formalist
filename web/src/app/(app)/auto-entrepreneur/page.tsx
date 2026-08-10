import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import {
  ouvrirDeclaration,
  commencerDeclaration,
} from "@/infrastructure/db/depots/auto-entrepreneur";
import { ETAPES, premiereEtapeIncomplete } from "@/domain/auto-entrepreneur/declaration";
import { Declaration } from "./Declaration";

export const metadata: Metadata = {
  title: "Créer mon auto-entreprise - Formalist",
  robots: { index: false, follow: false },
};

export default async function AutoEntrepreneur({
  searchParams,
}: {
  searchParams: Promise<{ dossier?: string; etape?: string }>;
}) {
  const utilisateur = await exigerUtilisateur();
  const { dossier, etape } = await searchParams;

  // Pas de dossier : on en ouvre un et on redirige, pour que l'adresse le porte.
  if (!dossier) {
    const nouveau = await commencerDeclaration(utilisateur);
    redirect("/auto-entrepreneur?dossier=" + nouveau);
  }

  const { declaration } = await ouvrirDeclaration(utilisateur, Number(dossier));

  // On ne saute pas par-dessus une étape incomplète : les suivantes s'appuient
  // sur ce qui précède.
  const bloquante = premiereEtapeIncomplete(declaration) ?? ETAPES.length;
  const demandee = Number(etape) || 1;
  const courante = Math.min(Math.max(demandee, 1), bloquante);

  return (
    <main>
      <h1>Créer mon auto-entreprise</h1>
      <Declaration
        dossierId={Number(dossier)}
        etapes={ETAPES}
        etapeCourante={courante}
        declarationInitiale={declaration}
      />
    </main>
  );
}
