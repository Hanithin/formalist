import type { Metadata } from "next";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { formalitesPourListe } from "@/infrastructure/db/depots/documents";
import { filtreValide } from "@/domain/formalite/liste";
import { dateEnTete } from "@/lib/dates";
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
      {/*
        Le bandeau ne porte que le titre et la date.

        Il a porté un second bouton « Nouvelle formalité », en plus de celui de la
        colonne qui ne quitte jamais l'écran : deux portes pour la même pièce, à trente
        centimètres l'une de l'autre.
      */}
      <div className={styles.topbar}>
        <h1>Mes formalités</h1>
        <span className={styles.topbarDate}>{dateEnTete()}</span>
      </div>

      {/*
        Ce qu'on lit sur chaque carte, et dans quel ordre elles viennent.

        Une première version disait « du brouillon au greffe » : le mot est du métier,
        et il ne vaut pas pour une auto-entreprise. Elle promettait aussi « ce qui vous
        attend » sans dire ce qu'on allait lire. La phrase annonce donc les deux choses
        que la page fait vraiment - chaque carte nomme l'étape suivante, et celles qui
        demandent un geste passent devant.
      */}
      <p className={styles.introduction}>
        Les dossiers qui requièrent une action de votre part figurent en tête de liste.
      </p>

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
