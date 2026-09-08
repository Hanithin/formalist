import Link from "next/link";
import { colonneDeConsultation } from "@/domain/consultation/colonne";
import { MATIERES } from "@/domain/consultation/matieres";
import { montantLisible, PRIX_HT_CENTIMES, PRIX_TTC_CENTIMES } from "@/domain/consultation/offre";
import styles from "./Consultations.module.css";

/**
 * Le bloc de réservation, qui occupe la place parce que c'est ce qu'on vient faire.
 *
 * Il tenait dans une colonne de trois cent vingt pixels, à droite d'une liste large : le
 * geste principal de l'écran était le plus petit de ses éléments, et le prix s'y lisait
 * comme une ligne de récapitulatif. Il est passé à gauche, à sa taille - et la liste des
 * rendez-vous, qu'on relit d'un coup d'œil, s'est rangée à côté.
 *
 * Ce qu'il dit ne vient pas d'ici : la durée, le délai de réponse et le prix sont ceux du
 * domaine, et les matières sont la table qui sert à orienter la demande. Rien n'y est
 * écrit en dur qu'un changement de tarif ne suivrait pas.
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
    <aside className={styles.offre} aria-label="Réserver une consultation">
      <p className={styles.offreEyebrow}>Réserver</p>
      <h2 className={styles.offreTitre}>Consultation juridique</h2>
      <p className={styles.offreTexte}>
        Trente minutes en visio avec un avocat spécialisé, sur la matière de votre choix.
        Vous exposez votre situation, il répond et vous dit ce qu&apos;il faut faire
        ensuite.
      </p>

      {/*
        Le prix en grand, le reste en ligne.

        Il se lisait comme une ligne de tableau, entre la durée et le délai de réponse :
        c'est pourtant la première question qu'on se pose avant de cliquer. Le TTC
        l'accompagne parce qu'un particulier paie celui-là.
      */}
      <div className={styles.offrePrix}>
        <span className={styles.offrePrixHt}>{montantLisible(PRIX_HT_CENTIMES)} HT</span>
        <span className={styles.offrePrixTtc}>
          soit {montantLisible(PRIX_TTC_CENTIMES)} TTC
        </span>
      </div>

      <dl className={styles.offreFaits}>
        {colonne.lignes
          .filter((ligne) => ligne.cle !== "prix")
          .map((ligne) => (
            <div key={ligne.cle} className={styles.offreFait}>
              <dt>{ligne.libelle}</dt>
              <dd>{ligne.valeur}</dd>
            </div>
          ))}
        <div className={styles.offreFait}>
          <dt>Format</dt>
          <dd>Visioconférence</dd>
        </div>
      </dl>

      {/*
        Les matières, pour répondre à « est-ce que mon sujet en fait partie ».

        Elles ne sont pas cliquables ici : le choix se fait dans l'assistant, une fois le
        rendez-vous engagé. Les montrer d'abord évite d'ouvrir une fenêtre pour découvrir
        qu'on n'est pas au bon endroit.
      */}
      <div className={styles.offreMatieres}>
        <p className={styles.offreMatieresTitre}>Les matières couvertes</p>
        <ul className={styles.offreMatieresListe}>
          {MATIERES.filter((matiere) => matiere.cle !== "autre").map((matiere) => (
            <li key={matiere.cle}>{matiere.nom}</li>
          ))}
        </ul>
        <p className={styles.offreMatieresNote}>
          Un autre sujet ? Dites-le à l&apos;assistant, il orientera la demande.
        </p>
      </div>

      {/*
        Sans avocat disponible, le bouton mènerait à une impasse : on donne une sortie
        plutôt qu'un geste inutile.
      */}
      {avocatsDisponibles ? (
        <button type="button" className={styles.offreBouton} onClick={surReservation}>
          Prendre rendez-vous
        </button>
      ) : (
        <Link href="/messagerie" className={styles.offreBouton}>
          Écrire au support
        </Link>
      )}

      {avocatsDisponibles && (
        /* L'assistant demande la matière, puis le créneau, et le paiement vient en
           dernier - au récapitulatif. Le dire évite de cliquer à reculons. */
        <p className={styles.offreNote}>
          Vous choisissez la matière et le créneau ; le règlement vient au récapitulatif.
        </p>
      )}
    </aside>
  );
}
