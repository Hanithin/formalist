"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EXTENSIONS_JOINTES, TAILLE_MAXIMALE } from "@/lib/fichiers";
import styles from "./Parcours.module.css";

/**
 * Écrire au cabinet sans quitter son dossier.
 *
 * Le bouton menait droit à la messagerie : on perdait l'écran qu'on était en train de
 * remplir pour une phrase à écrire. La fenêtre garde la place, envoie par la même
 * route que la messagerie - la pièce jointe comprise - et laisse le lien vers le fil
 * pour qui veut relire l'échange en entier.
 *
 * Rien n'est réécrit : c'est `/api/messages` qui reçoit, et le message rejoint le fil
 * du dossier comme s'il avait été tapé là-bas.
 */

interface Props {
  dossierId: number;
  surFermeture: () => void;
}

export function EcrireAuCabinet({ dossierId, surFermeture }: Props) {
  const [texte, setTexte] = useState("");
  const [piece, setPiece] = useState<File | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoye, setEnvoye] = useState(false);
  const [enCours, demarrer] = useTransition();

  const champRef = useRef<HTMLTextAreaElement>(null);
  const fichierRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    champRef.current?.focus();

    function auClavier(e: KeyboardEvent) {
      if (e.key === "Escape") surFermeture();
    }
    window.addEventListener("keydown", auClavier);
    return () => window.removeEventListener("keydown", auClavier);
  }, [surFermeture]);

  /** Le poids et le format sont vérifiés ici pour le dire tout de suite, et au serveur. */
  function choisir(fichier: File | null) {
    setErreur(null);
    if (!fichier) {
      setPiece(null);
      return;
    }

    if (fichier.size > TAILLE_MAXIMALE) {
      setErreur("Ce fichier dépasse 10 Mo.");
      return;
    }

    const point = fichier.name.lastIndexOf(".");
    const extension = point < 0 ? "" : fichier.name.slice(point).toLowerCase();
    if (!EXTENSIONS_JOINTES.includes(extension)) {
      setErreur("Ce format de fichier n'est pas accepté.");
      return;
    }

    setPiece(fichier);
  }

  function envoyer() {
    const contenu = texte.trim();
    if (!contenu && !piece) return;

    setErreur(null);
    demarrer(async () => {
      /*
       * Un envoi avec pièce passe en formulaire, un envoi sans pièce en JSON : c'est
       * ce que la route attend, et c'est elle qui choisit selon ce qu'elle reçoit.
       */
      const reponse = piece
        ? await fetch("/api/messages", { method: "POST", body: formulaire(contenu, piece) })
        : await fetch("/api/messages", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ dossier: dossierId, contenu }),
          });

      if (!reponse.ok) {
        const corps = (await reponse.json().catch(() => ({}))) as { error?: string };
        setErreur(corps.error ?? "Le message n'a pas pu être envoyé.");
        return;
      }

      setEnvoye(true);
      router.refresh();
    });
  }

  function formulaire(contenu: string, fichier: File) {
    const corps = new FormData();
    corps.append("dossier", String(dossierId));
    corps.append("fichier", fichier);
    if (contenu) corps.append("contenu", contenu);
    return corps;
  }

  return (
    <div className={styles.ecrireVoile} onClick={surFermeture}>
      <div
        className={styles.ecrireFenetre}
        role="dialog"
        aria-modal="true"
        aria-label="Écrire au cabinet"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.ecrireTete}>
          <p className={styles.ecrireTitre}>Écrire au cabinet</p>
          <button
            type="button"
            className={styles.ecrireFermer}
            onClick={surFermeture}
            aria-label="Fermer"
          >
            ×
          </button>
        </div>

        {envoye ? (
          <div className={styles.ecrireCorps}>
            <p className={styles.ecrireEnvoye} role="status">
              Message envoyé. Le cabinet vous répond dans le fil du dossier.
            </p>
            <div className={styles.ecrireGestes}>
              <Link href={"/messagerie?dossier=" + dossierId} className={styles.ecrireBouton}>
                Ouvrir la conversation
              </Link>
              <button type="button" className={styles.ecrireSecondaire} onClick={surFermeture}>
                Revenir au dossier
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.ecrireCorps}>
            <label className={styles.ecrireLabel} htmlFor="message-cabinet">
              Votre message
            </label>
            <textarea
              id="message-cabinet"
              ref={champRef}
              rows={5}
              className={styles.ecrireChamp}
              placeholder="Une question sur une pièce, une précision sur votre situation, un point à vérifier avant le dépôt..."
              value={texte}
              onChange={(e) => setTexte(e.target.value)}
            />

            {/*
              Le champ de fichier est masqué : c'est le bouton qui porte le clic.

              Masqué aux yeux, non au clavier - il reste dans l'ordre de tabulation,
              et sans nom la synthèse vocale y annonce « Choisir un fichier » sans
              dire de quoi il s'agit.
            */}
            <input
              ref={fichierRef}
              type="file"
              aria-label="Joindre un fichier à votre message"
              className={styles.ecrireFichier}
              accept={EXTENSIONS_JOINTES.join(",")}
              onChange={(e) => choisir(e.target.files?.[0] ?? null)}
            />

            <div className={styles.ecrirePiece}>
              <button
                type="button"
                className={styles.ecrireSecondaire}
                onClick={() => fichierRef.current?.click()}
                disabled={enCours}
              >
                {piece ? "Changer la pièce jointe" : "Joindre une pièce"}
              </button>
              {piece && (
                <span className={styles.ecrireNomPiece}>
                  {piece.name}
                  <button
                    type="button"
                    onClick={() => {
                      setPiece(null);
                      if (fichierRef.current) fichierRef.current.value = "";
                    }}
                    aria-label="Retirer la pièce jointe"
                  >
                    ×
                  </button>
                </span>
              )}
            </div>

            {erreur && (
              <p className={styles.ecrireErreur} role="alert">
                {erreur}
              </p>
            )}

            <div className={styles.ecrireGestes}>
              <button
                type="button"
                className={styles.ecrireBouton}
                onClick={envoyer}
                disabled={enCours || (!texte.trim() && !piece)}
              >
                {enCours ? "Envoi…" : "Envoyer"}
              </button>
              <Link href={"/messagerie?dossier=" + dossierId} className={styles.ecrireSecondaire}>
                Ouvrir la conversation
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
