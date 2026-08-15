"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import styles from "./NouvelleFormalite.module.css";

/**
 * Le bouton « Créer une formalité » et sa fenêtre.
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

interface Choix {
  lien: string;
  teinte: "green" | "blue" | "violet" | "amber" | "red" | "teal";
  icone: string;
  titre: string;
  description: string;
  /** Parcours annoncé mais pas ouvert : la carte est présente, inerte. */
  bientot?: boolean;
}

const CHOIX: Choix[] = [
  {
    lien: "/creation?type=creation",
    teinte: "green",
    icone: '<path d="M3 21h18M5 21V7l7-4 7 4v14"/>',
    titre: "Créer une société",
    description: "SAS, SARL, SCI, SASU, EURL",
  },
  {
    lien: "/auto-entrepreneur",
    teinte: "blue",
    icone: '<circle cx="12" cy="7" r="4"/><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>',
    titre: "Auto-entrepreneur",
    description: "Création de micro-entreprise",
  },
  {
    lien: "/modification",
    teinte: "violet",
    icone:
      '<path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>' +
      '<path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>',
    titre: "Modifier ma société",
    description: "Transfert, gérant, capital…",
  },
  {
    lien: "/depot-des-comptes",
    teinte: "amber",
    icone:
      '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>' +
      '<line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
    titre: "Dépôt des comptes",
    description: "Comptes annuels au greffe",
    bientot: true,
  },
  {
    lien: "/fermeture",
    teinte: "red",
    icone:
      '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/>' +
      '<line x1="9" y1="9" x2="15" y2="15"/>',
    titre: "Fermer ma société",
    description: "Dissolution, liquidation, radiation",
    bientot: true,
  },
  {
    lien: "/contrats",
    teinte: "teal",
    icone:
      '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>',
    titre: "Rédiger un contrat",
    description: "Modèles sur mesure",
  },
];

/**
 * Le bouton d'ouverture, et la fenêtre qu'il commande.
 *
 * `libelle` et `apparence` existent parce que le même geste s'offre à deux endroits :
 * en tête de colonne, et en haut de la page des formalités - où l'on est venu
 * précisément pour en créer une, et où descendre chercher la colonne est un détour.
 */
export function NouvelleFormalite({
  libelle = "Créer une formalité",
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
                {CHOIX.map((c) => {
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
