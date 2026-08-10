import Link from "next/link";
import styles from "./Avocat.module.css";

/**
 * La barre de l'espace avocat.
 *
 * La page d'origine en avait quatre entrées - dossiers, consultations,
 * disponibilités, historique - dont deux sont pour l'instant sans page ici. Elles
 * ne figurent pas : un onglet qui ne mène nulle part est pire que son absence.
 */

const ENTREES: { cle: string; libelle: string; lien: string }[] = [
  { cle: "dossiers", libelle: "Dossiers", lien: "/avocat" },
  { cle: "consultations", libelle: "Consultations", lien: "/consultations" },
];

export function SousNavigation({ actif, aVerifier }: { actif: string; aVerifier?: number }) {
  return (
    <nav className={styles.avocatSubnav} aria-label="Espace avocat">
      {ENTREES.map((e) => (
        <Link
          key={e.cle}
          href={e.lien}
          className={
            e.cle === actif ? `${styles.avSubnavBtn} ${styles.active}` : styles.avSubnavBtn
          }
          aria-current={e.cle === actif ? "page" : undefined}
        >
          {e.libelle}
          {e.cle === "dossiers" && !!aVerifier && (
            <span className={styles.subnavMeta}>{aVerifier} à vérifier</span>
          )}
        </Link>
      ))}
    </nav>
  );
}
