import { colonneDeContrat } from "@/domain/contrat/colonne";
import styles from "../modification/Modification.module.css";

/**
 * La colonne de droite : rédiger, et ce qu'il faut savoir avant.
 *
 * Le bouton « Nouveau contrat » vivait au bout de la barre de filtres, entre des
 * pastilles qui ne lui ressemblaient pas - on le prenait pour un filtre de plus, et il
 * défilait avec elle. Il tient maintenant le pied de la colonne, qui ne bouge pas.
 *
 * Elle emprunte sa carte à la feuille des parcours, où les colonnes du site sont
 * écrites une fois pour toutes.
 */
export function Redaction({ surNouveau }: { surNouveau: () => void }) {
  const colonne = colonneDeContrat();

  return (
    <aside className={styles.colonne} aria-label="Rédiger un contrat">
      <p className={styles.colonneForme}>Rédiger</p>
      <p className={styles.colonneNom}>Nouveau contrat</p>
      <p className={styles.colonneSous}>
        Vous remplissez quelques informations, un avocat relit, et vous signez.
      </p>

      <dl className={styles.colonneLignes}>
        {colonne.lignes.map((ligne) => (
          <div key={ligne.cle} className={styles.colonneLigne}>
            <dt>{ligne.libelle}</dt>
            <dd>{ligne.valeur}</dd>
          </div>
        ))}
      </dl>

      <button type="button" className={styles.colonneBouton} onClick={surNouveau}>
        Nouveau contrat
      </button>
    </aside>
  );
}
