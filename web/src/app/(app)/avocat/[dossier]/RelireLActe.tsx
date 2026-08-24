"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import styles from "../Avocat.module.css";

/**
 * Relire un projet d'acte : le prendre en Word, le corriger, le redéposer.
 *
 * Le cabinet produit le procès-verbal à partir d'un gabarit Word, puis le fige en PDF.
 * L'avocat n'avait accès qu'au PDF - qu'on ne corrige pas - et devait donc reprendre
 * l'acte ailleurs, hors du dossier, sans que rien n'en revienne.
 *
 * Deux gestes ici : ouvrir le Word tel que l'application l'a rédigé, et redéposer sa
 * version. La seconde refait le PDF remis au client, et garde le Word corrigé comme
 * source - de sorte qu'une correction suivante reparte du bon texte.
 */
export function RelireLActe({
  document,
  source,
}: {
  document: number;
  /** Le nom de stockage du Word d'origine, quand la conversion a réussi. */
  source: string | null;
}) {
  const champ = useRef<HTMLInputElement>(null);
  const [refus, setRefus] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const router = useRouter();

  function redeposer(fichier: File) {
    setRefus(null);
    demarrer(async () => {
      const corps = new FormData();
      corps.append("document", String(document));
      corps.append("fichier", fichier);

      const reponse = await fetch("/api/avocat/actes/fichier", { method: "POST", body: corps });
      const retour = await reponse.json().catch(() => ({}));

      if (!reponse.ok) {
        setRefus(retour.error ?? "La version corrigée n'a pas pu être enregistrée");
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      {source && (
        <a
          className={styles.decisionSecondaire}
          href={"/api/fichier?nom=" + encodeURIComponent(source) + "&telecharger=1"}
        >
          Corriger le Word
        </a>
      )}

      <button
        type="button"
        className={styles.decisionSecondaire}
        onClick={() => champ.current?.click()}
        disabled={enCours}
      >
        {enCours ? "Envoi" : "Déposer ma version"}
      </button>

      <input
        ref={champ}
        type="file"
        accept=".docx,.pdf"
        hidden
        onChange={(e) => {
          const fichier = e.target.files?.[0];
          // Le champ est vidé : redéposer deux fois le même fichier doit repartir.
          e.target.value = "";
          if (fichier) redeposer(fichier);
        }}
      />

      {refus && (
        <span className={styles.decisionRefus} role="alert">
          {refus}
        </span>
      )}
    </>
  );
}
