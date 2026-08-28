import Link from "next/link";
import styles from "./Dossier.module.css";

/**
 * De quel dossier s'agit-il ?
 *
 * La page n'avait pour titre qu'un fil d'Ariane en gris clair : « Mes formalités >
 * STERLING PEAK ». Rien ne disait en gros de quelle société ni de quelle formalité on
 * parlait - le nom d'un dossier n'apprend pas s'il s'agit d'un dépôt de comptes, d'une
 * modification ou d'une fermeture, et le client en a souvent plusieurs.
 */
export function TeteDuDossier({
  titre,
  mentions,
  retour,
}: {
  titre: string;
  /** La formalité, l'exercice, ce qui situe le dossier. Les vides sont ignorées. */
  mentions?: (string | null | undefined)[];
  /** Par où l'on repart : le fil d'Ariane le disait en gris clair, tout en haut. */
  retour?: { href: string; libelle: string };
}) {
  const retenues = (mentions ?? []).filter((m): m is string => !!m);

  return (
    <header className={styles.tete}>
      <h1 className={styles.teteTitre}>{titre}</h1>

      {retenues.length > 0 && (
        <div className={styles.teteMentions}>
          {retenues.map((mention, rang) => (
            <span
              key={mention}
              className={
                rang === 0 ? `${styles.teteMention} ${styles.teteMentionForte}` : styles.teteMention
              }
            >
              {mention}
            </span>
          ))}
        </div>
      )}

      {/*
        Par où l'on repart, à droite du titre.

        Le fil d'Ariane le disait en gris clair au-dessus de tout : deux mots à peine
        visibles, qu'il fallait viser. Un bouton se voit et se clique.
      */}
      {retour && (
        <Link className={styles.teteRetour} href={retour.href}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          {retour.libelle}
        </Link>
      )}
    </header>
  );
}
