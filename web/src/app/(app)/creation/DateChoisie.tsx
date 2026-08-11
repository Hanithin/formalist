"use client";

import { useEffect, useRef, useState } from "react";
import { dateEnFrancais } from "@/domain/formalite/lettres";
import styles from "./Parcours.module.css";

/**
 * Le sélecteur de date du parcours.
 *
 * Portage du contrôle .cdp de public/css/creation.css : un déclencheur portant
 * l'icône de calendrier, et un calendrier de 300 pixels - en-tête à deux flèches,
 * grille de sept colonnes, jours des mois voisins en gris clair, aujourd'hui en
 * gras, sélection en pastille noire.
 *
 * Le contrôle natif du navigateur était utilisé jusqu'ici : il impose ses propres
 * couleurs - le bleu de Chrome - et son propre vocabulaire, au milieu d'un
 * formulaire en noir et blanc. C'est ce que l'original évitait en le masquant.
 *
 * La date circule au format ISO, comme partout ailleurs dans le brouillon, et ne
 * s'affiche en français qu'ici.
 */

const MOIS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

/** Lundi en premier : c'est l'ordre du calendrier français. */
const JOURS = ["L", "M", "M", "J", "V", "S", "D"];

function enIso(annee: number, mois: number, jour: number): string {
  return (
    annee +
    "-" +
    String(mois + 1).padStart(2, "0") +
    "-" +
    String(jour).padStart(2, "0")
  );
}

/** Le rang du lundi qui ouvre la grille : dimanche vaut 6 et non 0. */
function decalage(annee: number, mois: number): number {
  const premier = new Date(annee, mois, 1).getDay();
  return (premier + 6) % 7;
}

function joursDuMois(annee: number, mois: number): number {
  return new Date(annee, mois + 1, 0).getDate();
}

interface Props {
  id: string;
  /** La date retenue, au format ISO. Vide quand rien n'est choisi. */
  valeur: string;
  surChangement: (iso: string) => void;
  placeholder?: string;
}

export function DateChoisie({ id, valeur, surChangement, placeholder = "Choisir une date" }: Props) {
  const [ouvert, setOuvert] = useState(false);
  const bloc = useRef<HTMLDivElement>(null);

  // Le mois affiché part de la date retenue, ou du mois courant.
  const retenue = valeur ? new Date(valeur + "T00:00:00") : null;
  const valide = retenue && !Number.isNaN(retenue.getTime()) ? retenue : null;
  const [curseur, setCurseur] = useState(() => {
    const depart = valide ?? new Date();
    return { annee: depart.getFullYear(), mois: depart.getMonth() };
  });

  // Le clic à côté ferme le calendrier, comme Échap. Sans cela il resterait
  // ouvert au-dessus des champs suivants.
  useEffect(() => {
    if (!ouvert) return;

    function ailleurs(e: MouseEvent) {
      if (bloc.current && !bloc.current.contains(e.target as Node)) setOuvert(false);
    }
    function auClavier(e: KeyboardEvent) {
      if (e.key === "Escape") setOuvert(false);
    }

    document.addEventListener("mousedown", ailleurs);
    document.addEventListener("keydown", auClavier);
    return () => {
      document.removeEventListener("mousedown", ailleurs);
      document.removeEventListener("keydown", auClavier);
    };
  }, [ouvert]);

  const aujourdhui = new Date();
  const isoAujourdhui = enIso(
    aujourdhui.getFullYear(),
    aujourdhui.getMonth(),
    aujourdhui.getDate()
  );

  const debut = decalage(curseur.annee, curseur.mois);
  const nombre = joursDuMois(curseur.annee, curseur.mois);
  const avant = joursDuMois(
    curseur.mois === 0 ? curseur.annee - 1 : curseur.annee,
    curseur.mois === 0 ? 11 : curseur.mois - 1
  );

  /** Les 42 cases de la grille : la fin du mois précédent, le mois, puis le début du suivant. */
  const cases: { jour: number; iso: string | null }[] = [];
  for (let i = debut - 1; i >= 0; i--) {
    cases.push({ jour: avant - i, iso: null });
  }
  for (let j = 1; j <= nombre; j++) {
    cases.push({ jour: j, iso: enIso(curseur.annee, curseur.mois, j) });
  }
  while (cases.length % 7 !== 0) {
    cases.push({ jour: cases.length - debut - nombre + 1, iso: null });
  }

  function glisser(pas: number) {
    setCurseur((c) => {
      const mois = c.mois + pas;
      if (mois < 0) return { annee: c.annee - 1, mois: 11 };
      if (mois > 11) return { annee: c.annee + 1, mois: 0 };
      return { annee: c.annee, mois };
    });
  }

  return (
    <div className={ouvert ? `${styles.cdp} ${styles.cdpOuvert}` : styles.cdp} ref={bloc}>
      <button
        type="button"
        id={id}
        className={valeur ? styles.cdpTrigger : `${styles.cdpTrigger} ${styles.cdpVide}`}
        aria-haspopup="dialog"
        aria-expanded={ouvert}
        onClick={() => setOuvert((o) => !o)}
      >
        {valeur ? dateEnFrancais(valeur) : placeholder}
      </button>

      {ouvert && (
        <div className={styles.cdpCal} role="dialog" aria-label="Choisir une date">
          <div className={styles.cdpHeader}>
            <span>
              {MOIS[curseur.mois]} {curseur.annee}
            </span>

            <span className={styles.cdpNavs}>
              <button
                type="button"
                className={styles.cdpNav}
                aria-label="Mois précédent"
                onClick={() => glisser(-1)}
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
              <button
                type="button"
                className={styles.cdpNav}
                aria-label="Mois suivant"
                onClick={() => glisser(1)}
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
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </span>
          </div>

          <div className={styles.cdpGrid}>
            {JOURS.map((jour, i) => (
              <span key={i} className={styles.cdpDow}>
                {jour}
              </span>
            ))}

            {cases.map((c, i) => {
              // Un jour d'un mois voisin s'affiche, en gris, et ne se choisit pas :
              // cliquer dessus ferait sauter le mois sous le doigt.
              if (!c.iso) {
                return (
                  <span key={i} className={`${styles.cdpDay} ${styles.cdpAutre}`} aria-hidden="true">
                    {c.jour}
                  </span>
                );
              }

              const ton = [
                styles.cdpDay,
                c.iso === isoAujourdhui ? styles.cdpAujourdhui : "",
                c.iso === valeur ? styles.cdpChoisi : "",
              ]
                .filter(Boolean)
                .join(" ");

              return (
                <button
                  key={i}
                  type="button"
                  className={ton}
                  aria-pressed={c.iso === valeur}
                  onClick={() => {
                    surChangement(c.iso!);
                    setOuvert(false);
                  }}
                >
                  {c.jour}
                </button>
              );
            })}
          </div>

        </div>
      )}
    </div>
  );
}
