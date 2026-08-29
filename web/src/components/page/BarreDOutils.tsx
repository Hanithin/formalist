"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import styles from "./BarreDOutils.module.css";

/**
 * La barre d'outils d'une liste : le sélecteur de filtres à gauche, la recherche à
 * droite. Les deux partagent leur matériau et leur hauteur ; c'est ce qui les fait
 * lire comme une seule barre plutôt que deux objets voisins.
 */
export function BarreDOutils({ children }: { children: React.ReactNode }) {
  return <div className={styles.barre}>{children}</div>;
}

/** Ce qui pousse la recherche à l'autre bout de la barre. */
export function Espace() {
  return <span className={styles.espace} />;
}

const TRAITS = {
  fill: "none" as const,
  stroke: "currentColor" as const,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export interface Choix {
  valeur: string;
  /** Où mène ce choix. Le filtre vit dans l'adresse : il se partage et se recharge. */
  lien: string;
  libelle: string;
  compte?: number;
}

/**
 * Un choix parmi plusieurs, dans un seul cadre.
 *
 * Le fond blanc de l'actif est un élément à part, mesuré sur lui après chaque rendu :
 * une classe CSS ne sait pas animer entre deux éléments, si bien que le blanc sautait
 * d'un onglet à l'autre au lieu d'y glisser.
 *
 * Il reste invisible tant qu'il n'est pas mesuré - sans quoi il naîtrait dans l'angle
 * du cadre et traverserait la barre au premier affichage.
 */
export function Selecteur({
  choix,
  actif,
  intitule,
  surChoix,
}: {
  choix: Choix[];
  actif: string;
  /** Ce que dit le lecteur d'écran en entrant dans la barre. */
  intitule: string;
  surChoix?: () => void;
}) {
  const barre = useRef<HTMLElement>(null);
  const [curseur, setCurseur] = useState<{ x: number; y: number; l: number; h: number } | null>(
    null
  );

  useEffect(() => {
    const cadre = barre.current;
    if (!cadre) return;

    const mesurer = () => {
      const courant = cadre.querySelector<HTMLElement>("[aria-current='page']");
      if (!courant) return setCurseur(null);

      const dehors = cadre.getBoundingClientRect();
      const dedans = courant.getBoundingClientRect();
      setCurseur({
        x: dedans.left - dehors.left,
        y: dedans.top - dehors.top,
        l: dedans.width,
        h: dedans.height,
      });
    };

    mesurer();

    /*
     * La barre bouge sans que le choix change : elle passe à la ligne quand la fenêtre
     * rétrécit, et les intitulés changent de largeur quand les comptes changent. Le
     * curseur suit plutôt que de rester en arrière.
     */
    const observateur = new ResizeObserver(mesurer);
    observateur.observe(cadre);
    return () => observateur.disconnect();
  }, [actif, choix]);

  return (
    <nav ref={barre} className={styles.selecteur} aria-label={intitule}>
      <span
        className={styles.curseur}
        aria-hidden="true"
        style={
          curseur
            ? {
                opacity: 1,
                width: curseur.l,
                height: curseur.h,
                transform: `translate(${curseur.x}px, ${curseur.y}px)`,
              }
            : undefined
        }
      />

      {choix.map((c) => (
        <Link
          key={c.valeur}
          href={c.lien}
          className={c.valeur === actif ? `${styles.choix} ${styles.choixActif}` : styles.choix}
          aria-current={c.valeur === actif ? "page" : undefined}
          onClick={surChoix}
        >
          {c.libelle}
          {c.compte !== undefined && <span className={styles.compte}>{c.compte}</span>}
        </Link>
      ))}
    </nav>
  );
}

/**
 * Le champ de recherche.
 *
 * Son texte d'invite nomme ce sur quoi il porte : « Rechercher... » laissait deviner
 * quels champs seraient fouillés, et l'on tapait un SIREN dans une recherche qui ne
 * regarde que les noms.
 */
export function Recherche({
  valeur,
  invite,
  libelle,
  identifiant = "recherche",
  surSaisie,
}: {
  valeur: string;
  /** Les champs cherchés, séparés par des virgules : « Société, forme, type… ». */
  invite: string;
  /** Ce que lit un lecteur d'écran : il décrit le champ, non ce qu'on y cherche. */
  libelle: string;
  identifiant?: string;
  surSaisie: (valeur: string) => void;
}) {
  return (
    <div className={styles.recherche}>
      <svg viewBox="0 0 24 24" {...TRAITS} strokeWidth="2" aria-hidden="true">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>

      <label htmlFor={identifiant} className={styles.invisible}>
        {libelle}
      </label>

      <input
        id={identifiant}
        className={styles.champ}
        type="text"
        value={valeur}
        placeholder={invite}
        onChange={(e) => surSaisie(e.target.value)}
      />

      {valeur && (
        <button
          type="button"
          className={styles.effacer}
          aria-label="Effacer la recherche"
          onClick={() => {
            surSaisie("");
            document.getElementById(identifiant)?.focus();
          }}
        >
          <svg viewBox="0 0 24 24" {...TRAITS} strokeWidth="2" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  );
}
