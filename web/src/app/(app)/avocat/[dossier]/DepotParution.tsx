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
export function DepotParution({
  dossier,
  deposee,
  avis,
}: {
  dossier: number;
  /**
   * L'attestation est-elle déjà au dossier ?
   *
   * La ligne disparaissait une fois déposée - et emportait le volet de l'avis avec
   * elle, refermant d'un coup la fenêtre d'où l'on venait justement de déposer. Elle
   * reste, et dit ce qu'elle porte : le texte publié se relit après coup, et c'est ici
   * qu'on l'a lu la première fois.
   */
  deposee?: boolean;
  /**
   * Le volet de l'avis, posé à droite de la place à remplir.
   *
   * On ne dépose pas une attestation de parution sans avoir d'abord publié : le texte à
   * porter au journal se lisait derrière un bouton de la barre du dossier, tout en haut,
   * et il fallait savoir l'y chercher. Les deux gestes de l'annonce - lire ce qu'on
   * publie, remettre la preuve - tiennent sur la même ligne.
   */
  avis?: React.ReactNode;
}) {
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
      {/*
        Le volet est frère de la zone, non son enfant : un bouton posé dans un label en
        déclenche le champ de fichier, et cliquer « Annonce légale » aurait ouvert le
        sélecteur du système.
      */}
      <div className={deposee ? styles.depotFait : styles.depotPointille}>
      {deposee ? (
        <p className={styles.depotPointilleZone}>
          <span className={styles.depotPointilleSigne} aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </span>
          <span className={styles.depotPointilleTexte}>
            Attestation de parution déposée
            <span className={styles.depotPointilleNote}>
              Elle part au guichet et figure dans les documents du client.
            </span>
          </span>
        </p>
      ) : (
      <label className={styles.depotPointilleZone}>
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
      )}

        {avis}
      </div>

      {refus && (
        <p className={styles.decisionRefus} role="alert">
          {refus}
        </p>
      )}
    </>
  );
}
