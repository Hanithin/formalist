import type { Metadata } from "next";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { formalitesPourListe } from "@/infrastructure/db/depots/documents";
import { comptesParFiltre, filtreValide } from "@/domain/formalite/liste";
import { accorder } from "@/domain/formalite/etapes";
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

  /*
   * Ce que la page contient, en une ligne.
   *
   * Trois cartes de compteurs l'annonçaient en six lignes et un tiers d'écran, pour
   * répéter deux fois le même nombre. Ce qui restait ensuite - un titre seul au-dessus
   * d'une rangée de filtres - laissait le haut de la page vide.
   */
  const comptes = comptesParFiltre(dossiers);
  const brouillons = dossiers.filter((d) => d.brouillon).length;
  const resume = [
    accorder(comptes.tous, "formalité", "formalités"),
    comptes.en_attente > 0 ? comptes.en_attente + " en attente de votre part" : null,
    comptes.terminee > 0 ? accorder(comptes.terminee, "terminée", "terminées") : null,
    brouillons > 0 ? accorder(brouillons, "brouillon", "brouillons") : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <main className={styles.page}>
      <div className={styles.topbar}>
        <div className={styles.topbarTitre}>
          <h1>Mes formalités</h1>
          <p className={styles.topbarResume}>{resume}</p>
        </div>

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
