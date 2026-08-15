"use client";

import { useEffect, useState } from "react";
import { affichable } from "@/domain/document/bibliotheque";
import styles from "./Documents.module.css";

/**
 * L'aperçu d'un document, avant de le télécharger.
 *
 * Cinq actes s'appellent « Statuts », « Procès-verbal », « Attestation » : le nom ne
 * dit pas toujours ce qu'on cherche, et vérifier supposait de télécharger, d'ouvrir
 * puis de jeter le fichier. La fenêtre le montre sur place, et le téléchargement reste
 * à un clic.
 *
 * Le fichier est demandé à /api/fichier, qui vérifie les droits comme partout
 * ailleurs, et gardé en mémoire du navigateur plutôt que posé dans une adresse que
 * l'historique retiendrait.
 */
export function Apercu({
  nom,
  fichier,
  surFermeture,
}: {
  nom: string;
  fichier: string;
  surFermeture: () => void;
}) {
  const lisible = affichable(fichier);
  const [etat, setEtat] = useState<"chargement" | "pret" | "echec">(
    lisible ? "chargement" : "echec"
  );
  const [source, setSource] = useState<string | null>(null);

  const adresse =
    "/api/fichier?nom=" + encodeURIComponent(fichier) + "&titre=" + encodeURIComponent(nom);

  useEffect(() => {
    if (!lisible) return;

    const abandon = new AbortController();
    let objet: string | null = null;

    (async () => {
      try {
        const reponse = await fetch(adresse, { signal: abandon.signal });
        if (!reponse.ok) {
          setEtat("echec");
          return;
        }
        objet = URL.createObjectURL(await reponse.blob());
        setSource(objet);
        setEtat("pret");
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setEtat("echec");
      }
    })();

    return () => {
      abandon.abort();
      if (objet) URL.revokeObjectURL(objet);
    };
  }, [adresse, lisible]);

  // Échap ferme, comme sur toute fenêtre de ce genre.
  useEffect(() => {
    function auClavier(e: KeyboardEvent) {
      if (e.key === "Escape") surFermeture();
    }
    document.addEventListener("keydown", auClavier);
    return () => document.removeEventListener("keydown", auClavier);
  }, [surFermeture]);

  return (
    <div
      className={styles.voile}
      onClick={(e) => {
        if (e.target === e.currentTarget) surFermeture();
      }}
    >
      <div
        className={styles.apercuFenetre}
        role="dialog"
        aria-modal="true"
        aria-label={"Aperçu de " + nom}
      >
        <div className={styles.fenetreTete}>
          <h2>{nom}</h2>
          <div className={styles.apercuGestes}>
            <a
              className={styles.action + " " + styles.actionPrincipale}
              href={adresse + "&telecharger=1"}
            >
              Télécharger
            </a>
            <button
              type="button"
              className={styles.fermer}
              onClick={surFermeture}
              aria-label="Fermer l'aperçu"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                width="20"
                height="20"
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
            <p className={styles.apercuMessage} role="status">
              {lisible
                ? "L'aperçu n'a pas pu être préparé."
                : "Ce format ne s'affiche pas dans le navigateur."}{" "}
              Le document reste téléchargeable ci-dessus.
            </p>
          )}

          {etat === "pret" && source && (
            <iframe className={styles.apercuCadre} src={source} title={"Aperçu de " + nom} />
          )}
        </div>
      </div>
    </div>
  );
}
