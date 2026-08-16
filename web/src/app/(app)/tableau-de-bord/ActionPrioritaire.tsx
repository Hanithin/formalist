"use client";

import { useState } from "react";
import Link from "next/link";
import styles from "./TableauDeBord.module.css";

/**
 * Le bandeau du haut : une seule chose à faire, la plus urgente.
 *
 * Quand plusieurs dossiers attendent la même chose, on ne les empile pas - le
 * bandeau en montre un et les flèches font défiler les autres. C'est ce qui
 * évitait, dans la page d'origine, de transformer l'accueil en liste de rappels.
 */

export interface Priorite {
  icone: "message" | "attente" | "document";
  titre: string;
  precision: string;
  /** Le dossier concerné, nommé à part : c'est ce qu'on cherche des yeux. */
  societe?: string;
  /**
   * Le ton du bandeau.
   *
   * L'ambre est la couleur d'un geste attendu. Un simple message de l'avocat le
   * portait aussi : tout s'alarmait de la même façon, donc plus rien ne ressortait.
   */
  ton?: "action" | "info";
  lien: string;
  bouton: string;
}

const ICONES = {
  message: <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />,
  attente: (
    <>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </>
  ),
  document: (
    <>
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </>
  ),
};

function Chevron() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

export function ActionPrioritaire({ priorites }: { priorites: Priorite[] }) {
  const [rang, setRang] = useState(0);
  if (priorites.length === 0) return null;

  const courante = priorites[Math.min(rang, priorites.length - 1)];
  const plusieurs = priorites.length > 1;

  return (
    <div
      className={
        courante.ton === "info" ? `${styles.topAction} ${styles.topActionInfo}` : styles.topAction
      }
    >
      <div className={styles.topActionIcon}>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {ICONES[courante.icone]}
        </svg>
      </div>

      <div className={styles.topActionBody}>
        <div className={styles.topActionTitle}>{courante.titre}</div>
        <div className={styles.topActionDesc}>
          {courante.societe && <span className={styles.topActionSociete}>{courante.societe}</span>}
          {courante.precision}
        </div>
      </div>

      {plusieurs && (
        <div className={styles.topActionNav}>
          <button
            type="button"
            className={styles.taArrow}
            aria-label="Action précédente"
            onClick={() => setRang((r) => (r - 1 + priorites.length) % priorites.length)}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <span className={styles.taCounter}>
            {rang + 1} / {priorites.length}
          </span>
          <button
            type="button"
            className={styles.taArrow}
            aria-label="Action suivante"
            onClick={() => setRang((r) => (r + 1) % priorites.length)}
          >
            <Chevron />
          </button>
        </div>
      )}

      <Link href={courante.lien} className={styles.topActionBtn}>
        {courante.bouton} <Chevron />
      </Link>
    </div>
  );
}
