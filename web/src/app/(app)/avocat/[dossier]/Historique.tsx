"use client";

import { useState } from "react";
import styles from "../Avocat.module.css";

export interface EntreeDuJournal {
  id: number;
  auteur: string;
  libelle: string;
  champ: string | null;
  avant: string | null;
  apres: string | null;
  commentaire: string | null;
  quand: string;
  teinte: string;
}

/**
 * Le journal du dossier, dans une fenêtre.
 *
 * Il occupait le bas du récapitulatif, déroulé, quel que soit son âge : quarante lignes
 * d'interventions sous une fiche qu'on ouvre pour relire une adresse. On le consulte
 * rarement - pour instruire un litige, ou retrouver qui a fait quoi - et jamais en même
 * temps qu'autre chose.
 */
export function Historique({ entrees }: { entrees: EntreeDuJournal[] }) {
  const [ouverte, setOuverte] = useState(false);

  return (
    <>
      <button
        type="button"
        className={styles.decisionSecondaire}
        onClick={() => setOuverte(true)}
      >
        Historique
        {entrees.length > 0 && (
          <span className={styles.historiqueCompte}>{entrees.length}</span>
        )}
      </button>

      {ouverte && (
        <>
          <div
            className={styles.voile}
            onClick={() => setOuverte(false)}
            aria-hidden="true"
          />

          <div
            className={styles.correction}
            role="dialog"
            aria-modal="true"
            aria-label="Historique du dossier"
          >
            <div className={styles.correctionTete}>
              <div>
                <h3 className={styles.correctionTitre}>Historique du dossier</h3>
                <p className={styles.correctionDetail}>
                  Chaque intervention du cabinet et du client, dans l&apos;ordre où elles
                  ont eu lieu. C&apos;est cette trace qui permet d&apos;instruire un
                  litige.
                </p>
              </div>

              <button
                type="button"
                className={styles.panneauFermer}
                onClick={() => setOuverte(false)}
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
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className={styles.historiqueCorps}>
              {entrees.length === 0 ? (
                <p className={styles.correctionDetail}>Aucune intervention enregistrée.</p>
              ) : (
                <div className={styles.auditTimeline}>
                  {entrees.map((entree) => (
                    <div key={entree.id} className={styles.auditItem}>
                      <span className={`${styles.auditIcon} ${styles[entree.teinte]}`}>
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <circle cx="12" cy="12" r="10" />
                          <polyline points="12 6 12 12 16 14" />
                        </svg>
                      </span>

                      <div className={styles.auditBody}>
                        <div className={styles.auditLabel}>
                          <em>{entree.auteur}</em> · {entree.libelle}
                          {entree.champ ? " · " + entree.champ : ""}
                        </div>

                        {(entree.avant || entree.apres) && (
                          <div className={styles.auditDiff}>
                            {entree.avant && (
                              <span className={styles.auditBefore}>{entree.avant}</span>
                            )}
                            {entree.avant && entree.apres && <span>&nbsp;→&nbsp;</span>}
                            {entree.apres && (
                              <span className={styles.auditAfter}>{entree.apres}</span>
                            )}
                          </div>
                        )}

                        {entree.commentaire && (
                          <div className={styles.auditComment}>{entree.commentaire}</div>
                        )}
                        <div className={styles.auditDate}>{entree.quand}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
