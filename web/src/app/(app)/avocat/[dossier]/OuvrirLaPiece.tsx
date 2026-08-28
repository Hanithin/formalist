"use client";

import { useState } from "react";
import { Apercu } from "@/components/document/Apercu";
import styles from "../Avocat.module.css";

/**
 * Ouvrir une pièce sans quitter le dossier.
 *
 * « Ouvrir » était un lien vers /api/fichier : le PDF partait dans un onglet du
 * navigateur, et vérifier trois justificatifs laissait trois onglets ouverts qu'il
 * fallait refermer un à un pour revenir décider. La fenêtre montre la pièce par-dessus
 * la liste, et les boutons « Valider » et « Demander une autre pièce » restent à côté.
 *
 * C'est la même fenêtre que la bibliothèque du client : elle demande le fichier à
 * /api/fichier, qui vérifie les droits comme partout ailleurs.
 */
export function OuvrirLaPiece({ nom, fichier }: { nom: string; fichier: string }) {
  const [ouvert, setOuvert] = useState(false);

  return (
    <>
      <button type="button" className={styles.decisionSecondaire} onClick={() => setOuvert(true)}>
        Ouvrir
      </button>

      {ouvert && <Apercu nom={nom} fichier={fichier} surFermeture={() => setOuvert(false)} />}
    </>
  );
}
