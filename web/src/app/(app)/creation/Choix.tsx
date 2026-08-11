"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./Parcours.module.css";

/**
 * Le menu déroulant du parcours.
 *
 * Portage du contrôle .cselect de public/css/creation.css : un déclencheur portant
 * son chevron, et une liste à ombre portée où l'option retenue est en gras sur
 * fond gris. L'original masquait le <select> du navigateur (display: none) pour
 * cette raison - un menu natif impose ses couleurs et sa police, et ne se laisse
 * pas habiller.
 *
 * La liste ouverte doit passer au-dessus de ses voisins : c'est le rôle des
 * paliers de z-index sur le champ et la grille, repris tels quels.
 */

export interface Option {
  valeur: string;
  libelle: string;
}

interface Props {
  id: string;
  valeur: string;
  options: Option[];
  surChangement: (valeur: string) => void;
  /** Le texte du déclencheur tant que rien n'est retenu. */
  placeholder?: string;
}

export function Choix({ id, valeur, options, surChangement, placeholder = "Choisir..." }: Props) {
  const [ouvert, setOuvert] = useState(false);
  const [survole, setSurvole] = useState(-1);
  const bloc = useRef<HTMLDivElement>(null);

  const retenue = options.find((o) => o.valeur === valeur);

  useEffect(() => {
    if (!ouvert) return;

    function ailleurs(e: MouseEvent) {
      if (bloc.current && !bloc.current.contains(e.target as Node)) setOuvert(false);
    }
    document.addEventListener("mousedown", ailleurs);
    return () => document.removeEventListener("mousedown", ailleurs);
  }, [ouvert]);

  function retenir(option: Option) {
    surChangement(option.valeur);
    setOuvert(false);
  }

  return (
    <div className={ouvert ? `${styles.cselect} ${styles.cselectOuvert}` : styles.cselect} ref={bloc}>
      <button
        type="button"
        id={id}
        className={
          retenue ? styles.cselectTrigger : `${styles.cselectTrigger} ${styles.cselectVide}`
        }
        aria-haspopup="listbox"
        aria-expanded={ouvert}
        aria-controls={id + "-options"}
        onClick={() => {
          setOuvert((o) => !o);
          setSurvole(options.findIndex((o) => o.valeur === valeur));
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOuvert(false);
            return;
          }
          if (!ouvert) {
            // Les flèches ouvrent la liste, comme sur un menu natif.
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setOuvert(true);
              setSurvole(options.findIndex((o) => o.valeur === valeur));
            }
            return;
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setSurvole((r) => (r + 1) % options.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setSurvole((r) => (r <= 0 ? options.length - 1 : r - 1));
          } else if (e.key === "Enter" && survole >= 0) {
            e.preventDefault();
            retenir(options[survole]);
          }
        }}
      >
        {retenue?.libelle ?? placeholder}
      </button>

      {ouvert && (
        <ul className={styles.cselectOpts} id={id + "-options"} role="listbox">
          {options.map((o, i) => {
            const active = o.valeur === valeur;

            return (
              <li key={o.valeur} role="option" aria-selected={active}>
                <button
                  type="button"
                  className={[
                    styles.cselectOpt,
                    active ? styles.cselectOptRetenue : "",
                    i === survole ? styles.cselectOptSurvolee : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  /* mousedown et non click : le blur du déclencheur fermerait la
                     liste avant que le clic n'aboutisse. */
                  onMouseDown={(e) => {
                    e.preventDefault();
                    retenir(o);
                  }}
                  onMouseEnter={() => setSurvole(i)}
                >
                  {o.libelle}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
