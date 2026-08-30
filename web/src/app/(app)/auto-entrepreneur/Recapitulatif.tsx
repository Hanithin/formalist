import { colonneDeLaDeclaration } from "@/domain/auto-entrepreneur/colonne";
import type { Declaration } from "@/domain/auto-entrepreneur/declaration";
import styles from "../modification/Modification.module.css";

/**
 * La colonne de droite : ce qui est déjà déclaré.
 *
 * Reprise des autres parcours. Elle importe leur feuille de style plutôt que d'en
 * recopier les classes ici : elles y sont déjà écrites une fois, et un quatrième
 * exemplaire de la même carte finirait par diverger des trois autres.
 *
 * Elle suit la frappe : elle lit la même déclaration que le formulaire.
 */
export function Recapitulatif({
  declaration,
  pieces,
}: {
  declaration: Declaration;
  pieces: { type?: string | null }[];
}) {
  const colonne = colonneDeLaDeclaration(declaration, pieces);

  return (
    <aside className={styles.colonne} aria-label="Récapitulatif de votre déclaration">
      <p className={styles.colonneForme}>{colonne.regime ?? "Auto-entreprise"}</p>
      <p className={colonne.nom ? styles.colonneNom : styles.colonneNomVide}>
        {colonne.nom ?? "Votre nom"}
      </p>

      {colonne.activite && <p className={styles.colonneSous}>{colonne.activite}</p>}

      <dl className={styles.colonneLignes}>
        {colonne.lignes.map((ligne) => (
          <div key={ligne.cle} className={styles.colonneLigne}>
            <dt>{ligne.libelle}</dt>
            <dd className={ligne.valeur ? undefined : styles.colonneManque}>
              {ligne.valeur ?? "à renseigner"}
            </dd>
          </div>
        ))}
      </dl>

      <div className={styles.colonnePied}>
        <p className={styles.colonnePiedLigne}>
          <span>Total</span>
          <span>{colonne.total} TTC</span>
        </p>
      </div>
    </aside>
  );
}
