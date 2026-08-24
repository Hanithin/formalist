"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import styles from "../Avocat.module.css";

/**
 * Valider une pièce, ou en demander une autre.
 *
 * Les deux boutons n'avaient aucune mise en forme - leurs classes n'existaient pas
 * dans la feuille - et sortaient donc en boutons de navigateur, plus hauts que le lien
 * « Ouvrir » d'à côté, qu'ils repoussaient à la ligne. Ils portent maintenant la même
 * hiérarchie que partout ailleurs : la décision attendue en plein, le refus en creux.
 *
 * Le motif est obligatoire au refus : « document refusé » sans raison oblige le client
 * à écrire pour comprendre ce qu'on attend de lui, et le dossier attend deux jours de
 * plus.
 */
export function Verification({
  documentId,
  decidee,
}: {
  documentId: number;
  /**
   * La pièce porte déjà une décision.
   *
   * On ne propose plus alors de statuer, mais de revenir dessus : une validation
   * donnée trop vite ne se reprenait pas, la pièce passait « Vérifié » et n'offrait
   * plus aucun geste.
   */
  decidee?: boolean;
}) {
  const [refus, setRefus] = useState(false);
  const [enCours, demarrer] = useTransition();
  const router = useRouter();

  function statuer(decision: "valider" | "refuser" | "reprendre", motif?: string) {
    demarrer(async () => {
      await fetch("/api/avocat/documents", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document: documentId, decision, motif }),
      });
      setRefus(false);
      router.refresh();
    });
  }

  if (decidee) {
    return (
      <button
        type="button"
        className={styles.decisionSecondaire}
        onClick={() => statuer("reprendre")}
        disabled={enCours}
      >
        {enCours ? "…" : "Revenir sur la validation"}
      </button>
    );
  }

  if (refus) {
    return (
      <form
        className={styles.refus}
        onSubmit={(e) => {
          e.preventDefault();
          const motif = new FormData(e.currentTarget).get("motif");
          statuer("refuser", String(motif ?? ""));
        }}
      >
        <label htmlFor={"motif-" + documentId} className={styles.refusLabel}>
          Que doit redéposer le client ?
        </label>
        <div className={styles.refusLigne}>
          <input
            id={"motif-" + documentId}
            name="motif"
            className={styles.refusChamp}
            placeholder="Document illisible, périmé, au nom d'un tiers…"
            required
            autoFocus
          />
          <button type="submit" className={styles.decisionRefuser} disabled={enCours}>
            {enCours ? "Envoi" : "Demander"}
          </button>
          <button
            type="button"
            className={styles.decisionSecondaire}
            onClick={() => setRefus(false)}
            disabled={enCours}
          >
            Annuler
          </button>
        </div>
        <p className={styles.refusNote}>
          Le client est prévenu, reçoit un message reprenant ce motif, et peut déposer une
          autre pièce.
        </p>
      </form>
    );
  }

  return (
    <span className={styles.decisions}>
      <button
        type="button"
        className={styles.decisionPrincipale}
        onClick={() => statuer("valider")}
        disabled={enCours}
      >
        {enCours ? "…" : "Valider"}
      </button>
      <button
        type="button"
        className={styles.decisionSecondaire}
        onClick={() => setRefus(true)}
        disabled={enCours}
      >
        Demander une autre pièce
      </button>
    </span>
  );
}
