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
  dossier,
  source,
}: {
  document: number;
  dossier: number;
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

  /*
   * Valider l'acte, et lui seul.
   *
   * La mise à disposition était collective, sur une autre tâche : un bouton publiait le
   * jeu entier, et l'avocat qui n'avait relu qu'un acte publiait les trois. La ligne du
   * document porte sa propre décision.
   */
  function valider() {
    setRefus(null);
    demarrer(async () => {
      const reponse = await fetch("/api/avocat/actes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossier, document }),
      });
      if (!reponse.ok) {
        const retour = await reponse.json().catch(() => ({}));
        setRefus(retour.error ?? "La validation n'a pas abouti");
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        className={styles.decisionValider}
        onClick={valider}
        disabled={enCours}
      >
        {enCours ? "…" : "Valider"}
      </button>

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

/**
 * Reprendre un acte déjà remis, pour le corriger.
 *
 * Une coquille se voit parfois après coup, et l'acte remis n'avait plus aucun geste sur
 * sa ligne : il fallait retirer le jeu entier depuis une tâche accomplie et repliée, ce
 * qui remettait en relecture des actes qu'on n'avait pas à toucher.
 */
export function ReprendreLActe({ document, dossier }: { document: number; dossier: number }) {
  const [refus, setRefus] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const router = useRouter();

  function reprendre() {
    setRefus(null);
    demarrer(async () => {
      const reponse = await fetch("/api/avocat/actes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossier, document }),
      });
      if (!reponse.ok) {
        const retour = await reponse.json().catch(() => ({}));
        setRefus(retour.error ?? "La reprise n'a pas abouti");
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        className={styles.decisionSecondaire}
        onClick={reprendre}
        disabled={enCours}
      >
        {enCours ? "…" : "Reprendre pour corriger"}
      </button>

      {refus && (
        <span className={styles.decisionRefus} role="alert">
          {refus}
        </span>
      )}
    </>
  );
}
