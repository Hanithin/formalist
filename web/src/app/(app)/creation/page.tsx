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
  const documents = await documentsDuDossier(utilisateur, Number(dossier));

  // Les deux vivent dans la même table et se distinguent par leur statut :
  // « uploaded » pour une pièce remise par le client, « generated » pour un acte
  // produit à partir du brouillon. Le type, lui, porte l'extension.
  const deposees = documents.filter((d) => d.status !== "generated");
  const actes = documents.filter((d) => d.status === "generated");
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
          actesProduits={actes.map((d) => ({
            id: d.id,
            nom: d.name,
            fichier: d.file_path,
            statut: d.status,
          }))}
        />
      </div>
    </main>
  );
}
