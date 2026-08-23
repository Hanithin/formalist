"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { PARCOURS } from "@/domain/navigation/parcours";
import styles from "./NouvelleFormalite.module.css";

/**
 * Le bouton « + Démarrer une formalité » et sa fenêtre.
 *
 * Reprise de la modale de public/dashboard.html (openNewActionModal) : six cartes
 * à pastille colorée, en deux colonnes, une seule sous 600px. Les libellés, les
 * descriptions et les couleurs sont ceux de la page d'origine.
 *
 * La colonne étant rendue sur le serveur, seul ce bouton a besoin du navigateur :
 * c'est le seul morceau client de la navigation.
 */

const OUVERTURE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">';

/**
 * Le bouton d'ouverture, et la fenêtre qu'il commande.
 *
 * `libelle` et `apparence` existent parce que le même geste s'offre à deux endroits :
 * en tête de colonne, et en haut de la page des formalités - où l'on est venu
 * précisément pour en créer une, et où descendre chercher la colonne est un détour.
 */
export function NouvelleFormalite({
  libelle = "+ Démarrer une formalité",
  apparence = "colonne",
}: {
  libelle?: string;
  apparence?: "colonne" | "page";
} = {}) {
  const [ouverte, setOuverte] = useState(false);
  const bouton = useRef<HTMLButtonElement>(null);
  const fenetre = useRef<HTMLDivElement>(null);

  // Échap ferme, et le focus revient au bouton : sans cela, on se retrouve à
  // naviguer au clavier dans une page dont on ne voit plus le point de départ.
  useEffect(() => {
    if (!ouverte) return;

    function auClavier(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOuverte(false);
        bouton.current?.focus();
      }
    }

    document.addEventListener("keydown", auClavier);
    fenetre.current?.focus();
    return () => document.removeEventListener("keydown", auClavier);
  }, [ouverte]);

  return (
    <>
      <button
        ref={bouton}
        type="button"
        className={apparence === "page" ? styles.actionPage : styles.action}
        onClick={() => setOuverte(true)}
        aria-haspopup="dialog"
        aria-expanded={ouverte}
      >
        {/* Le « + » dit le geste avant même qu'on lise le libellé. */}
        {apparence === "page" && (
          <span className={styles.plus} aria-hidden="true">
            +
          </span>
        )}
        {libelle}
      </button>

      {/*
        La fenêtre est posée sur le document, non dans la colonne.

        La colonne est en position:sticky, ce qui crée un contexte d'empilement : son
        z-index de 1000 y restait prisonnier, et les cartes de la page se peignaient
        par-dessus la fenêtre. Un portail la sort de ce contexte.
      */}
      {/* La fenêtre ne s'ouvre que sur un clic : le document est donc là. */}
      {ouverte &&
        createPortal(
          <div
            className={styles.voile}
            /* Le clic sur le voile ferme ; celui sur la fenêtre ne remonte pas. */
            onClick={() => setOuverte(false)}
          >
            <div
              ref={fenetre}
              className={styles.fenetre}
              role="dialog"
              aria-modal="true"
              aria-labelledby="nouvelle-formalite"
              tabIndex={-1}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={styles.entete}>
                <div>
                  <h2 id="nouvelle-formalite" className={styles.titre}>
                    Nouvelle formalité
                  </h2>
                  <p className={styles.soustitre}>Choisissez le type d&apos;opération à lancer</p>
                </div>
                <button
                  type="button"
                  className={styles.fermer}
                  onClick={() => setOuverte(false)}
                  aria-label="Fermer"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              <div className={styles.grille}>
                {PARCOURS.map((c) => {
                  const dessin = (
                    <span
                      className={`${styles.pastille} ${styles[c.teinte]}`}
                      aria-hidden="true"
                      /* Les tracés sont des données de ce fichier, pas une saisie. */
                      dangerouslySetInnerHTML={{ __html: OUVERTURE + c.icone + "</svg>" }}
                    />
                  );

                  const corps = (
                    <span className={styles.corps}>
                      <span className={styles.carteTitre}>{c.titre}</span>
                      <span className={styles.carteDesc}>{c.description}</span>
                    </span>
                  );

                  // La page d'origine posait un href="#" sur les deux parcours non
                  // ouverts : la carte renvoyait en haut de page. Ici elle le dit.
                  if (c.bientot) {
                    return (
                      <span key={c.titre} className={styles.carteBientot} aria-disabled="true">
                        {dessin}
                        {corps}
                        <span className={styles.bientot}>Bientôt</span>
                      </span>
                    );
                  }

                  return (
                    <Link
                      key={c.titre}
                      href={c.lien}
                      className={styles.carte}
                      onClick={() => setOuverte(false)}
                    >
                      {dessin}
                      {corps}
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
