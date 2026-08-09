import styles from "./Etat.module.css";

type Ton = "neutre" | "attente" | "abouti" | "avance" | "termine";

/** Pastille d'état. La couleur double le mot, elle ne le remplace pas. */
export function Etat({ libelle, ton }: { libelle: string; ton: Ton }) {
  return <span className={styles[ton] ?? styles.neutre}>{libelle}</span>;
}
