"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import styles from "../Avocat.module.css";

export function Verification({ documentId }: { documentId: number }) {
  const [refus, setRefus] = useState(false);
  const [enCours, demarrer] = useTransition();
  const router = useRouter();

  function statuer(decision: "valider" | "refuser", motif?: string) {
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
        <label htmlFor={"motif-" + documentId}>Motif du refus</label>
        <input
          id={"motif-" + documentId}
          name="motif"
          placeholder="Document illisible, périmé…"
          autoFocus
        />
        <button type="submit" disabled={enCours}>
          Refuser
        </button>
        <button type="button" onClick={() => setRefus(false)}>
          Annuler
        </button>
      </form>
    );
  }

  return (
    <span className={styles.decisions}>
      <button type="button" onClick={() => statuer("valider")} disabled={enCours}>
        Valider
      </button>
      <button type="button" onClick={() => setRefus(true)} disabled={enCours}>
        Demander une autre pièce
      </button>
    </span>
  );
}
