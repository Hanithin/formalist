"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MODIFICATIONS } from "@/domain/modification/types";
import { HONORAIRES_PREMIERE_CENTIMES, montantLisible } from "@/domain/modification/offre";
import styles from "./Modification.module.css";

/**
 * L'entrée du parcours.
 *
 * Elle présente, elle ne demande rien. Une version précédente y faisait cocher les
 * changements, que l'étape 2 reposait ensuite : on répondait deux fois à la même
 * question, et la seconde pour rien.
 *
 * L'ordre est celui du travail réel : on dit d'abord de quelle société il s'agit,
 * puis ce qu'on y change. Chercher la société au registre remplit la moitié du
 * dossier, ce qui rend tout le reste plus court.
 */
export function Commencer() {
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const router = useRouter();

  function ouvrir() {
    setErreur(null);
    demarrer(async () => {
      const reponse = await fetch("/api/formalites/modification", { method: "POST" });
      const corps = await reponse.json().catch(() => ({}));

      if (!reponse.ok) {
        setErreur(corps.error ?? "Le dossier n'a pas pu être ouvert");
        return;
      }
      router.push("/modification?dossier=" + corps.dossier);
    });
  }

  return (
    /*
      Trois temps, séparés par un trait plutôt que par du vide : ce qu'on fait pour
      vous, ce que couvre le service, ce que ça coûte. La liste des changements était
      rendue en puces brutes sur trois colonnes, ce qui la faisait lire comme une
      table des matières ; chaque changement devient une pastille qu'on parcourt d'un
      regard, et le prix quitte le corps du texte pour se poser près du bouton.
    */
    <div className={styles.entree}>
      <div className={styles.entreeTete}>
        <h2 className={styles.entreeTitre}>Modifier votre société</h2>
        <p className={styles.entreeTexte}>
          Cherchez votre société au registre, dites ce que vous changez, et nous nous
          occupons du reste : actes rédigés, statuts mis à jour article par article,
          annonce légale publiée, dépôt au guichet unique et suivi jusqu&apos;à
          l&apos;extrait à jour.
        </p>
      </div>

      <div className={styles.entreeBloc}>
        <h3 className={styles.entreeSousTitre}>Ce que vous pouvez changer</h3>
        <ul className={styles.entreeListe}>
          {MODIFICATIONS.map((m) => (
            <li key={m.code} className={styles.entreePastille}>
              {m.libelle}
            </li>
          ))}
        </ul>
        <p className={styles.entreeNote}>
          Une assemblée qui décide plusieurs changements ne paie qu&apos;une fois les
          frais d&apos;annonce et de greffe.
        </p>
      </div>

      {erreur && (
        <p className={styles.entreeRefus} role="alert">
          {erreur}
        </p>
      )}

      <div className={styles.entreePied}>
        <div className={styles.entreePrix}>
          <span className={styles.entreeMontant}>
            {montantLisible(HONORAIRES_PREMIERE_CENTIMES)} HT
          </span>
          <span className={styles.entreeMention}>
            à partir de, plus les frais d&apos;annonce et de greffe, refacturés à
            l&apos;euro
          </span>
        </div>

        <button type="button" className={styles.entreeBouton} onClick={ouvrir} disabled={enCours}>
          {enCours ? "Ouverture…" : "Commencer"}
        </button>
      </div>
    </div>
  );
}
