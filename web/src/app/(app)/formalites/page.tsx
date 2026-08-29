import type { Metadata } from "next";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { formalitesPourListe } from "@/infrastructure/db/depots/documents";
import { filtreValide } from "@/domain/formalite/liste";
import { EnTetePage } from "@/components/page/EnTetePage";
import { Liste } from "./Liste";
import styles from "./Formalites.module.css";

export const metadata: Metadata = {
  title: "Mes formalités - Formalist",
  robots: { index: false, follow: false },
};

/**
 * Mes formalités.
 *
 * La page charge tous les dossiers : ses quatre filtres annoncent chacun leur
 * décompte, et une liste déjà réduite ne permettrait pas de les calculer. Le tri, la
 * recherche et la pagination se font ensuite sur place - c'est ce que faisait la page
 * d'origine, tout tenant côté navigateur.
 */
export default async function Formalites({
  searchParams,
}: {
  searchParams: Promise<{ filtre?: string; societe?: string }>;
}) {
  const utilisateur = await exigerUtilisateur();
  const { filtre, societe } = await searchParams;
  const dossiers = await formalitesPourListe(utilisateur);

  return (
    <main className={styles.page}>
      <EnTetePage
        titre="Mes formalités"
        sousTitre="Les dossiers qui requièrent une action de votre part figurent en tête de liste."
      />

      <div className={styles.content}>
        <Liste
          dossiers={dossiers}
          filtre={filtreValide(filtre)}
          rechercheInitiale={societe ?? ""}
        />
      </div>
    </main>
  );
}
