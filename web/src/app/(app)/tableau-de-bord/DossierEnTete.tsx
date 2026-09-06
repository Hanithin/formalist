import Link from "next/link";
import { StatutBadge } from "./Sections";
import type { ActionAttendue } from "@/domain/formalite/actions";
import type { Ton } from "@/domain/formalite/accueil";
import styles from "./TableauDeBord.module.css";

/**
 * Le dossier en tête, et rien d'autre à sa gauche.
 *
 * L'accueil empilait sept sections : trois chiffres, un bandeau de reprise, des
 * documents récents, une liste d'attentes, une file de travail, des échéances, une
 * activité récente, un catalogue. Le dossier sur lequel on travaille y apparaissait
 * quatre fois, sous quatre formes, et la question qu'on se pose en ouvrant la page -
 * « qu'est-ce que je fais maintenant ? » - se lisait au quatrième cadre.
 *
 * Ici, un objet : celui qu'on reprend. Ce qu'il est, où il en est, ce qui le bloque,
 * le geste. Le reste de la page ne fait que dire ce qu'il y a d'autre.
 */

export interface EtapeDuChemin {
  titre: string;
  /** Ce qui se passe, dit au client. Vide sur les étapes d'un formulaire. */
  explication?: string;
  etat: "faite" | "en_cours" | "a_venir";
  /** Qui tient l'étape : le client, ou le cabinet. */
  main?: "vous" | "avocat";
}

export interface DossierEnTeteProps {
  /** « Création », « Modification » - la nature de la formalité. */
  nature: string;
  societe: string;
  /** Ce qui suit, en toutes lettres. C'est ce qu'on lit quand on revient. */
  prochaineEtape: string;
  etat: { ton: Ton; libelle: string };
  /**
   * Le chemin du dossier, étape par étape.
   *
   * Deux chemins selon le moment. Tant que le dossier se remplit, ce sont les étapes du
   * formulaire - et seule la création les numérote. Une fois confié, c'est le suivi :
   * transmis, relu, publié, déposé, immatriculé. Le second connaît le chemin de chaque
   * nature de formalité, et porte l'explication de ce qui se passe.
   *
   * L'accueil affichait le premier pour tout le monde : une modification y lisait
   * « étape 3 sur 5 » d'un parcours qui n'est pas le sien, et un pourcentage calculé
   * dessus - « 100 % » sur un dossier qu'on venait de reprendre parce qu'il n'était pas
   * fini.
   */
  etapes?: EtapeDuChemin[];
  /** Ce que le dossier attend de son propriétaire, au plus deux. */
  actions: ActionAttendue[];
  geste: string;
  lien: string;
  avocat: string | null;
  nonLus: number;
}

