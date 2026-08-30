import Link from "next/link";
import { colonneDeConsultation } from "@/domain/consultation/colonne";
import styles from "../modification/Modification.module.css";

/**
 * La colonne de droite : réserver, et ce qu'il faut savoir avant.
 *
 * Elle remplace la carte d'appel qui prenait la pleine largeur en tête d'écran, et que
 * le bandeau du prochain rendez-vous faisait disparaître - son bouton avec elle. On ne
 * pouvait alors plus prendre un second rendez-vous depuis cette page. La colonne, elle,
 * ne s'en va pas.
 *
 * Elle emprunte sa carte à la feuille des parcours, où les quatre autres colonnes du
 * site sont écrites : une cinquième copie finirait par en diverger.
 */
export function Reservation({
  avocatsDisponibles,
  surReservation,
}: {
  /** Sans avocat ayant publié ses disponibilités, l'assistant n'a aucun créneau. */
  avocatsDisponibles: boolean;
  surReservation: () => void;
}) {
  const colonne = colonneDeConsultation();

  return (
    <aside className={styles.colonne} aria-label="Réserver une consultation">
      <p className={styles.colonneForme}>Réserver</p>
      <p className={styles.colonneNom}>Consultation juridique</p>
      <p className={styles.colonneSous}>
        Trente minutes en visio avec un avocat spécialisé, sur la matière de votre choix.
      </p>

      <dl className={styles.colonneLignes}>
        {colonne.lignes.map((ligne) => (
          <div key={ligne.cle} className={styles.colonneLigne}>
            <dt>{ligne.libelle}</dt>
            <dd>{ligne.valeur}</dd>
          </div>
        ))}
      </dl>

      {/*
        Sans avocat disponible, le bouton mènerait à une impasse : on donne une sortie
        plutôt qu'un geste inutile.
      */}
      {avocatsDisponibles ? (
        <button type="button" className={styles.colonneBouton} onClick={surReservation}>
          Prendre rendez-vous
        </button>
      ) : (
        <Link href="/messagerie" className={styles.colonneBouton}>
          Écrire au support
        </Link>
      )}
    </aside>
  );
}
