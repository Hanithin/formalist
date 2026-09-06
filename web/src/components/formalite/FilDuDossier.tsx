"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import styles from "./Dossier.module.css";

export interface MessageDuFil {
  id: number;
  expediteurId: number;
  expediteur: string;
  contenu: string;
  fichier: string | null;
  quand: string;
}

/**
 * La conversation avec le cabinet, dans le dossier.
 *
 * Écrire à son avocat demandait de quitter le dossier pour la messagerie, d'y
 * retrouver le bon fil, puis de revenir : on écrivait donc de mémoire, sans ce dont on
 * voulait parler sous les yeux. C'est le même fil que la messagerie - la même table,
 * le même point d'entrée - il se lit et s'écrit aussi d'ici.
 */
export function FilDuDossier({
  dossier,
  moi,
  messages,
}: {
  dossier: number;
  /** Pour distinguer ce qu'on a écrit de ce que le cabinet répond. */
  moi: number;
  messages: MessageDuFil[];
}) {
  const [texte, setTexte] = useState("");
  const [refus, setRefus] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const router = useRouter();

  function envoyer(fichier?: File) {
    const contenu = texte.trim();
    if (!contenu && !fichier) return;
    setRefus(null);

    demarrer(async () => {
      /*
       * Un envoi avec pièce part en multipart, un envoi de texte en JSON : c'est le
       * même point d'entrée, et c'est lui qui décide selon le type de contenu.
       */
      const reponse = fichier
        ? await fetch("/api/messages", {
            method: "POST",
            body: enFormulaire(dossier, contenu, fichier),
          })
        : await fetch("/api/messages", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ dossier, contenu }),
          });

      if (!reponse.ok) {
        const retour = await reponse.json().catch(() => ({}));
        setRefus(retour.error ?? "Le message n'est pas parti.");
        return;
      }
      setTexte("");
      router.refresh();
    });
  }

  /* Le dernier message reçu ou envoyé : c'est lui qu'on vient voir. */
  const dernier = messages[messages.length - 1];

  return (
    <section className={styles.fil} aria-label="Conversation avec le cabinet">
      {/*
        Le dernier mot, non la conversation entière.
        
        Le fil s'ouvrait sur trois cent quatre-vingts pixels de haut, vides le plus
        souvent, pour une phrase centrée disant qu'il ne s'était rien passé. Un dossier
        confié à un avocat ne se relit pas ici : on y vient pour voir s'il a écrit, et
        pour répondre. La messagerie garde l'échange en entier, et le lien y mène.
        
        C'est la forme que la création emploie depuis toujours, sur le même écran.
      */}
      {dernier ? (
        <blockquote className={styles.filDernier}>
          <span className={styles.filDernierQui}>
            {dernier.expediteurId === moi ? "Vous" : dernier.expediteur}
            <time>{dernier.quand}</time>
          </span>
          <span className={styles.filDernierTexte}>
            {dernier.contenu ||
              (dernier.fichier ? "Une pièce jointe vous attend." : "")}
          </span>

          {dernier.fichier && (
            <a
              className={styles.filPiece}
              href={"/api/fichier?nom=" + encodeURIComponent(dernier.fichier)}
              target="_blank"
              rel="noreferrer"
            >
              <Trombone />
              La pièce jointe
            </a>
          )}
        </blockquote>
      ) : (
        <p className={styles.filVide}>
          Une question, une précision sur votre dossier ? Écrivez à l&apos;avocat qui
          s&apos;en occupe : vous pouvez joindre un document, et tout reste au dossier.
        </p>
      )}

      {messages.length > 1 && (
        <a className={styles.filConversation} href={"/messagerie?dossier=" + dossier}>
          Voir la conversation
          <span className={styles.filConversationCompte}>
            {messages.length} message{messages.length > 1 ? "s" : ""}
          </span>
        </a>
      )}

      <div className={styles.filEcrire}>
        <textarea
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          rows={1}
          placeholder="Écrire à l'avocat…"
          aria-label="Écrire à l'avocat"
        />

        {refus && (
          <p className={styles.filRefus} role="alert">
            {refus}
          </p>
        )}

        <div className={styles.filGestes}>
          {/*
            La pièce part seule, avec le texte s'il y en a : joindre puis écrire ferait
            deux messages là où l'on n'en voulait qu'un.
          */}
          <label className={styles.filJoindre} title="Joindre une pièce">
            <Trombone />
            <span className={styles.champFichier}>Joindre une pièce</span>
            <input
              type="file"
              className={styles.champFichier}
              /* Le navigateur n'est qu'un filtre de confort : le serveur tranche. */
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp,.rtf,.txt,.csv,.zip,.heic,.heif"
              disabled={enCours}
              onChange={(e) => {
                const fichier = e.target.files?.[0];
                e.target.value = "";
                if (fichier) envoyer(fichier);
              }}
            />
          </label>

          <button
            type="button"
            className={styles.filEnvoyer}
            onClick={() => envoyer()}
            disabled={enCours || !texte.trim()}
          >
            {enCours ? "Envoi…" : "Envoyer"}
          </button>
        </div>
      </div>
    </section>
  );
}

function Trombone() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21.4 11.05 12.25 20.2a5 5 0 0 1-7.07-7.07l9.19-9.19a3.33 3.33 0 1 1 4.71 4.71l-9.2 9.19a1.67 1.67 0 1 1-2.35-2.36l8.49-8.48" />
    </svg>
  );
}

function enFormulaire(dossier: number, contenu: string, fichier: File): FormData {
  const corps = new FormData();
  corps.append("dossier", String(dossier));
  corps.append("fichier", fichier);
  if (contenu) corps.append("contenu", contenu);
  return corps;
}