export function DossierEnTete({
  nature,
  societe,
  prochaineEtape,
  etat,
  etapes,
  actions,
  geste,
  lien,
  avocat,
  nonLus,
}: DossierEnTeteProps) {
  /*
   * La liste ne paraît que si elle apprend quelque chose.
   *
   * Une attente unique et sans blocage disait trois fois le même fait : l'étape en
   * cours, « À faire · Modification à finaliser · Reprenez la saisie », et le bouton
   * « Reprendre ». Elle se réduit alors à sa phrase, en sous-titre, et le bouton porte
   * le geste.
   *
   * Deux attentes, pas davantage : un dossier qui en porte six a un problème que
   * l'accueil ne résoudra pas, on l'ouvre. Ce qui tient ici, c'est de quoi décider s'il
   * faut l'ouvrir maintenant.
   */
  /*
   * Rien à reprendre quand le dossier est chez l'avocat.
   *
   * Le chemin disait « Vérification par un avocat » et, deux lignes plus haut,
   * « Reprenez la saisie là où vous l'avez laissée » : deux affirmations contraires sur
   * le même écran. Le suivi sait qui tient l'étape en cours ; c'est lui qui tranche, et
   * l'attente du client se tait tant que ce n'est pas son tour.
   */
  const enCoursChezNous = etapes?.some((e) => e.etat === "en_cours" && e.main === "avocat");

  const detaillees =
    !enCoursChezNous && (actions.length > 1 || actions[0]?.urgent === true);
  const retenues = detaillees ? actions.slice(0, 2) : [];
  const reste = detaillees ? actions.length - retenues.length : 0;
  const sousTitre = enCoursChezNous
    ? null
    : detaillees
      ? null
      : (actions[0]?.precision ?? prochaineEtape);

  return (
    <section className={styles.teteCarte} aria-labelledby="dossier-en-tete">
      <div className={styles.teteBandeau}>
        <span className={styles.teteNature}>{nature}</span>
        <StatutBadge ton={etat.ton} libelle={etat.libelle} />
      </div>

      <h2 id="dossier-en-tete" className={styles.teteSociete}>
        {societe}
      </h2>

      {/*
        Ce qu'on attend, en une phrase, quand la liste ne s'impose pas.

        Les deux se rendaient l'une sous l'autre : « Modification à finaliser :
        reprenez la saisie là où vous l'avez laissée », puis « À faire · Modification à
        finaliser · Reprenez la saisie là où vous l'avez laissée ».
      */}
      {sousTitre && <p className={styles.teteEtape}>{sousTitre}</p>}

      {/*
        Le chemin en descente, avec ce qui s'y passe.

        Il tenait sur une ligne, cinq jalons côte à côte, et l'encadré gardait dessous
        trois cents pixels de blanc. À la verticale, il occupe la carte pour ce qu'il
        est - le seul objet de la page - et chaque étape a la place de dire ce qu'elle
        fait, ce qu'un jalon d'un centimètre ne pouvait pas.

        Seule l'étape en cours porte son explication : les autres se nomment, et c'est
        assez. Tout expliquer ferait de la carte un mode d'emploi.
      */}
      {etapes && etapes.length > 0 && (
        <ol className={styles.teteChemin} aria-label="Les étapes de la formalité">
          {etapes.map((etape) => (
            <li
              key={etape.titre}
              className={[
                styles.teteEtapeLigne,
                etape.etat === "faite" ? styles.teteEtapeFaite : "",
                etape.etat === "en_cours" ? styles.teteEtapeCourante : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <span className={styles.teteJalonPoint} aria-hidden="true" />
              <span className={styles.teteJalonCorps}>
                <span className={styles.teteJalonNom}>{etape.titre}</span>
                {etape.etat === "en_cours" && etape.explication && (
                  <span className={styles.teteJalonExplication}>{etape.explication}</span>
                )}
              </span>
            </li>
          ))}
        </ol>
      )}

      {/*
        Ce qui bloque, sous le chemin.

        Ces mêmes phrases vivaient dans une carte à part, « Ce qui requiert votre
        attention », qui mêlait les attentes de tous les dossiers : celles-ci, on les
        lit sous le dossier qu'elles retiennent.
      */}
      {retenues.length > 0 && (
        <div className={styles.teteAFaire}>
          <p className={styles.teteAFaireTitre}>À faire</p>
          <ul className={styles.teteAttentes}>
            {retenues.map((action) => (
              <li key={action.titre} className={styles.teteAttente}>
                <span
                  className={action.urgent ? styles.teteAttentePoint : styles.teteAttentePointCalme}
                  aria-hidden="true"
                />
                <span>
                  <span className={styles.teteAttenteTitre}>{action.titre}</span>
                  <span className={styles.teteAttentePrecision}>{action.precision}</span>
                </span>
              </li>
            ))}
          </ul>
          {reste > 0 && (
            <p className={styles.teteReste}>
              {reste > 1 ? "et " + reste + " autres gestes" : "et un autre geste"}
            </p>
          )}
        </div>
      )}

      <div className={styles.tetePied}>
        <Link href={lien} className={styles.teteGeste}>
          {/* On ne « reprend » pas un dossier qu'on n'a pas la main pour avancer. */}
          {enCoursChezNous ? "Voir le dossier" : geste}
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="13 6 19 12 13 18" />
          </svg>
        </Link>

        {/*
          Qui suit le dossier, et ce qui vous attend dans la messagerie.

          Un dossier confié à un cabinet n'est pas une file d'attente anonyme : le nom
          de celui qui le tient vaut mieux qu'une barre de progression de plus.
        */}
        <p className={styles.teteMeta}>
          {avocat ? "Suivi par " + avocat : "En attente d'un avocat"}
          {nonLus > 0 && (
            <>
              {" · "}
              <Link href="/messagerie" className={styles.teteMetaLien}>
                {nonLus > 1 ? nonLus + " messages non lus" : "1 message non lu"}
              </Link>
            </>
          )}
        </p>
      </div>
    </section>
  );
}
