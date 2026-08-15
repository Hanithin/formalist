"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { TRIS } from "@/domain/formalite/avocat";
import styles from "./Avocat.module.css";

/**
 * Chercher, trier, borner dans le temps.
 *
 * Trente dossiers s'affichaient d'un bloc : retrouver celui d'un client demandait de
 * parcourir la page à l'œil, et les colonnes de dates ne servaient qu'à lire.
 *
 * Tout passe par l'adresse plutôt que par un état local : une recherche se partage,
 * se met en favori, et survit à un rechargement. C'est aussi ce qui permet à la page
 * de rester rendue par le serveur.
 */
export function Recherche() {
  const parametres = useSearchParams();
  const router = useRouter();

  function poser(champ: string, valeur: string) {
    const suite = new URLSearchParams(parametres.toString());
    if (valeur.trim()) suite.set(champ, valeur);
    else suite.delete(champ);

    // Tout changement de critère ramène à la première page : rester en page 3 d'une
    // liste qui n'en compte plus qu'une donnerait un écran vide.
    suite.delete("page");
    router.replace("/avocat?" + suite.toString());
  }

  const terme = parametres.get("q") ?? "";
  const tri = parametres.get("tri") ?? "recent";
  const du = parametres.get("du") ?? "";
  const au = parametres.get("au") ?? "";
  const filtre = parametres.get("filtre");

  const aUnCritere = terme || du || au || tri !== "recent";

  return (
    <div className={styles.outils}>
      <div className={styles.champRecherche}>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="search"
          defaultValue={terme}
          placeholder="Société, référence, client…"
          aria-label="Rechercher un dossier"
          onChange={(e) => poser("q", e.target.value)}
        />
      </div>

      <label className={styles.outil}>
        <span className={styles.outilLibelle}>Trier par</span>
        <select value={tri} onChange={(e) => poser("tri", e.target.value)}>
          {TRIS.map((t) => (
            <option key={t.cle} value={t.cle}>
              {t.libelle}
            </option>
          ))}
        </select>
      </label>

      {/* La période porte sur la création : c'est la date qui ne bouge plus. */}
      <label className={styles.outil}>
        <span className={styles.outilLibelle}>Créés du</span>
        <input type="date" value={du} max={au || undefined} onChange={(e) => poser("du", e.target.value)} />
      </label>

      <label className={styles.outil}>
        <span className={styles.outilLibelle}>au</span>
        <input type="date" value={au} min={du || undefined} onChange={(e) => poser("au", e.target.value)} />
      </label>

      {aUnCritere && (
        <button
          type="button"
          className={styles.effacer}
          onClick={() => {
            const suite = new URLSearchParams();
            if (filtre) suite.set("filtre", filtre);
            router.replace("/avocat" + (suite.toString() ? "?" + suite.toString() : ""));
          }}
        >
          Effacer
        </button>
      )}
    </div>
  );
}
