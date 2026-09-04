"use client";

import { useState } from "react";
import styles from "../Avocat.module.css";

/**
 * Une section du dossier, derrière son bouton.
 *
 * Le dossier tenait sur une page qui n'en finissait pas : les documents, puis l'avis à
 * publier avec son texte en toutes lettres, puis le fil des échanges, puis le journal,
 * puis les notes internes. Quatre de ces cinq choses ne se consultent qu'à un moment
 * précis - on publie l'avis une fois, on relit le journal quand quelque chose cloche -
 * et elles s'interposaient en permanence entre l'avocat et les actes qu'il vient lire.
 *
 * Le bouton dit ce qu'il y a dedans ; la fenêtre le montre. Ce qui reste sur la page
 * est ce sur quoi on travaille : les documents, et la conversation avec le client.
 */
export function Volet({
  libelle,
  titre,
  large,
  children,
}: {
  /** Ce que le bouton annonce, court : il tient sur une ligne avec les autres. */
  libelle: string;
  /** Le titre de la fenêtre, qui peut être plus explicite que le bouton. */
  titre: string;
  /** L'avis et le journal se lisent large ; les notes s'écrivent en colonne. */
  large?: boolean;
  children: React.ReactNode;
}) {
  const [ouvert, setOuvert] = useState(false);

  return (
    <>
      <button
        type="button"
        className={styles.situationEtapes}
        onClick={() => setOuvert(true)}
      >
        {libelle}
      </button>

      {ouvert && (
        <>
          <div
            className={styles.voile}
            onClick={() => setOuvert(false)}
            aria-hidden="true"
          />

          <div
            className={`${styles.fenetreEtapes} ${large ? styles.fenetreLarge : ""}`}
            role="dialog"
            aria-modal="true"
            aria-label={titre}
          >
            <div className={styles.fenetreEtapesTete}>
              <h2 className={styles.fenetreEtapesTitre}>{titre}</h2>
              <button
                type="button"
                className={styles.fenetreEtapesFermer}
                onClick={() => setOuvert(false)}
                aria-label="Fermer"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {children}
          </div>
        </>
      )}
    </>
  );
}
