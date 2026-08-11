"use client";

import { useEffect, useState } from "react";
import styles from "./Parcours.module.css";

/**
 * L'aperçu d'un acte, avant signature.
 *
 * Reprise de la fenêtre #pdf-preview-overlay de public/creation.html : le document
 * s'affiche en PDF par-dessus la page, avec son nom et le bouton de téléchargement.
 * Un acte se relit avant d'être signé, et le relire suppose de le voir - pas de
 * télécharger un fichier Word pour l'ouvrir ailleurs.
 *
 * La conversion se fait sur le serveur (/api/formalites/pdf) et demande
 * LibreOffice. Quand il manque, on le dit et on propose le téléchargement du
 * document Word : mieux vaut un chemin de repli annoncé qu'une fenêtre vide.
 */

interface Props {
  nom: string;
  fichier: string;
  surFermeture: () => void;
}

export function Apercu({ nom, fichier, surFermeture }: Props) {
  const [etat, setEtat] = useState<"chargement" | "pret" | "echec">("chargement");
  const [erreur, setErreur] = useState<string | null>(null);
  const [pdf, setPdf] = useState<string | null>(null);

  useEffect(() => {
    const abandon = new AbortController();
    let adresse: string | null = null;

    (async () => {
      try {
        const reponse = await fetch("/api/formalites/pdf?nom=" + encodeURIComponent(fichier), {
          signal: abandon.signal,
        });

        if (!reponse.ok) {
          const corps = (await reponse.json().catch(() => ({}))) as { error?: string };
          setErreur(corps.error ?? "L'aperçu n'a pas pu être préparé");
          setEtat("echec");
          return;
        }

        // Le PDF est servi en flux privé : on le garde en mémoire du navigateur
        // plutôt que de le poser dans une adresse que l'historique retiendrait.
        const donnees = await reponse.blob();
        adresse = URL.createObjectURL(donnees);
        setPdf(adresse);
        setEtat("pret");
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setErreur("L'aperçu n'a pas pu être préparé");
        setEtat("echec");
      }
    })();

    return () => {
      abandon.abort();
      if (adresse) URL.revokeObjectURL(adresse);
    };
  }, [fichier]);

  // Échap ferme, comme sur toute fenêtre de ce genre.
  useEffect(() => {
    function auClavier(e: KeyboardEvent) {
      if (e.key === "Escape") surFermeture();
    }
    document.addEventListener("keydown", auClavier);
    return () => document.removeEventListener("keydown", auClavier);
  }, [surFermeture]);

  return (
    <div className={styles.apercuVoile} onClick={surFermeture}>
      <div
        className={styles.apercuFenetre}
        role="dialog"
        aria-modal="true"
        aria-label={"Aperçu de " + nom}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.apercuEntete}>
          <p className={styles.apercuTitre}>{nom}</p>

          <div className={styles.apercuGestes}>
            <a
              href={
                "/api/fichier?nom=" + encodeURIComponent(fichier) + "&titre=" + encodeURIComponent(nom)
              }
              className={`${styles.genBtn} ${styles.genBtnPrimaire}`}
            >
              Télécharger
            </a>
            <button
              type="button"
              className={styles.apercuFermer}
              aria-label="Fermer l'aperçu"
              onClick={surFermeture}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        <div className={styles.apercuCorps}>
          {etat === "chargement" && (
            <p className={styles.apercuMessage} role="status">
              Préparation de l&apos;aperçu…
            </p>
          )}

          {etat === "echec" && (
            <p className={styles.apercuMessage} role="alert">
              {erreur}. Le document Word reste téléchargeable ci-dessus.
            </p>
          )}

          {etat === "pret" && pdf && (
            <iframe className={styles.apercuCadre} src={pdf} title={"Aperçu de " + nom} />
          )}
        </div>
      </div>
    </div>
  );
}
