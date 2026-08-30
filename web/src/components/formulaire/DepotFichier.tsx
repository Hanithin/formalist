"use client";

import { useRef, useState } from "react";
import styles from "./DepotFichier.module.css";

/**
 * Le dépôt d'un fichier.
 *
 * Le champ natif rend un bouton grisé « Choisir un fichier » suivi de « Aucun fichier
 * choisi », dans la langue du système et avec l'apparence de chaque navigateur. Il
 * affiche en plus une infobulle « Aucun fichier choisi » qui flotte au-dessus de la
 * page, parfois par-dessus le bouton suivant. Au milieu d'un formulaire soigné, c'est
 * la pièce qui trahit.
 *
 * Ici, une zone qu'on peut cliquer ou survoler avec un fichier. Une fois déposé, il se
 * lit comme un document - nom, poids, format - avec de quoi le remplacer ou le retirer,
 * plutôt qu'un chemin dans un champ de texte.
 */

interface Props {
  id: string;
  /** Ce qu'on attend : « .pdf », « .pdf,.jpg »… */
  accepte: string;
  /** Le nom du fichier déjà déposé, quand il y en a un. */
  depose?: string | null;
  /** Le poids en octets, quand on le connaît. */
  poids?: number | null;
  invite?: string;
  precision?: string;
  desactive?: boolean;
  surFichier: (fichier: File) => void;
  surRetrait?: () => void;
}

/** « 1,2 Mo » : un poids se lit, il ne se compte pas en octets. */
export function poidsLisible(octets: number): string {
  if (octets < 1024) return octets + " o";
  if (octets < 1024 * 1024) return Math.round(octets / 1024) + " Ko";
  return (Math.round((octets / (1024 * 1024)) * 10) / 10).toLocaleString("fr-FR") + " Mo";
}

export function DepotFichier({
  id,
  accepte,
  depose,
  poids,
  invite = "Glissez votre fichier ici",
  precision,
  desactive,
  surFichier,
  surRetrait,
}: Props) {
  const champ = useRef<HTMLInputElement>(null);
  const [survole, setSurvole] = useState(false);

  function recevoir(fichiers: FileList | null) {
    const fichier = fichiers?.[0];
    if (fichier) surFichier(fichier);
  }

  if (depose) {
    return (
      <div className={styles.pose}>
        <span className={styles.poseIcone} aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
            <path d="M14 3v5h5" />
          </svg>
        </span>

        <span className={styles.poseCorps}>
          <span className={styles.poseNom}>{depose}</span>
          <span className={styles.poseDetail}>
            {[poids ? poidsLisible(poids) : null, "Déposé"].filter(Boolean).join(" · ")}
          </span>
        </span>

        <span className={styles.poseActions}>
          <button
            type="button"
            className={styles.poseAction}
            disabled={desactive}
            onClick={() => champ.current?.click()}
          >
            Remplacer
          </button>
          {surRetrait && (
            <button
              type="button"
              className={`${styles.poseAction} ${styles.poseRetrait}`}
              disabled={desactive}
              onClick={surRetrait}
            >
              Retirer
            </button>
          )}
        </span>

        {/*
          Le champ natif reste, caché : c'est lui qui ouvre le sélecteur du système, et
          son étiquette « Aucun fichier choisi » n'a pas à s'afficher.

          Caché aux yeux seulement : il garde sa place dans l'ordre de tabulation, et
          c'est bien ce qu'il faut - le sélecteur de fichiers doit s'atteindre au
          clavier. Il lui faut donc un nom, sans quoi la synthèse vocale annonce un
          bouton « Choisir un fichier » seul au milieu de la page.

          Ici un fichier est déjà là : le champ sert à le remplacer, et c'est ce qu'il
          annonce - l'invite de la zone vide (« Glissez votre fichier ici ») décrirait
          un geste qui n'est plus celui-là.
        */}
        <input
          ref={champ}
          id={id}
          className={styles.natif}
          type="file"
          accept={accepte}
          aria-label={"Remplacer le fichier déposé" + (depose ? " : " + depose : "")}
          disabled={desactive}
          onChange={(e) => recevoir(e.target.files)}
        />
      </div>
    );
  }

  return (
    <div
      className={survole ? `${styles.zone} ${styles.zoneSurvolee}` : styles.zone}
      onDragOver={(e) => {
        e.preventDefault();
        if (!desactive) setSurvole(true);
      }}
      onDragLeave={() => setSurvole(false)}
      onDrop={(e) => {
        e.preventDefault();
        setSurvole(false);
        if (!desactive) recevoir(e.dataTransfer.files);
      }}
    >
      <span className={styles.icone} aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M12 16V4M12 4 8 8M12 4l4 4" />
          <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
        </svg>
      </span>

      <p className={styles.invite}>{invite}</p>

      <button
        type="button"
        className={styles.parcourir}
        disabled={desactive}
        onClick={() => champ.current?.click()}
      >
        Parcourir mes fichiers
      </button>

      {precision && <p className={styles.precision}>{precision}</p>}

      <input
        ref={champ}
        id={id}
        className={styles.natif}
        type="file"
        accept={accepte}
        aria-label={invite}
        disabled={desactive}
        onChange={(e) => recevoir(e.target.files)}
      />
    </div>
  );
}
