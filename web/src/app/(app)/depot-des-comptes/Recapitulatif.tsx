import { colonneDesComptes, type DonneesDeLaColonne } from "@/domain/comptes/colonne";
import styles from "../modification/Modification.module.css";

/**
 * La colonne de droite : ce qui est déjà saisi, et jusqu'à quand.
 *
 * Reprise du parcours de création, où elle répond à la question qu'on se pose à la
 * cinquième étape - qu'est-ce que j'ai déjà répondu ? Le dépôt des comptes en pose une
 * seconde, que la création ne pose pas : la date limite de dépôt au greffe, la seule
 * information de ce dossier qui ait une échéance.
 *
 * Elle suit la frappe : elle lit le même état que le formulaire.
 */
export function Recapitulatif({ etat }: { etat: DonneesDeLaColonne }) {
  const colonne = colonneDesComptes(etat);

  return (
    <aside className={styles.colonne} aria-label="Récapitulatif de votre dépôt">
      <p className={styles.colonneForme}>{colonne.forme ?? "Forme à renseigner"}</p>
      <p className={colonne.denomination ? styles.colonneNom : styles.colonneNomVide}>
        {colonne.denomination ?? "Société à choisir"}
      </p>

      {colonne.exercice && <p className={styles.colonneSous}>{colonne.exercice}</p>}

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
        {colonne.echeance && (
          <p className={styles.colonnePiedLigne}>
            <span>À déposer avant</span>
            <span>{colonne.echeance}</span>
          </p>
        )}
        <p className={styles.colonnePiedLigne}>
          <span>Total</span>
          <span>{colonne.total} TTC</span>
        </p>
      </div>
    </aside>
  );
}
