"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { devisDesComptes, PRESTATIONS } from "@/domain/comptes/offre";
import { montantLisible } from "@/domain/modification/offre";
import { seuilsLisibles } from "@/domain/comptes/confidentialite";
import styles from "../modification/Modification.module.css";

/**
 * L'entrée du parcours annuel.
 *
 * Elle ne fait rien cocher : contrairement à une modification, il n'y a qu'une chose à
 * faire, et la seule question qui vaille - ce qu'on peut rendre confidentiel - dépend
 * de chiffres qu'on n'a pas encore. On dit donc ce qui attend, et l'on ouvre.
 *
 * Les seuils de confidentialité sont montrés ici plutôt qu'à l'étape qui les applique :
 * c'est souvent la raison pour laquelle on vient, et découvrir à la fin qu'on n'y a pas
 * droit est une déception qu'un tableau de trois lignes évite.
 */
export function Commencer() {
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const router = useRouter();

  const montant = devisDesComptes({ forme: "SAS" });

  function ouvrir() {
    if (enCours) return;
    setErreur(null);

    demarrer(async () => {
      const reponse = await fetch("/api/formalites/comptes", { method: "POST" });
      const corps = await reponse.json().catch(() => ({}));

      if (!reponse.ok) {
        setErreur(corps.error ?? "Le dossier n'a pas pu être ouvert");
        return;
      }
      router.push("/depot-des-comptes?dossier=" + corps.dossier);
    });
  }

  return (
    <div className={styles.entree}>
      <div className={styles.entreeTete}>
        <h2 className={styles.entreeTitre}>Approuver et déposer vos comptes</h2>
        <p className={styles.entreeTexte}>
          Déposez votre bilan : nous en lisons les chiffres, calculons la dotation à la
          réserve légale, rédigeons le procès-verbal d&apos;approbation et déposons au
          greffe. Les comptes s&apos;approuvent dans les six mois de la clôture.
        </p>
      </div>

      <div className={styles.entreeBloc}>
        <h3 className={styles.blocTitre}>Ce que vous pouvez garder confidentiel</h3>
        <p className={styles.blocTexte}>
          Déposer n&apos;est pas publier. Selon votre taille, vos comptes peuvent rester
          inaccessibles aux tiers. Deux critères sur trois suffisent.
        </p>

        <ul className={styles.seuils}>
          {seuilsLisibles().map((seuil) => (
            <li key={seuil.taille} className={styles.seuil}>
              <span className={styles.seuilTaille}>{seuil.taille}</span>
              <span className={styles.seuilChiffres}>
                bilan {seuil.bilan} · chiffre d&apos;affaires {seuil.ca} · {seuil.effectif}
              </span>
              <span className={styles.seuilOuvre}>{seuil.ouvre}</span>
            </li>
          ))}
        </ul>

        <p className={styles.entreeNote}>
          Une société civile ne dépose pas ses comptes au greffe : ils ne sont jamais
          publics, et il n&apos;y a rien à rendre confidentiel.
        </p>
      </div>

      {erreur && (
        <p className={styles.entreeRefus} role="alert">
          {erreur}
        </p>
      )}

      <ul className={styles.entreeRepere}>
        {PRESTATIONS.slice(0, 3).map((prestation) => (
          <li key={prestation}>{prestation}</li>
        ))}
      </ul>

      <div className={styles.entreePied}>
        <div className={styles.entreePrix}>
          <span className={styles.entreeMontant}>
            {montantLisible(montant.honorairesHT)} HT
          </span>
          <span className={styles.entreeMention}>
            quel que soit le résultat et le nombre d&apos;associés. S&apos;y ajoutent les
            frais de greffe, refacturés à l&apos;euro -{" "}
            {montantLisible(montant.fraisTTC)} pour le dépôt, et rien pour une société
            civile, qui ne dépose pas.
          </span>
        </div>

        <div className={styles.entreeActions}>
          <button
            type="button"
            className={styles.entreeBouton}
            onClick={ouvrir}
            disabled={enCours}
          >
            {enCours ? "Ouverture…" : "Commencer"}
          </button>
        </div>
      </div>
    </div>
  );
}
