"use client";

import { useState } from "react";
import styles from "../Avocat.module.css";

/**
 * Les gestes de repli d'un document, derrière trois points.
 *
 * La rangée d'un document portait tous ses gestes côte à côte : quatre lignes, quatre
 * groupes de largeurs différentes, et « Ouvrir » à quatre abscisses. Aligner cette
 * colonne demandait de lui réserver la largeur du groupe le plus large - trois cent
 * trente-huit pixels - et il ne restait alors plus assez pour les noms, qui se
 * faisaient tronquer.
 *
 * Chaque rangée garde donc « Ouvrir » et l'action qui fait avancer le dossier ; ce qui
 * revient en arrière - reprendre un acte remis, revenir sur une validation, demander
 * une autre pièce - passe ici. On ne cache jamais le geste courant, seulement celui
 * qu'on fait une fois sur vingt.
 */
export function MenuGestes({ children }: { children: React.ReactNode }) {
  const [ouvert, setOuvert] = useState(false);

  return (
    <span className={styles.menuGestes}>
      <button
        type="button"
        className={styles.menuGestesBouton}
        onClick={() => setOuvert((montre) => !montre)}
        aria-expanded={ouvert}
        aria-haspopup="menu"
        aria-label="Autres gestes sur ce document"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>

      {ouvert && (
        <>
          {/* Sans teinte : il ferme le menu au clic dehors, il n'assombrit pas la page. */}
          <div className={styles.menuVoile} onClick={() => setOuvert(false)} aria-hidden="true" />

          {/*
            Le menu ne se referme pas au clic sur un de ses gestes.

            Certains ouvrent une fenêtre - « Demander une autre pièce » - et cette
            fenêtre est rendue par le geste lui-même : refermer le menu la démontait
            aussitôt, et le clic ne paraissait rien faire. On sort du menu par le voile,
            ou par la fenêtre qu'on vient d'ouvrir.
          */}
          <div className={styles.menuGestesListe} role="menu">
            {children}
          </div>
        </>
      )}
    </span>
  );
}
