import Link from "next/link";
import { FAMILLES, type ParcoursACreer } from "@/domain/navigation/parcours";
import styles from "./Accueil.module.css";

/**
 * Le tableau de bord d'un compte qui vient de s'inscrire.
 *
 * C'est le premier écran de la plateforme, et le seul que voit un client tant qu'il
 * n'a rien commencé : il doit répondre à « qu'est-ce que je peux faire ici », d'un
 * coup d'œil et sans défiler.
 *
 * Il est bâti comme les autres états du tableau de bord : la salutation, la date et
 * le bouton dans le bandeau de page, puis des sections intitulées qui portent des
 * cartes blanches sur le fond gris. Il avait d'abord repris le hero sombre du HTML
 * d'origine - un client passait d'un écran noir à un écran clair au moment même où il
 * commençait son premier dossier - puis une grande carte blanche contenant d'autres
 * cartes, qui ajoutait un cadre sans rien dire de plus.
 *
 * Les huit parcours sont là, rangés par moment de la vie d'une société. Le HTML
 * d'origine n'en montrait que quatre : il décrivait un groupe « gérer » dans ses
 * données sans jamais le rendre, et un client venu transférer son siège repartait en
 * croyant que Formalist ne savait pas le faire.
 */

const OUVERTURE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">';

/**
 * Une carte en deux étages.
 *
 * En haut ce que le parcours est - l'icône, son nom, ce qu'il recouvre. En bas, sur
 * son propre filet, ce qu'il en coûte : la durée à gauche, le prix à droite, et la
 * flèche au bout. Les deux questions qu'on se pose avant de cliquer ont ainsi leur
 * ligne, au lieu d'être une troisième ligne grise sous la description.
 *
 * Sur une seule ligne, la carte laissait un large blanc en son milieu : l'icône et le
 * texte se tassaient à gauche, la flèche restait à droite, et rien n'occupait
 * l'intervalle.
 */
function Carte({ parcours }: { parcours: ParcoursACreer }) {
  return (
    <li>
      <Link
        href={parcours.lien}
        className={
          parcours.recommande ? `${styles.chemin} ${styles.recommande}` : styles.chemin
        }
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
    </li>
  );
}

export function Accueil() {
  return (
    <div className={styles.accueil}>
      <div className={styles.haut}>
        {/*
          Ce que la page propose, et ce qui se passe après le clic.

          Cette phrase remplace un chapeau et un bandeau numéroté qui disaient la même
          chose en deux fois - et dont le « 1 » annonçait une deuxième étape qui n'est
          jamais venue. Elle ne promet pas non plus de « créer votre société » : on
          vient aussi ici transférer un siège ou clore une liquidation.
        */}
        <p className={styles.chapeau}>
          Voici tout ce que Formalist sait faire. Répondez à quelques questions :{" "}
          <strong>un avocat rédige les actes et les dépose</strong>, et vous suivez
          l&apos;avancement depuis cet écran.
        </p>

        {/* La réassurance avant les prix, non en pied de page une fois la page quittée. */}
        <span className={styles.reassurance}>
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
            100% sécurisé · <strong>Validé par nos avocats</strong>
          </span>
        </span>
      </div>

      {/*
        L'intitulé coiffe ses cartes au lieu d'occuper une colonne à leur gauche.

        Cette colonne prenait deux cent quatorze pixels pour deux mots, et les cartes
        s'étiraient sur ce qui restait. Au-dessus, l'intitulé ne coûte qu'une ligne, et
        l'œil descend les moments de la vie d'une société comme un sommaire.
      */}
      {FAMILLES.map((famille) => (
        <section className={styles.famille} key={famille.titre}>
          <h2 className={styles.familleTitre}>{famille.titre}</h2>
          <ul className={styles.cartes}>
            {famille.parcours.map((parcours) => (
              <Carte key={parcours.lien} parcours={parcours} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
