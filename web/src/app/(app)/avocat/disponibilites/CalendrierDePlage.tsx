"use client";

import { useState } from "react";
import {
  grilleDuMois,
  nomDuMois,
  choisir,
  dansLaPeriode,
  dejaBloque,
  resumeDePeriode,
  enJour,
  periodeDuRaccourci,
  periodeDuMois,
  RACCOURCIS_ABSENCE,
  type Periode,
} from "@/domain/consultation/absences";
import styles from "./Disponibilites.module.css";

const JOURS_COURTS = ["L", "M", "M", "J", "V", "S", "D"];

/**
 * Le choix d'une période, sur un calendrier.
 *
 * Il remplace deux champs de date natifs. Ceux-ci ouvraient chacun le calendrier du
 * navigateur, par-dessus la fenêtre et hors de son cadre, sans jamais montrer la
 * période obtenue : on choisissait deux dates sans voir ce qu'elles délimitaient, et
 * dire « je pars une semaine » demandait d'ouvrir deux fois un calendrier et de
 * compter les jours de tête.
 *
 * Les absences déjà posées sont barrées et ne se resélectionnent pas : sans cela, on
 * repose la même semaine sans s'en apercevoir, et la liste devient illisible.
 */
export function CalendrierDePlage({
  periode,
  onChange,
  absences,
  aujourdHui,
}: {
  periode: Periode | null;
  onChange: (periode: Periode) => void;
  absences: Periode[];
  aujourdHui: string;
}) {
  const depart = periode ? new Date(periode.debut + "T12:00:00") : new Date();
  const [annee, setAnnee] = useState(depart.getFullYear());
  const [mois, setMois] = useState(depart.getMonth());

  /*
   * Une période complète est figée : le clic suivant en recommence une, au lieu
   * d'étendre celle qu'on vient de terminer sans l'avoir demandé.
   */
  const [fige, setFige] = useState(periode !== null);

  const grille = grilleDuMois(annee, mois);

  function deplacer(pas: number) {
    const d = new Date(annee, mois + pas, 1, 12);
    setAnnee(d.getFullYear());
    setMois(d.getMonth());
  }

  function cliquer(jour: string) {
    /*
     * Trois situations, une seule règle : on recommence une période s'il n'y en a
     * pas, ou si la précédente est terminée ; sinon on la ferme. Après un
     * recommencement la période reste ouverte, après une fermeture elle est figée.
     */
    const recommence = periode === null || fige;
    onChange(choisir(periode, jour, fige));
    setFige(!recommence);
  }

  function appliquer(nouvelle: Periode) {
    setFige(true);
    onChange(nouvelle);
    const d = new Date(nouvelle.debut + "T12:00:00");
    setAnnee(d.getFullYear());
    setMois(d.getMonth());
  }

  return (
    <div>
      <div className={styles.calendrierTete}>
        <button
          type="button"
          className={styles.calendrierFleche}
          onClick={() => deplacer(-1)}
          aria-label="Mois précédent"
        >
          ‹
        </button>
        <span className={styles.calendrierMois}>{nomDuMois(annee, mois)}</span>
        <button
          type="button"
          className={styles.calendrierFleche}
          onClick={() => deplacer(1)}
          aria-label="Mois suivant"
        >
          ›
        </button>
      </div>

      <div className={styles.calendrierJours} aria-hidden="true">
        {JOURS_COURTS.map((j, i) => (
          <span key={i}>{j}</span>
        ))}
      </div>

      <div className={styles.calendrierGrille} role="grid">
        {grille.map((c) => {
          const bloque = dejaBloque(c.jour, absences);
          const choisi = dansLaPeriode(c.jour, periode);
          const passe = c.jour < aujourdHui;

          return (
            <button
              type="button"
              key={c.jour}
              role="gridcell"
              className={
                styles.calendrierCase +
                (c.duMois ? "" : " " + styles.horsMois) +
                (choisi ? " " + styles.caseChoisie : "") +
                (periode && c.jour === periode.debut ? " " + styles.caseDebut : "") +
                (periode && c.jour === periode.fin ? " " + styles.caseFin : "") +
                (bloque ? " " + styles.caseBloquee : "") +
                (c.jour === aujourdHui ? " " + styles.caseAujourdHui : "")
              }
              disabled={bloque || passe}
              aria-selected={choisi}
              aria-label={c.jour + (bloque ? " (déjà bloqué)" : "")}
              onClick={() => cliquer(c.jour)}
            >
              {c.quantieme}
            </button>
          );
        })}
      </div>

      <div className={styles.raccourcis}>
        {RACCOURCIS_ABSENCE.map((r) => (
          <button
            type="button"
            key={r.cle}
            className={styles.raccourci}
            onClick={() =>
              appliquer(periodeDuRaccourci(r.jours, periode?.debut ?? null, aujourdHui))
            }
          >
            {r.libelle}
          </button>
        ))}
        <button
          type="button"
          className={styles.raccourci}
          onClick={() => appliquer(periodeDuMois(annee, mois))}
        >
          Tout le mois
        </button>
      </div>

      <p className={styles.resume}>
        {periode ? (
          resumeDePeriode(periode)
        ) : (
          <span className={styles.resumeVide}>
            Cliquez sur un jour, puis sur un autre pour fermer la période.
          </span>
        )}
      </p>
    </div>
  );
}

/** Le jour d'aujourd'hui, écrit comme le domaine l'attend. */
export function aujourdHui(): string {
  return enJour(new Date());
}
