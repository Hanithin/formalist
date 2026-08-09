import Link from "next/link";
import styles from "./Vide.module.css";

interface Props {
  titre: string;
  texte: string;
  action?: { libelle: string; lien: string };
}

/** Une liste vide est une invitation à agir, pas un constat. */
export function Vide({ titre, texte, action }: Props) {
  return (
    <div className={styles.bloc}>
      <p className={styles.titre}>{titre}</p>
      <p className={styles.texte}>{texte}</p>
      {action && (
        <Link href={action.lien} className={styles.action}>
          {action.libelle}
        </Link>
      )}
    </div>
  );
}
