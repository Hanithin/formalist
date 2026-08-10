import type { ReactNode } from "react";
import Link from "next/link";
import { icone } from "@/domain/navigation/icones";
import styles from "./Vide.module.css";

/**
 * L'absence de contenu, dans ses cinq situations.
 *
 * Elles ne se ressemblent pas et ne doivent pas peser pareil :
 *
 *   accueil       - rien n'existe encore. C'est le premier écran d'un compte :
 *                   il guide et donne envie, donc il occupe la place.
 *   filtre        - la liste existe, ce tri-là ne rend rien. Impasse passagère :
 *                   léger, et il ramène vers la liste entière.
 *   indisponible  - l'utilisateur ne peut rien y faire (personne n'a publié de
 *                   créneau). On le dit, et on ouvre une porte de sortie.
 *   encart        - la place manquante à l'intérieur d'une carte déjà titrée.
 *   discret       - un fil de discussion ou un panneau étroit : une phrase, nue.
 *
 * L'application en avait cinq écritures séparées - emptyStateHero dans l'espace
 * avocat, dashEmpty au tableau de bord, .aucune dans le support, .aucun dans la
 * bulle, notesEmpty dans les dossiers - chacune avec ses couleurs en dur. Elles
 * passent toutes par ici, sur les teintes de globals.css.
 */

type Ton = "accueil" | "filtre" | "indisponible" | "encart" | "discret";

interface Lien {
  libelle: string;
  lien: string;
}

interface Props {
  /** Une phrase, ou une phrase dont le début est mis en avant. */
  texte: ReactNode;
  titre?: string;
  ton?: Ton;
  /** Lien dont on emprunte l'icône : "/documents" pose celle des documents. */
  icone?: string;
  action?: Lien;
  /** Second geste, en retrait : la sortie quand l'action principale ne va pas. */
  secondaire?: Lien;
  /** 3 quand le bloc se glisse sous un h2 de section, 2 sinon. */
  niveau?: 2 | 3;
  /**
   * « Rien à faire pour l'instant » est une bonne nouvelle, pas un manque : le
   * pictogramme passe au vert des états aboutis. Réservé au ton encart.
   */
  positif?: boolean;
}

export function Vide({
  texte,
  titre,
  ton = "accueil",
  icone: dessin,
  action,
  secondaire,
  niveau = 2,
  positif = false,
}: Props) {
  // Le fil de discussion et la bulle n'ont la place que d'une phrase.
  if (ton === "discret") {
    return <p className={styles.discret}>{texte}</p>;
  }

  const Titre = niveau === 3 ? "h3" : "h2";

  return (
    <div className={styles[ton]}>
      {dessin && (
        <span
          className={positif ? `${styles.icone} ${styles.positif}` : styles.icone}
          aria-hidden="true"
          /* Les tracés viennent des données de navigation, pas d'une saisie. */
          dangerouslySetInnerHTML={{ __html: icone(dessin) }}
        />
      )}

      <div className={styles.corps}>
        {titre && <Titre className={styles.titre}>{titre}</Titre>}
        <p className={styles.texte}>{texte}</p>

        {(action || secondaire) && (
          <div className={styles.gestes}>
            {action && (
              <Link href={action.lien} className={styles.action}>
                {action.libelle}
              </Link>
            )}
            {secondaire && (
              <Link href={secondaire.lien} className={styles.secondaire}>
                {secondaire.libelle}
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
