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
    <div className={styles.contenu}>
      <h2>Modifier votre société</h2>
      <p className={styles.description}>
        Cherchez votre société au registre, dites ce que vous changez, et nous nous
        occupons du reste : actes rédigés, statuts mis à jour article par article,
        annonce légale publiée, dépôt au guichet unique et suivi jusqu&apos;à
        l&apos;extrait à jour.
      </p>

      <ul className={styles.entreeListe}>
        {MODIFICATIONS.map((m) => (
          <li key={m.code}>{m.libelle}</li>
        ))}
      </ul>

      <p className={styles.description}>
        À partir de {montantLisible(HONORAIRES_PREMIERE_CENTIMES)} HT, plus les frais
        d&apos;annonce et de greffe, refacturés à l&apos;euro. Une assemblée qui décide
        plusieurs changements ne paie qu&apos;une fois ces frais.
      </p>

      {erreur && <p role="alert">{erreur}</p>}

      <div className={styles.actions}>
        <button type="button" className={styles.principal} onClick={ouvrir} disabled={enCours}>
          {enCours ? "Ouverture" : "Commencer"}
        </button>
      </div>
    </div>
  );
}
