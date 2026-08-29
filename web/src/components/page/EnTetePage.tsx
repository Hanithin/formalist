import { dateEnTete } from "@/lib/dates";
import styles from "./EnTetePage.module.css";

/**
 * La ligne de tête d'un écran.
 *
 * Le titre à gauche, la date à droite, et sous les deux une phrase qui dit à quoi la
 * page sert. Chaque écran la posait chez lui, avec ses propres mesures et sa propre
 * teinte de date - d'où des titres qui ne tombaient pas à la même hauteur d'une page
 * à l'autre, et des dates illisibles sur certaines.
 *
 * L'action est facultative, et n'a sa place ici que si la page est le seul endroit
 * d'où l'on peut la faire. « Nouvelle formalité » a quitté cette barre le jour où
 * l'on a vu que la colonne l'offrait déjà à trente centimètres ; « Déposer un
 * document », lui, n'existe nulle part ailleurs et reste.
 */
export function EnTetePage({
  titre,
  sousTitre,
  action,
  quand,
}: {
  titre: string;
  /**
   * Ce que la page contient, en une phrase.
   *
   * Elle tient sur une ligne : la mesure est de sept cent soixante pixels, soit
   * environ soixante-quinze signes. Plus long, et deux mots restent orphelins en
   * dessous.
   */
  sousTitre?: string;
  /** Le geste que cette page est seule à offrir. */
  action?: React.ReactNode;
  /** La date affichée, pour les tests qui la figent. */
  quand?: Date;
}) {
  return (
    <>
      <div className={styles.entete}>
        <h1 className={styles.titre}>{titre}</h1>

        <div className={styles.cote}>
          <span className={styles.date}>{dateEnTete(quand)}</span>
          {action}
        </div>
      </div>

      {sousTitre && <p className={styles.introduction}>{sousTitre}</p>}
    </>
  );
}
