import Link from "next/link";
import type { Filtre } from "@/domain/document/statuts";
import styles from "./Filtres.module.css";

interface Props {
  filtres: Filtre[];
  actif: string;
  /** Adresse de la page, à laquelle le filtre est ajouté en paramètre. */
  base: string;
}

/**
 * Filtres d'une liste.
 *
 * Ce sont des liens, pas des boutons : l'état filtré se partage, se met en favori
 * et survit à un rechargement. Trois pages les partagent.
 */
export function Filtres({ filtres, actif, base }: Props) {
  return (
    <nav className={styles.barre} aria-label="Filtrer la liste">
      {filtres.map((f) => (
        <Link
          key={f.valeur}
          href={f.valeur === "tous" ? base : base + "?filtre=" + f.valeur}
          className={f.valeur === actif ? styles.actif : styles.filtre}
          aria-current={f.valeur === actif ? "true" : undefined}
        >
          {f.libelle}
        </Link>
      ))}
    </nav>
  );
}
