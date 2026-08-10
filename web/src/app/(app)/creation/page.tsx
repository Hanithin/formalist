import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { ouvrirBrouillon, commencerFormalite } from "@/infrastructure/db/depots/brouillons";
import { documentsDuDossier } from "@/infrastructure/db/depots/documents";
import { etapeAccessible, ETAPES } from "@/domain/formalite/parcours";
import { Parcours } from "./Parcours";
import styles from "./Parcours.module.css";

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
  const deposees = await documentsDuDossier(utilisateur, Number(dossier));
  const courante = etapeAccessible(Number(etape) || 1, brouillon);

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
        <span>Créer une société</span>
      </nav>

      <div className={styles.content}>
        <h1 className={styles.titre}>Créer une société</h1>
        <Parcours
          dossierId={Number(dossier)}
          etapes={ETAPES}
          etapeCourante={courante}
          brouillonInitial={brouillon}
          piecesDeposees={deposees.map((d) => ({ type: d.type, nom: d.name }))}
        />
      </div>
    </main>
  );
}
