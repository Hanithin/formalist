"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { presentation, libelleJour, grouperParJour } from "@/domain/messagerie/messages";
import styles from "./Messagerie.module.css";

interface Conversation {
  dossierId: number;
  societe: string;
  forme: string | null;
  dernierMessage: string | null;
  dernierLe: string | null;
  nonLus: number;
}

interface MessageAffiche {
  id: number;
  expediteurId: number;
  expediteur: string;
  contenu: string;
  type: string | null;
  envoyeLe: string;
}

interface Props {
  conversations: Conversation[];
  dossierActif: number;
  messagesInitiaux: MessageAffiche[];
  moi: number;
}

function heure(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(
    new Date(iso)
  );
}

export function Messagerie({ conversations, dossierActif, messagesInitiaux, moi }: Props) {
  const [messages, setMessages] = useState(messagesInitiaux);
  const [enCours, demarrer] = useTransition();
  const filRef = useRef<HTMLDivElement>(null);
  const champRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();

  // On reste collé au dernier message, comme dans toute messagerie.
  useEffect(() => {
    filRef.current?.scrollTo({ top: filRef.current.scrollHeight });
  }, [messages]);

  // Les messages reçus pendant qu'on regarde sont marqués lus tout de suite.
  useEffect(() => {
    fetch("/api/messages/lus", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dossier: dossierActif }),
    }).catch(() => undefined);
  }, [dossierActif, messages.length]);

  // Flux temps réel. Le navigateur rouvre de lui-même quand le serveur ferme.
  useEffect(() => {
    const dernier = messages.length ? messages[messages.length - 1].id : 0;
    const source = new EventSource(
      "/api/messages/flux?dossier=" + dossierActif + "&depuis=" + dernier
    );

    source.addEventListener("messages", (evenement) => {
      const arrivants = JSON.parse((evenement as MessageEvent).data) as MessageAffiche[];
      setMessages((actuels) => {
        const connus = new Set(actuels.map((m) => m.id));
        return [...actuels, ...arrivants.filter((m) => !connus.has(m.id))];
      });
    });

    return () => source.close();
    // On ne redémarre qu'au changement de dossier : rouvrir à chaque message
    // rendrait le flux inutile.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dossierActif]);

  function envoyer(donnees: FormData) {
    const contenu = String(donnees.get("contenu") ?? "").trim();
    if (!contenu) return;

    demarrer(async () => {
      const reponse = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossier: dossierActif, contenu }),
      });
      if (!reponse.ok) return;

      const { message } = await reponse.json();
      setMessages((actuels) =>
        actuels.some((m) => m.id === message.id) ? actuels : [...actuels, message]
      );
      champRef.current!.value = "";
      champRef.current?.focus();
      router.refresh(); // l'aperçu de la conversation doit suivre
    });
  }

  // Les séparateurs de journée sont calculés avant le rendu : modifier une
  // variable pendant qu'on rend le fil est une source d'affichages incohérents.
  const parJour = grouperParJour(
    messages.map((m) => ({ ...m, envoyeLe: new Date(m.envoyeLe) }))
  );

  return (
    <div className={styles.disposition}>
      <nav className={styles.fils} aria-label="Conversations">
        {conversations.map((c) => (
          <button
            key={c.dossierId}
            type="button"
            onClick={() => router.push("/messagerie?dossier=" + c.dossierId)}
            className={c.dossierId === dossierActif ? styles.filActif : styles.fil}
            aria-current={c.dossierId === dossierActif ? "true" : undefined}
          >
            <span className={styles.societe}>{c.societe}</span>
            <span className={styles.apercu}>{c.dernierMessage ?? "Aucun message"}</span>
            {c.nonLus > 0 && <span className={styles.pastille}>{c.nonLus}</span>}
          </button>
        ))}
      </nav>

      <section className={styles.conversation}>
        <div className={styles.fil2} ref={filRef} role="log" aria-live="polite">
          {parJour.map(([jour, duJour]) => (
            <div key={jour}>
              <p className={styles.jour}>{libelleJour(jour)}</p>
              {duJour.map((m) => {
                const genre = presentation(m.type);
                return (
                  <article
                    key={m.id}
                    className={m.expediteurId === moi ? styles.mien : styles.recu}
                  >
                    {genre.demandeAction && <p className={styles.intention}>{genre.libelle}</p>}
                    <p className={styles.contenu}>{m.contenu}</p>
                    <p className={styles.signature}>
                      {m.expediteur} · {heure(m.envoyeLe.toISOString())}
                    </p>
                  </article>
                );
              })}
            </div>
          ))}
        </div>

        {/* Le champ est là d'emblée : il n'y a rien à ouvrir pour écrire. */}
        <form action={envoyer} className={styles.saisie}>
          <label htmlFor="contenu" className={styles.invisible}>
            Votre message
          </label>
          <textarea
            id="contenu"
            name="contenu"
            ref={champRef}
            rows={2}
            placeholder="Écrivez votre message"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <button type="submit" disabled={enCours}>
            {enCours ? "Envoi" : "Envoyer"}
          </button>
        </form>
      </section>
    </div>
  );
}
