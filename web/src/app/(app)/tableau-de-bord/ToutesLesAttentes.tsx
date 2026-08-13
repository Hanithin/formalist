"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { accorder } from "@/domain/formalite/etapes";
import type { ActionDeDossier } from "@/domain/formalite/actions";
import styles from "./TableauDeBord.module.css";

/**
 * La fenêtre « Tout ce qu'on attend de vous ».
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
              aria-label="Tout ce qu'on attend de vous"
            >
              <div className={styles.smHead}>
                <div>
                  <h3 className={styles.smTitle}>Tout ce qu&apos;on attend de vous</h3>
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

              {/* Les mêmes lignes que dans la carte : on ne réapprend pas à les lire. */}
              <div className={styles.smList}>
                <div className={styles.todoList}>
                  {actions.map((a, i) => (
                    <Link
                      key={a.dossierId + "-" + i}
                      href={a.lien}
                      className={a.urgent ? `${styles.todo} ${styles.urgent}` : styles.todo}
                      onClick={() => setOuverte(false)}
                    >
                      <span className={styles.todoDot} />
                      <span className={styles.todoBody}>
                        <span className={styles.todoTitle}>{a.titre}</span>
                        <span className={styles.todoDesc}>
                          {plusieurs ? (
                            <>
                              <strong>{a.societe}</strong> · {a.precision}
                            </>
                          ) : (
                            a.precision
                          )}
                        </span>
                      </span>
                      <span className={styles.todoCta}>{a.bouton}</span>
                    </Link>
                  ))}
                </div>
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
