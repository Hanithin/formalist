import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import {
  ouvrirDeclaration,
  commencerDeclaration,
} from "@/infrastructure/db/depots/auto-entrepreneur";
import { ETAPES, premiereEtapeIncomplete } from "@/domain/auto-entrepreneur/declaration";
import { Declaration } from "./Declaration";
import styles from "./AutoEntrepreneur.module.css";

export const metadata: Metadata = {
  title: "Créer une auto-entreprise - Formalist",
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

  /*
   * Le même cadre que la création de société : un fil d'ariane, puis une colonne
   * centrée de neuf cents pixels. Le titre existe pour la structure du document ;
   * à l'écran, ce sont le fil d'ariane et le titre de l'étape qui situent.
   */
  return (
    <main className={styles.page}>
      <nav className={styles.topbar} aria-label="Fil d'ariane">
        <Link href="/tableau-de-bord">Tableau de bord</Link>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <span>Créer une auto-entreprise</span>
      </nav>

      <div className={styles.content}>
        <h1 className={styles.titre}>Créer une auto-entreprise</h1>
        <Declaration
          dossierId={Number(dossier)}
          etapes={ETAPES}
          etapeCourante={courante}
          declarationInitiale={declaration}
        />
      </div>
    </main>
  );
}
