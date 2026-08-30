import {
  colonneDeModification,
  type DonneesDeLaColonne,
} from "@/domain/modification/colonne";
import styles from "./Modification.module.css";

/**
 * La colonne de droite : la société, ce qu'on lui change, et ce que cela coûte.
 *
 * Reprise du parcours de création et du dépôt des comptes. Ce qu'elle ajoute ici, c'est
 * la liste des changements cochés : on les choisit à l'étape deux, on remplit leurs
 * détails à l'étape trois, et l'on ne sait plus lesquels on avait pris.
 *
 * Elle suit la frappe : elle lit le même état que le formulaire.
 */
export function Recapitulatif({ etat }: { etat: DonneesDeLaColonne }) {
  const colonne = colonneDeModification(etat);

  return (
    <aside className={styles.colonne} aria-label="Récapitulatif de votre modification">
      <p className={styles.colonneForme}>{colonne.forme ?? "Forme à renseigner"}</p>
      <p className={colonne.denomination ? styles.colonneNom : styles.colonneNomVide}>
        {colonne.denomination ?? "Société à choisir"}
      </p>

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

      <div className={styles.colonneGroupe}>
        <h2 className={styles.colonneGroupeTitre}>Ce que vous changez</h2>
        {colonne.changements.length > 0 ? (
          <ul className={styles.colonneGroupeListe}>
            {colonne.changements.map((changement) => (
              <li key={changement}>{changement}</li>
            ))}
          </ul>
        ) : (
          <p className={styles.colonneGroupeVide}>à choisir</p>
        )}
      </div>

      <div className={styles.colonnePied}>
        <p className={styles.colonnePiedLigne}>
          <span>Total</span>
          <span>{colonne.total} TTC</span>
        </p>
      </div>
    </aside>
  );
}
