"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Vide } from "@/components/liste/Vide";
import styles from "./TableauDeBord.module.css";

/**
 * La fenêtre « Toutes vos sociétés ».
 *
 * L'accueil ne montre que les trois dossiers les plus récents. Au-delà, cette
 * fenêtre les liste tous avec une recherche : c'est ce qui évite de renvoyer sur
 * une autre page pour retrouver un dossier dont on connaît le nom.
 */

export interface Ligne {
  id: number;
  nom: string;
  etape: string;
  etat: string;
  ton: "done" | "action" | "";
  pourcentage: number;
  termine: boolean;
  lien: string;
}

function Coche() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function ToutesLesSocietes({ lignes }: { lignes: Ligne[] }) {
  const [ouverte, setOuverte] = useState(false);
  const [recherche, setRecherche] = useState("");
  const champ = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!ouverte) return;

    champ.current?.focus();
    // Le fond de page ne défile pas sous la fenêtre.
    const defilement = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const auClavier = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOuverte(false);
    };
    document.addEventListener("keydown", auClavier);

    return () => {
      document.body.style.overflow = defilement;
      document.removeEventListener("keydown", auClavier);
    };
  }, [ouverte]);

  const q = recherche.toLowerCase().trim();
  const filtrees = q
    ? lignes.filter(
        (l) =>
          l.nom.toLowerCase().includes(q) ||
          l.etape.toLowerCase().includes(q) ||
          l.etat.toLowerCase().includes(q)
      )
    : lignes;

  function ouvrir() {
    setRecherche("");
    setOuverte(true);
  }

  return (
    <>
      <button type="button" className={styles.socSeeAll} onClick={ouvrir}>
        Voir toutes
        <span className={styles.socSeeAllCount}>{lignes.length}</span>
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

      {ouverte &&
        createPortal(
          // La fenêtre est posée sur le corps de page plutôt que dans la section
          // qui l'ouvre : elle n'appartient pas à son contenu, et une liste
          // masquée y ferait doublon avec les vignettes.
          <div
            className={`${styles.smBackdrop} ${styles.open}`}
            onClick={(e) => {
              if (e.target === e.currentTarget) setOuverte(false);
            }}
          >
            <div
              className={styles.smModal}
              role="dialog"
              aria-modal="true"
              aria-label="Toutes vos sociétés"
            >
              <div className={styles.smHead}>
                <div>
                  <h3 className={styles.smTitle}>Toutes vos sociétés</h3>
                  <p className={styles.smSub}>
                    Ouvrez un dossier pour reprendre là où vous en êtes
                  </p>
                </div>
                <button
                  type="button"
                  className={styles.smClose}
                  onClick={() => setOuverte(false)}
                  aria-label="Fermer"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              <div className={styles.smSearch}>
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
                  ref={champ}
                  type="text"
                  value={recherche}
                  onChange={(e) => setRecherche(e.target.value)}
                  placeholder="Rechercher une société, une étape…"
                  aria-label="Rechercher une société"
                />
              </div>

              <div className={styles.smList}>
                {filtrees.length === 0 ? (
                  <Vide ton="discret" texte={"Aucune société ne correspond à « " + recherche + " »"} />
                ) : (
                  filtrees.map((l) => (
                    <Link key={l.id} href={l.lien} className={styles.smRow}>
                      <span className={`${styles.smPct} ${l.ton ? styles[l.ton] : ""}`}>
                        {l.termine ? <Coche /> : l.pourcentage + "%"}
                      </span>
                      <span className={styles.smBody}>
                        <span className={styles.smName}>{l.nom}</span>
                        <span className={styles.smStep}>{l.etape}</span>
                      </span>
                      <span className={`${styles.smStatus} ${l.ton ? styles[l.ton] : ""}`}>
                        {l.etat}
                      </span>
                      <svg
                        className={styles.smArrow}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </Link>
                  ))
                )}
              </div>

              <div className={styles.smFoot}>
                <Link href="/formalites" className={styles.smFootLink}>
                  Ouvrir la page Mes formalités →
                </Link>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
