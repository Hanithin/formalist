import { recapitulatifDuBrouillon } from "@/domain/formalite/recapitulatif";
import type { Brouillon } from "@/domain/formalite/parcours";
import styles from "./Parcours.module.css";

/**
 * La colonne de droite : ce qui est déjà saisi.
 *
 * Le formulaire occupait neuf cents pixels au milieu d'une zone qui en offre douze
 * cents, et l'écran ne nommait jamais la société qu'on remplissait. La colonne prend
 * le blanc de droite et répond à la question qu'on se pose à l'étape cinq : qu'est-ce
 * que j'ai déjà répondu ?
 *
 * Elle suit la frappe - elle lit le même brouillon que le formulaire - et suit l'ordre
 * des champs de la première étape, pour que l'œil fasse la correspondance sans
 * chercher.
 */
export function Recapitulatif({
  brouillon,
  avancement,
}: {
  brouillon: Brouillon;
  /** Le pourcentage renseigné, calculé une fois par le parcours. */
  avancement: number;
}) {
  const recap = recapitulatifDuBrouillon(brouillon);

  return (
    <aside className={styles.colonne} aria-label="Récapitulatif de votre société">
      <p className={styles.colonneForme}>{recap.forme ?? "Forme à choisir"}</p>
      <p className={recap.denomination ? styles.colonneNom : styles.colonneNomVide}>
        {recap.denomination ?? "Société sans nom"}
      </p>

      <p className={styles.colonneAvancement}>{avancement}% renseigné</p>

      <dl className={styles.colonneLignes}>
        {recap.lignes.map((ligne) => (
          <div key={ligne.cle} className={styles.colonneLigne}>
            <dt>{ligne.libelle}</dt>
            <dd className={ligne.valeur ? undefined : styles.colonneManque}>
              {ligne.valeur ?? "à renseigner"}
            </dd>
          </div>
        ))}
      </dl>

      {/* La formule n'est pas un attribut de la société : elle attend en pied, et ne
          paraît qu'une fois choisie. */}
      {recap.offre && (
        <p className={styles.colonneOffre}>
          <span>Formule</span>
          {recap.offre}
        </p>
      )}
    </aside>
  );
}
