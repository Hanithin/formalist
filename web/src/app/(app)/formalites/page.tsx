import type { Metadata } from "next";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { formalitesPourListe } from "@/infrastructure/db/depots/documents";
import { filtreValide } from "@/domain/formalite/liste";
import { dateEnTete } from "@/lib/dates";
import { Liste } from "./Liste";
import { NouvelleFormalite } from "@/components/navigation/NouvelleFormalite";
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
      {/*
        Le bandeau ne porte que le titre, la date et ce qu'on peut faire.
        
        Une phrase de résumé courait dessous : « 8 formalités · 6 brouillons · 1 chez
        l'avocat · 1 terminée ». Elle disait ce que la rangée de pastilles dit déjà
        juste en dessous, dans un autre vocabulaire et un autre découpage - et elle le
        disait sans qu'on puisse cliquer dessus. Les pastilles le disent mieux : elles
        mènent quelque part.
      */}
      <div className={styles.topbar}>
        <h1>Mes formalités</h1>

        <div className={styles.topbarActions}>
          <span className={styles.topbarDate}>{dateEnTete()}</span>
          {/* On est venu ici pour en créer une : descendre chercher la colonne est
              un détour que la page peut s'épargner. */}
          <NouvelleFormalite libelle="Nouvelle formalité" apparence="page" />
        </div>
      </div>

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
