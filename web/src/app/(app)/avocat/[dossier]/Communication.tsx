"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import styles from "../Avocat.module.css";

export interface MessageDuFil {
  id: number;
  expediteurId: number;
  expediteur: string;
  contenu: string;
  fichier: string | null;
  quand: string;
}

/**
 * La conversation avec le client, dans le dossier.
 *
 * Écrire au client demandait de quitter le dossier pour la messagerie, d'y retrouver
 * le bon fil, puis de revenir : on écrivait donc de mémoire, sans ce qu'on voulait
 * commenter sous les yeux. C'est le même fil que la messagerie - la même table, le même
 * point d'entrée - il se lit et s'écrit aussi d'ici.
 */
export function Communication({
  dossier,
  moi,
  messages,
  client,
  documents,
  aVerifier,
}: {
  dossier: number;
  /** Pour distinguer ce que le cabinet a écrit de ce que le client répond. */
  moi: number;
  messages: MessageDuFil[];
  client: { nom: string; courriel: string | null };
  documents: number;
  aVerifier: number;
}) {
  const [texte, setTexte] = useState("");
  const [refus, setRefus] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const champ = useRef<HTMLInputElement>(null);
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
        ? await fetch("/api/messages", { method: "POST", body: enFormulaire(dossier, contenu, fichier) })
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

  return (
    <div className={styles.filGrille}>
    <section className={styles.fil} aria-label="Conversation avec le client">
      {messages.length === 0 ? (
        <p className={styles.filVide}>
          Rien n&apos;a encore été échangé sur ce dossier. Ce que vous écrivez ici arrive
          dans la messagerie du client, et dans la vôtre.
        </p>
      ) : (
        <ol className={styles.filMessages}>
          {messages.map((message, rang) => {
            const deNous = message.expediteurId === moi;
            /* Le nom ne se répète pas d'une bulle à l'autre du même auteur. */
            const nouvelAuteur = messages[rang - 1]?.expediteurId !== message.expediteurId;

            return (
              <li
                key={message.id}
                className={deNous ? `${styles.filLigne} ${styles.filDeNous}` : styles.filLigne}
              >
                {nouvelAuteur && !deNous && (
                  <span className={styles.filAuteur}>{message.expediteur}</span>
                )}

                <div className={styles.filBulle}>
                  <p className={styles.filTexte}>{message.contenu}</p>

                  {message.fichier && (
                    <a
                      className={styles.filPiece}
                      href={"/api/fichier?nom=" + encodeURIComponent(message.fichier)}
                      target="_blank"
                      rel="noreferrer"
                    >
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
                      La pièce jointe
                    </a>
                  )}
                </div>

                <span className={styles.filQuand}>{message.quand}</span>
              </li>
            );
          })}
        </ol>
      )}

      {/*
        Une barre, non un formulaire.
        
        La zone d'écriture tenait une carte à elle seule, avec un champ de trois lignes
        et deux boutons alignés à droite : écrire un mot au client y paraissait un acte.
      */}
      <div className={styles.filEcrire}>
        <textarea
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          rows={1}
          placeholder="Écrire au client…"
          aria-label="Écrire au client"
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
            {/* Le trombone suffit : le mot doublait le dessin. */}
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
            <span className={styles.champFichier}>Joindre une pièce</span>
            <input
              ref={champ}
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
            className={styles.travailPrincipal}
            onClick={() => envoyer()}
            disabled={enCours || !texte.trim()}
          >
            {enCours ? "Envoi…" : "Envoyer"}
          </button>
        </div>
      </div>
    </section>

    {/*
      Ce qu'on a sous les yeux en écrivant.
      
      Écrire au client demandait de se rappeler de tête à qui l'on parle et où en est
      son dossier : la colonne le dit, et mène à ce qu'on veut lui commenter.
    */}
    <aside className={styles.filColonne}>
      <div className={styles.filFiche}>
        <span className={styles.filFicheNom}>{client.nom}</span>
        {client.courriel && (
          <span className={styles.filFicheMail}>{client.courriel}</span>
        )}
      </div>

      <div className={styles.filFiche}>
        <div className={styles.filFicheLigne}>
          <span>Documents au dossier</span>
          <span className={styles.filFicheNombre}>{documents}</span>
        </div>
        <div className={styles.filFicheLigne}>
          <span>Pièces à vérifier</span>
          <span className={styles.filFicheNombre}>{aVerifier}</span>
        </div>
      </div>

      <p className={styles.filFicheNote}>
        Ce fil est celui de la messagerie : ce que vous écrivez ici arrive dans la sienne,
        et dans la vôtre.
      </p>
    </aside>
    </div>
  );
}

function enFormulaire(dossier: number, contenu: string, fichier: File): FormData {
  const corps = new FormData();
  corps.append("dossier", String(dossier));
  corps.append("fichier", fichier);
  if (contenu) corps.append("contenu", contenu);
  return corps;
}
