"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./ChampDate.module.css";

/**
 * Un champ de date, et son calendrier.
 *
 * Le champ natif du navigateur ouvre un calendrier que rien ne peut habiller : bleu
 * système, « Effacer / Aujourd'hui » dans une autre langue selon la machine, une
 * apparence différente sur Chrome, Safari et Firefox. Au milieu d'un formulaire soigné,
 * il détonne - et l'on ne peut pas y faire grand-chose en CSS, ni un peu, ni du tout.
 *
 * Celui-ci est donc écrit. La saisie reste au clavier, en jj/mm/aaaa, parce que taper
 * une date connue est toujours plus rapide que de la chercher dans une grille ; le
 * calendrier est là pour celles qu'on ne connaît pas - « le deuxième mardi du mois ».
 *
 * La valeur échangée est toujours ISO (aaaa-mm-jj) : c'est ce que la base et les actes
 * attendent, et une conversion au bord évite de la refaire partout.
 */

const JOURS = ["L", "M", "M", "J", "V", "S", "D"];
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

/** « 2026-09-15 » devient « 15/09/2026 ». */
function enFrancais(iso: string): string {
  const [a, m, j] = iso.split("-");
  return a && m && j ? j + "/" + m + "/" + a : "";
}

/**
 * « 15/09/2026 » devient « 2026-09-15 », ou rien si la date n'existe pas.
 *
 * Le 31 février se refuse ici plutôt que d'être enregistré et rejeté au greffe.
 */
function enIso(saisi: string): string | null {
  const chiffres = saisi.replace(/[^0-9]/g, "");
  if (chiffres.length !== 8) return null;

  const jour = Number(chiffres.slice(0, 2));
  const mois = Number(chiffres.slice(2, 4));
  const annee = Number(chiffres.slice(4, 8));
  if (mois < 1 || mois > 12 || jour < 1) return null;

  const date = new Date(Date.UTC(annee, mois - 1, jour));
  if (date.getUTCMonth() !== mois - 1 || date.getUTCDate() !== jour) return null;

  return (
    annee.toString().padStart(4, "0") +
    "-" +
    mois.toString().padStart(2, "0") +
    "-" +
    jour.toString().padStart(2, "0")
  );
}

/** Le masque appliqué à la frappe : on ne pose les barres qu'une fois le champ atteint. */
function masquer(saisi: string): string {
  const chiffres = saisi.replace(/[^0-9]/g, "").slice(0, 8);
  const morceaux = [chiffres.slice(0, 2), chiffres.slice(2, 4), chiffres.slice(4, 8)];
  return morceaux.filter((m) => m.length > 0).join("/");
}

/** Le lundi de la semaine où tombe le premier du mois : la grille commence là. */
function debutDeGrille(annee: number, mois: number): Date {
  const premier = new Date(Date.UTC(annee, mois, 1));
  // getUTCDay rend 0 pour dimanche : on ramène la semaine au lundi.
  const decalage = (premier.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(annee, mois, 1 - decalage));
}

function isoDe(date: Date): string {
  return date.toISOString().slice(0, 10);
}

interface Props {
  id: string;
  valeur: string;
  surChangement: (iso: string) => void;
  "aria-label"?: string;
}

