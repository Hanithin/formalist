"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { accorder } from "@/domain/formalite/etapes";
import type { ActionDeDossier } from "@/domain/formalite/actions";
import styles from "./TableauDeBord.module.css";

/**
 * La fenêtre « Ce qui requiert votre attention ».
 *
 * L'accueil n'en montre que cinq : au-delà, la carte devenait une liste à faire
 * défiler, et l'activité récente disparaissait sous elle. Cette fenêtre les reprend
 * toutes, dans le même ordre - les bloquantes d'abord.
 *
 * Elle suit la fenêtre « Toutes vos sociétés », dont elle reprend l'habillage : deux
 * fenêtres de la même page qui ne se ressembleraient pas se remarqueraient.
 */
export function ToutesLesAttentes({
  actions,
  plusieurs,
}: {
  actions: ActionDeDossier[];
  plusieurs: boolean;
}) {
  const [ouverte, setOuverte] = useState(false);

  useEffect(() => {
    if (!ouverte) return;

    // Le fond de page ne défile pas sous la fenêtre.
    const defilement = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const auClavier = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOuverte(false);
    };
    document.addEventListener("keydown", auClavier);

    return () => {
      document.body.style.overflow = defilement;
      document.removeEventListener("keydown", auClavier);
    };
  }, [ouverte]);

  return (
    <>
      <button type="button" className={styles.socSeeAll} onClick={() => setOuverte(true)}>
        Voir tout
        <span className={styles.socSeeAllCount}>{actions.length}</span>
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
      </button>

      {ouverte &&
        createPortal(
          <div
            className={`${styles.smBackdrop} ${styles.open}`}
            onClick={(e) => {
              if (e.target === e.currentTarget) setOuverte(false);
            }}
          >
            <div
              className={styles.smModal}
              role="dialog"
              aria-modal="true"
              aria-label="Ce qui requiert votre attention"
            >
              <div className={styles.smHead}>
                <div>
                  <h3 className={styles.smTitle}>Ce qui requiert votre attention</h3>
                  <p className={styles.smSub}>
                    {accorder(actions.length, "action à traiter", "actions à traiter")}, les
                    bloquantes d&apos;abord
                  </p>
                </div>
                <button
                  type="button"
                  className={styles.smClose}
                  onClick={() => setOuverte(false)}
                  aria-label="Fermer"
                  autoFocus
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

              {/*
                Les mêmes rangées que sur l'accueil, à la classe près.
                Elles en avaient d'autres, qui laissaient la description passer sur deux
                lignes : les rangées n'avaient plus la même hauteur, et les boutons -
                centrés verticalement - se décalaient les uns par rapport aux autres.
              */}
              <div className={styles.smList}>
                <ul className={styles.attentions}>
                  {actions.map((a, i) => (
                    <li key={a.dossierId + "-" + i}>
                      <Link
                        href={a.lien}
                        className={
                          a.urgent ? `${styles.attention} ${styles.urgente}` : styles.attention
                        }
                        onClick={() => setOuverte(false)}
                      >
                        <span className={styles.attentionPastille} aria-hidden="true" />
                        <span className={styles.attentionCorps}>
                          <span className={styles.attentionTitre}>{a.titre}</span>
                          <span className={styles.attentionDetail}>
                            {plusieurs ? (
                              <>
                                <strong>{a.societe}</strong> · {a.precision}
                              </>
                            ) : (
                              a.precision
                            )}
                          </span>
                        </span>
                        {/* Le geste se lit, il ne se boutonne pas : voir Sections.tsx. */}
                        <span className={styles.attentionGeste}>
                          {a.bouton}
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <polyline points="9 18 15 12 9 6" />
                          </svg>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>

              <div className={styles.smFoot}>
                <Link href="/formalites" className={styles.smFootLink}>
                  Ouvrir la page Mes formalités →
                </Link>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
