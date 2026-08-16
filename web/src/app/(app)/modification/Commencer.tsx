"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MODIFICATIONS } from "@/domain/modification/types";
import styles from "./Modification.module.css";

/**
 * L'entrée du parcours.
 *
 * Le dossier s'ouvre vide : la société se cherche à la première étape, au registre.
 * La version précédente ne proposait que les sociétés créées chez nous, ce qui
 * excluait la quasi-totalité des modifications - on ne change pas de siège l'année où
 * l'on crée sa société.
 */
export function Commencer({
  societes,
}: {
  societes: { id: number; societe: string | null; forme: string | null }[];
}) {
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
      <h2>Que voulez-vous changer ?</h2>
      <p className={styles.description}>
        Siège, dénomination, dirigeant, objet, capital, durée, cession de parts : nous
        rédigeons les actes, publions l&apos;annonce et déposons au guichet unique. Vos
        statuts sont mis à jour article par article, sur votre document d&apos;origine.
      </p>

      <ul className={styles.changements}>
        {MODIFICATIONS.map((m) => (
          <li key={m.code}>
            <span className={styles.changement}>
              <span className={styles.changementTitre}>{m.libelle}</span>
              <span className={styles.changementDesc}>{m.description}</span>
            </span>
          </li>
        ))}
      </ul>

      {societes.length > 0 && (
        <p className={styles.description}>
          Vos sociétés chez Formalist : {societes.map((s) => s.societe).join(", ")}. Vous
          pourrez aussi en chercher une autre au registre.
        </p>
      )}

      {erreur && <p role="alert">{erreur}</p>}

      <div className={styles.actions}>
        <button type="button" className={styles.principal} onClick={ouvrir} disabled={enCours}>
          {enCours ? "Ouverture" : "Commencer"}
        </button>
      </div>
    </div>
  );
}
