import Link from "next/link";
import { FAMILLES, type ParcoursACreer } from "@/domain/navigation/parcours";
import { dateEnTete } from "@/lib/dates";
import styles from "./Accueil.module.css";

/**
 * Le tableau de bord d'un compte qui vient de s'inscrire.
 *
 * C'est le premier écran de la plateforme, et le seul que voit un client tant qu'il
 * n'a rien commencé : il doit répondre à « qu'est-ce que je peux faire ici », d'un
 * coup d'œil et sans défiler.
 *
 * Il ne le faisait pas. Il proposait quatre parcours sur huit - la page d'origine
 * décrivait un groupe « gérer » dans ses données sans jamais le rendre, et l'on avait
 * reproduit l'omission : un client venu transférer son siège ou clore sa liquidation
 * repartait en croyant que Formalist ne savait pas le faire.
 *
 * La disposition tient en quatre rangées. L'intitulé de famille occupe la première
 * colonne au lieu de coiffer la rangée : à quatre familles de deux parcours, une
 * grille à trois colonnes laisserait une cellule vide par rangée - le défaut qu'on
 * venait de corriger ailleurs. Ici les rangées sont pleines, et l'œil descend les
 * moments de la vie d'une société comme un sommaire.
 *
 * Les cartes sont horizontales : l'icône à gauche, le texte à droite. En vertical,
 * chacune faisait cent quarante pixels dont un tiers de blanc.
 */

const OUVERTURE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">';

function Carte({ parcours }: { parcours: ParcoursACreer }) {
  return (
    <li>
      <Link
        href={parcours.lien}
        className={
          parcours.recommande ? `${styles.chemin} ${styles.recommande}` : styles.chemin
        }
      >
        <span
          className={styles.icone}
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

          {/* Le temps et le prix, quand le catalogue les connaît. */}
          {parcours.duree && parcours.prix && (
            <span className={styles.cheminMeta}>
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
              {parcours.duree} · {parcours.prix}
            </span>
          )}
        </span>

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
      </Link>
    </li>
  );
}

/** `salutation` est la ligne du bandeau, qui monte ici : « Bonsoir Hani ». */
export function Accueil({ salutation }: { salutation: string }) {
  return (
    <div className={styles.hero}>
      {/* La date à droite du titre, comme en tête des autres pages. */}
      <div className={styles.haut}>
        <h1 className={styles.titre}>{salutation} 👋</h1>
        <span className={styles.date}>{dateEnTete()}</span>
      </div>

      {/*
        « Première étape : créez votre société » contredisait la carte « Fermer ma
        société » posée trois lignes plus bas. Tout le monde n'arrive pas ici pour
        créer : on vient aussi transférer un siège ou clore une liquidation.
      */}
      <p className={styles.chapeau}>
        Vous n&apos;avez encore aucune formalité. Voici tout ce que Formalist sait faire :
        choisissez ce que vous voulez <strong>créer, gérer ou fermer</strong>.
      </p>

      <div className={styles.grille}>
        {FAMILLES.map((famille) => (
          <section className={styles.rangee} key={famille.titre}>
            <h2 className={styles.famille}>{famille.titre}</h2>
            <ul className={styles.cartes}>
              {famille.parcours.map((parcours) => (
                <Carte key={parcours.lien} parcours={parcours} />
              ))}
            </ul>
          </section>
        ))}
      </div>

      {/*
        La réassurance descend.
        En pastille verte à côté de la salutation, elle occupait le coin le plus
        précieux de la page pour un argument qui a déjà fait son travail : le client
        est inscrit. En bas, elle rassure celui qui hésite encore devant les prix.
      */}
      <p className={styles.reassurance}>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <polyline points="9 12 11 14 15 10" />
        </svg>
        <span>
          Vos actes sont rédigés et relus par des avocats. <strong>100% sécurisé</strong>
        </span>
      </p>
    </div>
  );
}
