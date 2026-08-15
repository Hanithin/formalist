import Link from "next/link";
import styles from "./Avocat.module.css";

interface Props {
  page: number;
  pages: number;
  premier: number;
  dernier: number;
  total: number;
  /** Les critères en cours, que chaque lien doit conserver. */
  criteres: Record<string, string | undefined>;
}

/**
 * La pagination de la liste du cabinet.
 *
 * Elle porte le rang plutôt que le seul numéro de page : « 16-30 sur 47 » dit à la
 * fois où on est et combien il reste, là où « page 2 sur 4 » oblige à multiplier.
 *
 * Les liens conservent la recherche et le tri : une pagination qui les perd ramène à
 * la liste entière au deuxième clic.
 */
export function Pagination({ page, pages, premier, dernier, total, criteres }: Props) {
  if (pages <= 1) {
    return (
      <p className={styles.rang}>
        {total} dossier{total > 1 ? "s" : ""}
      </p>
    );
  }

  const adresse = (numero: number) => {
    const parametres = new URLSearchParams();
    for (const [cle, valeur] of Object.entries(criteres)) {
      if (valeur) parametres.set(cle, valeur);
    }
    if (numero > 1) parametres.set("page", String(numero));
    const suite = parametres.toString();
    return "/avocat" + (suite ? "?" + suite : "");
  };

  // Une fenêtre de numéros autour de la page courante, avec les extrémités : une
  // liste de quarante pages ne s'affiche pas en entier.
  const numeros = new Set<number>([1, pages, page]);
  if (page - 1 > 1) numeros.add(page - 1);
  if (page + 1 < pages) numeros.add(page + 1);
  const ordonnes = [...numeros].sort((a, b) => a - b);

  return (
    <div className={styles.pagination}>
      <p className={styles.rang}>
        {premier}-{dernier} sur {total}
      </p>

      <nav className={styles.pages} aria-label="Pages de résultats">
        {page > 1 && (
          <Link href={adresse(page - 1)} className={styles.pageLien} rel="prev">
            Précédent
          </Link>
        )}

        {ordonnes.map((numero, i) => (
          <span key={numero} className={styles.pageGroupe}>
            {/* Une coupure là où la suite saute un numéro. */}
            {i > 0 && numero - ordonnes[i - 1] > 1 && <span className={styles.coupure}>…</span>}
            <Link
              href={adresse(numero)}
              className={numero === page ? `${styles.pageLien} ${styles.pageActive}` : styles.pageLien}
              aria-current={numero === page ? "page" : undefined}
            >
              {numero}
            </Link>
          </span>
        ))}

        {page < pages && (
          <Link href={adresse(page + 1)} className={styles.pageLien} rel="next">
            Suivant
          </Link>
        )}
      </nav>
    </div>
  );
}
