"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import styles from "../Avocat.module.css";

/**
 * L'attestation de parution, déposée depuis la liste des documents.
 *
 * Le cabinet publie l'avis et reçoit la preuve du journal : le greffe l'exige au dépôt,
 * et le client la garde dans ses documents. Elle se dépose aussi depuis le volet de
 * l'annonce, là où l'on vient de copier le texte publié - mais c'est ici qu'on la
 * cherche, avec les autres pièces du dossier, et une place en pointillé se lit comme
 * une place à remplir plutôt que comme une action de plus.
 */
export function DepotParution({ dossier }: { dossier: number }) {
  const [refus, setRefus] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const router = useRouter();

  function deposer(fichier: File) {
    setRefus(null);

    demarrer(async () => {
      const corps = new FormData();
      corps.append("dossier", String(dossier));
      corps.append("type", "parution");
      corps.append("fichier", fichier);

      const reponse = await fetch("/api/avocat/livrables", { method: "POST", body: corps });
      if (!reponse.ok) {
        const retour = await reponse.json().catch(() => ({}));
        setRefus(retour.error ?? "L'attestation n'a pas pu être déposée");
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      <label className={styles.depotPointille}>
        <span className={styles.depotPointilleSigne} aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </span>

        <span className={styles.depotPointilleTexte}>
          {enCours ? "Envoi…" : "Déposer l'attestation de parution"}
          <span className={styles.depotPointilleNote}>
            Le justificatif du journal - il part au guichet et rejoint les documents du
            client.
          </span>
        </span>

        <input
          type="file"
          className={styles.champFichier}
          accept=".pdf,.jpg,.jpeg,.png,.heic,.heif"
          disabled={enCours}
          onChange={(e) => {
            const fichier = e.target.files?.[0];
            e.target.value = "";
            if (fichier) deposer(fichier);
          }}
        />
      </label>

      {refus && (
        <p className={styles.decisionRefus} role="alert">
          {refus}
        </p>
      )}
    </>
  );
}
