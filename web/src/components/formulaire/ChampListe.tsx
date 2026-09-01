"use client";

import { useState } from "react";
import styles from "./Adresse.module.css";

/**
 * Un champ libre qui propose une liste connue.
 *
 * Le pays de naissance et la nationalité se tapaient au clavier et partaient tels quels
 * dans les actes : une faute d'orthographe se dépose au greffe aussi bien que la bonne
 * graphie, et rien dans le parcours ne la relit.
 *
 * Un menu fermé aurait réglé l'orthographe et créé un autre défaut. On naît dans des
 * États qui n'existent plus - l'URSS, la Yougoslavie, la Tchécoslovaquie - et l'acte doit
 * pouvoir le dire. Le champ reste donc un champ de texte : la liste met la bonne
 * orthographe à portée de frappe, elle n'interdit pas le reste.
 *
 * La recherche porte sur tout le libellé, non sur son début : « Congo » trouve les deux
 * républiques, dont les noms d'état civil commencent par « République ».
 */

/** Au-delà, la liste dépasse l'écran sans rien apprendre de plus. */
const MAXIMUM = 8;

export function ChampListe({
  id,
  valeur,
  options,
  surChangement,
  placeholder,
}: {
  id: string;
  valeur: string;
  /** Les libellés proposés, dans l'ordre où ils s'affichent. */
  options: string[];
  surChangement: (valeur: string) => void;
  placeholder?: string;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [survole, setSurvole] = useState(-1);

  const cherche = replier(valeur);
  const proposees = options.filter((o) => replier(o).includes(cherche));

  /*
   * Une seule proposition, déjà écrite mot pour mot, n'apprend rien.
   *
   * C'est le cas au retour sur un dossier rempli : sans cela, poser le curseur dans le
   * champ ouvrait une liste d'un seul élément, celui qu'on venait de lire.
   *
   * La comparaison porte sur le texte brut, non sur sa forme repliée : « algerie » et
   * « Algérie » se cherchent pareil mais ne s'écrivent pas pareil, et c'est justement
   * l'accent qu'on vient proposer.
   */
  const utile = proposees.length > 0 && !(proposees.length === 1 && proposees[0] === valeur.trim());
  const visibles = proposees.slice(0, MAXIMUM);

  function retenir(option: string) {
    surChangement(option);
    setOuvert(false);
    setSurvole(-1);
  }

  return (
    <div className={styles.completion}>
      <input
        id={id}
        value={valeur}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={ouvert && utile}
        aria-controls={id + "-propositions"}
        aria-autocomplete="list"
        onChange={(e) => {
          setSurvole(-1);
          setOuvert(true);
          surChangement(e.target.value);
        }}
        onFocus={() => setOuvert(true)}
        onBlur={() => setOuvert(false)}
        onKeyDown={(e) => {
          if (!ouvert || !utile) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setSurvole((r) => (r + 1) % visibles.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setSurvole((r) => (r <= 0 ? visibles.length - 1 : r - 1));
          } else if (e.key === "Enter" && survole >= 0) {
            e.preventDefault();
            retenir(visibles[survole]);
          } else if (e.key === "Escape") {
            setOuvert(false);
          }
        }}
      />

      {ouvert && utile && (
        <ul className={styles.propositions} id={id + "-propositions"} role="listbox">
          {visibles.map((o, i) => (
            <li key={o} role="option" aria-selected={i === survole}>
              <button
                type="button"
                className={i === survole ? styles.propositionActive : styles.proposition}
                /* mousedown et non click : le blur du champ fermerait la liste
                   avant que le clic n'aboutisse. */
                onMouseDown={(e) => {
                  e.preventDefault();
                  retenir(o);
                }}
                onMouseEnter={() => setSurvole(i)}
              >
                {o}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Les accents et la casse ne doivent pas arrêter une recherche : « algerie » trouve Algérie. */
function replier(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}
