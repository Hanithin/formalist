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
 * Le journal du dossier.
 *
 * Il occupait le bas du récapitulatif, déroulé quel que soit son âge : quarante lignes
 * d'interventions sous une fiche qu'on ouvre pour relire une adresse. Puis une fenêtre,
 * ouverte depuis les gestes rapides - où on ne la cherchait pas. Il a son onglet, et se
 * lit comme le reste du dossier.
 */
/** Ce qu'on montre d'abord : au-delà, on fait défiler sans rien y chercher. */
const PAR_PAGE = 12;

export function Historique({ entrees }: { entrees: EntreeDuJournal[] }) {
  const [visibles, setVisibles] = useState(PAR_PAGE);
  const montrees = entrees.slice(0, visibles);
  const restantes = entrees.length - montrees.length;

  return (
    <section className={styles.journal} aria-label="Historique du dossier">

      {entrees.length === 0 ? (
        <p className={styles.journalVide}>Aucune intervention enregistrée.</p>
      ) : (
        <ol className={styles.journalListe}>
          {montrees.map((entree) => (
            <li key={entree.id} className={styles.journalEntree}>
              <span
                className={`${styles.journalPoint} ${styles[entree.teinte]}`}
                aria-hidden="true"
              />

              <div className={styles.journalCorps}>
                <p className={styles.journalLigne}>
                  <span className={styles.journalQuoi}>{entree.libelle}</span>
                  {entree.champ && (
                    <span className={styles.journalChamp}>{entree.champ}</span>
                  )}
                </p>

                {(entree.avant || entree.apres) && (
                  <p className={styles.journalValeurs}>
                    {entree.avant && <span className={styles.auditBefore}>{entree.avant}</span>}
                    {entree.avant && entree.apres && <span>&nbsp;→&nbsp;</span>}
                    {entree.apres && <span className={styles.auditAfter}>{entree.apres}</span>}
                  </p>
                )}

                {entree.commentaire && (
                  <p className={styles.journalCommentaire}>{entree.commentaire}</p>
                )}

                <p className={styles.journalQui}>
                  {entree.auteur} · {entree.quand}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}

      {/*
        Le reste à la demande.
        
        Trente interventions déroulées d'un bloc font trois écrans : on ne les lit pas,
        on les traverse. Les douze dernières suffisent presque toujours.
      */}
      {restantes > 0 && (
        <button
          type="button"
          className={styles.journalSuite}
          onClick={() => setVisibles((montre) => montre + PAR_PAGE)}
        >
          Voir {restantes > PAR_PAGE ? PAR_PAGE : restantes} interventions de plus
          <span className={styles.journalReste}>{restantes} restantes</span>
        </button>
      )}

      {/*
        Une trace qui ne s'efface pas.

        La phrase vivait dans une colonne qui comptait par ailleurs les interventions, la
        première et la dernière - trois nombres que le journal donne ligne par ligne,
        juste à côté.
      */}
      <p className={styles.filFicheNote}>
        Rien ne s&apos;efface ici : c&apos;est cette trace qui permet d&apos;instruire un
        litige, et le client n&apos;y a pas accès.
      </p>
    </section>
  );
}
