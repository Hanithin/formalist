import styles from "./TableauDeBord.module.css";

/**
 * Anneau d'avancement.
 *
 * Repris du tableau de bord d'origine : le pourcentage se lit d'un coup d'oeil,
 * et l'anneau donne la proportion sans qu'on ait à comparer des chiffres.
 */
export function Avancement({ pourcentage }: { pourcentage: number }) {
  const rayon = 58;
  const circonference = 2 * Math.PI * rayon;
  const reste = circonference - (circonference * Math.min(Math.max(pourcentage, 0), 100)) / 100;

  return (
    <div className={styles.singleHeroProgress}>
      <svg viewBox="0 0 132 132" aria-hidden="true">
        <circle className="bg" cx="66" cy="66" r={rayon} />
        <circle
          className="fg"
          cx="66"
          cy="66"
          r={rayon}
          strokeDasharray={circonference}
          strokeDashoffset={reste}
        />
      </svg>
      <div className={styles.pct}>
        <div className={styles.pctValue}>{pourcentage}%</div>
        <div className={styles.pctLabel}>Avancement</div>
      </div>
    </div>
  );
}