export function ChampDate({ id, valeur, surChangement, ...reste }: Props) {
  /*
   * Ce qu'on tape, et ce qui est retenu.
   *
   * Le champ affiche la frappe en cours - « 15/0 » n'est pas une date - et retombe sur
   * la valeur retenue dès qu'elle change ailleurs : une recherche au registre ou un
   * retour du serveur doit s'y voir. La comparaison se fait sur la valeur d'origine
   * plutôt que par un effet qui recopierait l'état à chaque rendu.
   */
  const [frappe, setFrappe] = useState<{ pour: string; texte: string } | null>(null);
  const saisi = frappe?.pour === valeur ? frappe.texte : enFrancais(valeur);
  const setSaisi = (texte: string) => setFrappe({ pour: valeur, texte });

  const [ouvert, setOuvert] = useState(false);
  const cadre = useRef<HTMLDivElement>(null);

  /* Un clic dehors referme : un calendrier ouvert masque la suite du formulaire. */
  useEffect(() => {
    if (!ouvert) return;

    function dehors(e: MouseEvent) {
      if (cadre.current && !cadre.current.contains(e.target as Node)) setOuvert(false);
    }
    document.addEventListener("mousedown", dehors);
    return () => document.removeEventListener("mousedown", dehors);
  }, [ouvert]);

  /*
   * Le mois montré.
   *
   * Il suit la date retenue tant qu'on n'a pas feuilleté : le calendrier s'ouvre sur le
   * mois de la date choisie, non sur le mois courant, et un mois qu'on est allé chercher
   * ne se referme pas sous les doigts.
   */
  const [feuillete, setFeuillete] = useState<{ annee: number; mois: number } | null>(null);
  const ancre = valeur ? new Date(valeur + "T00:00:00Z") : new Date();
  const visible = feuillete ?? { annee: ancre.getUTCFullYear(), mois: ancre.getUTCMonth() };

  function glisser(pas: number) {
    const d = new Date(Date.UTC(visible.annee, visible.mois + pas, 1));
    setFeuillete({ annee: d.getUTCFullYear(), mois: d.getUTCMonth() });
  }

  const debut = debutDeGrille(visible.annee, visible.mois);
  const jours = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(debut);
    d.setUTCDate(debut.getUTCDate() + i);
    return d;
  });
  const aujourdhui = isoDe(new Date());

  return (
    <div className={styles.cadre} ref={cadre}>
      <input
        id={id}
        className={styles.saisie}
        value={saisi}
        inputMode="numeric"
        placeholder="jj/mm/aaaa"
        autoComplete="off"
        aria-label={reste["aria-label"]}
        onChange={(e) => {
          /*
           * Une date collée en ISO est prise telle quelle.
           *
           * On copie souvent « 2026-09-15 » depuis un courriel ou un acte ; passée au
           * masque, elle devenait « 20/26/0915 » et il fallait tout retaper.
           */
          if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value.trim())) {
            const colle = e.target.value.trim();
            setSaisi(enFrancais(colle));
            surChangement(colle);
            return;
          }

          const masque = masquer(e.target.value);
          setSaisi(masque);

          /*
           * On ne remonte qu'une date entière et réelle.
           *
           * Remonter à chaque frappe enregistrerait « 0002-09-15 » le temps de taper
           * l'année, et une date effacée doit pouvoir l'être.
           */
          const iso = enIso(masque);
          if (iso) surChangement(iso);
          else if (masque === "") surChangement("");
        }}
        onBlur={() => {
          // Une saisie incomplète se remet dans l'état retenu, plutôt que de rester à moitié.
          if (!enIso(saisi)) setSaisi(enFrancais(valeur));
        }}
      />

      <button
        type="button"
        className={styles.appel}
        aria-label="Ouvrir le calendrier"
        aria-expanded={ouvert}
        onClick={() => {
          // On repart du mois de la date retenue : le feuilletage précédent est oublié.
          setFeuillete(null);
          setOuvert((o) => !o);
        }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
      </button>

      {ouvert && (
        <div className={styles.calendrier} role="dialog" aria-label="Choisir une date">
          <div className={styles.tete}>
            <button
              type="button"
              className={styles.fleche}
              aria-label="Mois précédent"
              onClick={() => glisser(-1)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M15 5 L8 12 L15 19" />
              </svg>
            </button>

            <span className={styles.mois}>
              {MOIS[visible.mois]} {visible.annee}
            </span>

            <button
              type="button"
              className={styles.fleche}
              aria-label="Mois suivant"
              onClick={() => glisser(1)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M9 5 L16 12 L9 19" />
              </svg>
            </button>
          </div>

          <div className={styles.semaine} aria-hidden="true">
            {JOURS.map((jour, i) => (
              <span key={i}>{jour}</span>
            ))}
          </div>

          <div className={styles.grille}>
            {jours.map((jour) => {
              const iso = isoDe(jour);
              const horsMois = jour.getUTCMonth() !== visible.mois;
              const classes = [styles.jour];
              if (horsMois) classes.push(styles.jourVoisin);
              if (iso === valeur) classes.push(styles.jourChoisi);
              else if (iso === aujourdhui) classes.push(styles.jourAujourdhui);

              return (
                <button
                  key={iso}
                  type="button"
                  className={classes.join(" ")}
                  onClick={() => {
                    surChangement(iso);
                    setSaisi(enFrancais(iso));
                    setOuvert(false);
                  }}
                >
                  {jour.getUTCDate()}
                </button>
              );
            })}
          </div>

          <div className={styles.pied}>
            <button
              type="button"
              className={styles.lien}
              onClick={() => {
                surChangement("");
                setSaisi("");
                setOuvert(false);
              }}
            >
              Effacer
            </button>
            <button
              type="button"
              className={styles.lien}
              onClick={() => {
                surChangement(aujourdhui);
                setSaisi(enFrancais(aujourdhui));
                setOuvert(false);
              }}
            >
              Aujourd&apos;hui
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
