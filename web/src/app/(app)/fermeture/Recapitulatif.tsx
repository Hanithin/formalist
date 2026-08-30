import { colonneDeFermeture, type DonneesDeLaColonne } from "@/domain/fermeture/colonne";
import styles from "../modification/Modification.module.css";

/**
 * La colonne de droite : où l'on en est de la fermeture.
 *
 * Reprise des autres parcours, avec ce que celui-ci a de particulier : il se déroule en
 * deux temps séparés par des mois, et le dossier reste ouvert entre les deux. La phase
 * en cours se lit donc sous la dénomination, avant tout le reste - on rouvre ce dossier
 * longtemps après l'avoir quitté.
 *
 * Elle suit la frappe : elle lit le même état que le formulaire.
 */
export function Recapitulatif({ etat }: { etat: DonneesDeLaColonne }) {
  const colonne = colonneDeFermeture(etat);

  return (
    <aside className={styles.colonne} aria-label="Récapitulatif de votre fermeture">
      <p className={styles.colonneForme}>{colonne.forme ?? "Forme à renseigner"}</p>
      <p className={colonne.denomination ? styles.colonneNom : styles.colonneNomVide}>
        {colonne.denomination ?? "Société à choisir"}
      </p>

      <p className={styles.colonneSous}>{colonne.phase}</p>

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
            <span>{colonne.echeance.libelle}</span>
            <span>{colonne.echeance.valeur}</span>
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
