"use client";

import { useEffect, useId, useRef, useState } from "react";
import styles from "./ChampChoix.module.css";

/**
 * Une liste de choix, et son menu.
 *
 * `<select>` ouvre un menu que le système dessine et que rien ne peut habiller : gris
 * ardoise et surlignage bleu sur macOS, blanc et bleu sur Windows, autre chose encore
 * sur Linux. Au milieu d'un formulaire soigné, il détonne - et l'on ne peut pas y faire
 * grand-chose en CSS, ni un peu, ni du tout. C'est le même constat que pour le
 * calendrier natif, remplacé pour la même raison : voir ChampDate.
 *
 * Celui-ci est donc écrit. Ce qui se perd du champ natif se réécrit, faute de quoi le
 * remplacement serait un recul :
 *
 * - le clavier ouvre, parcourt, choisit et referme, y compris par la première lettre ;
 * - la liste est annoncée aux lecteurs d'écran comme une liste de choix, avec l'option
 *   retenue ;
 * - un clic dehors ou la touche d'échappement referment sans rien changer.
 */

interface Props {
  id: string;
  valeur: string;
  options: readonly string[];
  surChangement: (valeur: string) => void;
  /** Ce qu'on lit tant que rien n'est choisi. */
  invite?: string;
  className?: string;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
  disabled?: boolean;
}

export function ChampChoix({
  id,
  valeur,
  options,
  surChangement,
  invite = "Choisir",
  className,
  disabled,
  ...reste
}: Props) {
  const [ouvert, setOuvert] = useState(false);
  /* Le choix survolé au clavier, distinct du choix retenu tant qu'on n'a pas validé. */
  const [vise, setVise] = useState(-1);
  const cadre = useRef<HTMLDivElement>(null);
  const liste = useRef<HTMLDivElement>(null);
  const listeId = useId();

  /* Un clic dehors referme : un menu ouvert masque la suite du formulaire. */
  useEffect(() => {
    if (!ouvert) return;

    function dehors(e: MouseEvent) {
      if (cadre.current && !cadre.current.contains(e.target as Node)) setOuvert(false);
    }
    document.addEventListener("mousedown", dehors);
    return () => document.removeEventListener("mousedown", dehors);
  }, [ouvert]);

  /*
   * Le choix visé reste sous les yeux.
   *
   * Une liste de dix natures de convention dépasse la hauteur du menu : parcourue au
   * clavier, elle défilait sous le cadre et l'on pilotait à l'aveugle.
   */
  useEffect(() => {
    if (!ouvert || vise < 0) return;
    liste.current?.children[vise]?.scrollIntoView({ block: "nearest" });
  }, [ouvert, vise]);

  function ouvrir() {
    if (disabled) return;
    /*
     * À l'ouverture, le choix retenu est visé - ou le premier, si rien ne l'est.
     *
     * Sans ce repli, la flèche du bas ouvrait le menu sans rien viser : il fallait une
     * seconde flèche pour atteindre la première option, là où un champ natif l'atteint
     * du premier coup.
     */
    setVise(Math.max(0, options.indexOf(valeur)));
    setOuvert(true);
  }

  function retenir(choix: string) {
    surChangement(choix);
    setOuvert(false);
  }

  function auClavier(e: React.KeyboardEvent) {
    if (disabled) return;

    if (!ouvert) {
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(e.key)) {
        e.preventDefault();
        ouvrir();
      }
      return;
    }

    if (e.key === "Escape" || e.key === "Tab") {
      setOuvert(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setVise((v) => Math.min(options.length - 1, v + 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setVise((v) => Math.max(0, v - 1));
      return;
    }
    if (e.key === "Home") {
      e.preventDefault();
      setVise(0);
      return;
    }
    if (e.key === "End") {
      e.preventDefault();
      setVise(options.length - 1);
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (vise >= 0) retenir(options[vise]);
      return;
    }

    /*
     * La première lettre saute au bon endroit, comme dans un menu natif : dans dix
     * natures de convention, « c » vaut mieux que six flèches.
     */
    if (e.key.length === 1 && /\S/.test(e.key)) {
      const lettre = e.key.toLowerCase();
      const depuis = vise + 1;
      const ordre = [...options.slice(depuis), ...options.slice(0, depuis)];
      const trouve = ordre.find((o) => o.toLowerCase().startsWith(lettre));
      if (trouve) setVise(options.indexOf(trouve));
    }
  }

  return (
    <div className={styles.cadre} ref={cadre}>
      <button
        type="button"
        id={id}
        className={[styles.bouton, className, valeur ? "" : styles.boutonVide]
          .filter(Boolean)
          .join(" ")}
        onClick={() => (ouvert ? setOuvert(false) : ouvrir())}
        onKeyDown={auClavier}
        disabled={disabled}
        {...{
          /*
           * Le rôle d'une liste de choix, non celui d'un bouton.
           *
           * `role="button"` - implicite sur un `<button>` - n'admet pas `aria-invalid` :
           * un champ en défaut ne pouvait pas se signaler aux lecteurs d'écran. Le rôle
           * `combobox` est celui que la norme prévoit pour ce composant, et il l'admet.
           */
          role: "combobox",
        }}
        aria-haspopup="listbox"
        aria-expanded={ouvert}
        aria-controls={ouvert ? listeId : undefined}
        aria-label={reste["aria-label"]}
        aria-invalid={reste["aria-invalid"]}
      >
        <span className={styles.libelle}>{valeur || invite}</span>
        <svg viewBox="0 0 24 24" className={styles.chevron} aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {ouvert && (
        <div
          className={styles.menu}
          id={listeId}
          role="listbox"
          aria-label={reste["aria-label"]}
          ref={liste}
          tabIndex={-1}
        >
          {options.map((option, rang) => (
            <button
              key={option}
              type="button"
              role="option"
              aria-selected={option === valeur}
              className={[
                styles.option,
                rang === vise ? styles.optionVisee : "",
                option === valeur ? styles.optionRetenue : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onMouseEnter={() => setVise(rang)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => retenir(option)}
            >
              <span>{option}</span>
              {option === valeur && (
                <svg viewBox="0 0 24 24" className={styles.marque} aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
