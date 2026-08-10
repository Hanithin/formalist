"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import styles from "./Sidebar.module.css";

/** Le bouton de sortie, au pied de la colonne comme dans la version d'origine. */
export function Deconnexion() {
  const [enCours, demarrer] = useTransition();
  const router = useRouter();

  return (
    <button
      type="button"
      className={styles.bouton}
      title="Se déconnecter"
      aria-label="Se déconnecter"
      disabled={enCours}
      onClick={() =>
        demarrer(async () => {
          await fetch("/api/auth/deconnexion", { method: "POST" });
          router.push("/connexion");
          router.refresh();
        })
      }
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
      </svg>
    </button>
  );
}
