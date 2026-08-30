import Link from "next/link";
import type { ParcoursACreer } from "@/domain/navigation/parcours";
import styles from "./CarteDeParcours.module.css";

const OUVERTURE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">';

/**
 * Une carte du catalogue, en deux étages.
 *
 * En haut ce que le parcours est - l'icône, son nom, ce qu'il recouvre. En bas, sur son
 * propre filet, ce qu'il en coûte : la durée à gauche, le prix à droite, et la flèche au
 * bout. Les deux questions qu'on se pose avant de cliquer ont ainsi leur ligne, au lieu
 * d'être une troisième ligne grise sous la description.
 *
 * Sur une seule ligne, la carte laissait un large blanc en son milieu : l'icône et le
 * texte se tassaient à gauche, la flèche restait à droite, et rien n'occupait
 * l'intervalle.
 *
 * Elle a d'abord vécu à l'accueil seule ; la fenêtre « Nouvelle formalité » en montrait
 * une version sans durée, sans prix, sans flèche - celle des deux qui sert justement à
 * choisir. Elles n'en font plus qu'une.
 */
export function CarteDeParcours({ parcours }: { parcours: ParcoursACreer }) {
  return (
    <Link
      href={parcours.lien}
      className={parcours.recommande ? `${styles.chemin} ${styles.recommande}` : styles.chemin}
    >
      <span className={styles.tete}>
        {/*
          La teinte vient du catalogue, où elle dormait depuis la reprise du HTML
          d'origine : huit pictogrammes du même gris se ressemblaient tous, et l'œil
          devait lire chaque titre pour retrouver le parcours qu'il cherchait.
        */}
        <span
          className={`${styles.icone} ${styles[parcours.teinte]}`}
          aria-hidden="true"
          /* Les tracés sont des données du catalogue, pas une saisie. */
          dangerouslySetInnerHTML={{ __html: OUVERTURE + parcours.icone + "</svg>" }}
        />

        <span className={styles.corps}>
          <span className={styles.ligneTitre}>
            <span className={styles.cheminTitre}>{parcours.titre}</span>
            {parcours.recommande && <span className={styles.pastille}>Recommandé</span>}
          </span>
          <span className={styles.cheminDesc}>{parcours.description}</span>
        </span>
      </span>

      {/* Le temps et le prix, quand le catalogue les connaît. */}
      {parcours.duree && parcours.prix && (
        <span className={styles.pied}>
          <span className={styles.duree}>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            {parcours.duree}
          </span>

          <span className={styles.prix}>{parcours.prix}</span>

          <span className={styles.fleche} aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </span>
        </span>
      )}
    </Link>
  );
}
