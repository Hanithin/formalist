"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import styles from "./Support.module.css";

interface Conversation {
  clientId: number;
  client: string;
  email: string | null;
  dernierMessage: string;
  dernierLe: string | null;
}

interface Message {
  id: number;
  contenu: string;
  expediteur: string;
  duSupport: boolean;
  envoyeLe: string;
}

interface Props {
  moi: number;
  estAdmin: boolean;
  clientActif: number | null;
  conversations: Conversation[];
  messagesInitiaux: Message[];
}

function heure(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));
}

export function Support({
  estAdmin,
  clientActif,
  conversations,
  messagesInitiaux,
}: Props) {
  const [messages, setMessages] = useState(messagesInitiaux);
  const [enCours, demarrer] = useTransition();
  const fil = useRef<HTMLDivElement>(null);
  const champ = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();

  useEffect(() => {
    fil.current?.scrollTo({ top: fil.current.scrollHeight });
  }, [messages]);

  function envoyer(donnees: FormData) {
    const contenu = String(donnees.get("contenu") ?? "").trim();
    if (!contenu) return;

    demarrer(async () => {
      const reponse = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contenu, client: clientActif ?? undefined }),
      });
      if (!reponse.ok) return;

      const { message } = await reponse.json();
      setMessages((actuels) =>
        actuels.some((m) => m.id === message.id) ? actuels : [...actuels, message]
      );
      champ.current!.value = "";
      champ.current?.focus();
      router.refresh();
    });
  }

  return (
    <div className={estAdmin ? styles.dispositionAdmin : styles.disposition}>
      {estAdmin && (
        <nav className={styles.conversations} aria-label="Conversations de support">
          {conversations.length === 0 && <p className={styles.aucune}>Aucune conversation.</p>}
          {conversations.map((c) => (
            <button
              key={c.clientId}
              type="button"
              onClick={() => router.push("/support?client=" + c.clientId)}
              className={c.clientId === clientActif ? styles.conversationActive : styles.conversation}
              aria-current={c.clientId === clientActif ? "true" : undefined}
            >
              <span className={styles.client}>{c.client}</span>
              <span className={styles.apercu}>{c.dernierMessage}</span>
            </button>
          ))}
        </nav>
      )}

      <section className={styles.echange}>
        <div className={styles.fil} ref={fil} role="log" aria-live="polite">
          {messages.length === 0 && (
            <p className={styles.aucune}>
              {estAdmin
                ? "Choisissez une conversation."
                : "Aucun message pour l'instant. Écrivez-nous, on vous répond."}
            </p>
          )}

          {messages.map((m) => (
            <article key={m.id} className={m.duSupport ? styles.recu : styles.mien}>
              <p className={styles.contenu}>{m.contenu}</p>
              <p className={styles.signature}>
                {m.expediteur} · {heure(m.envoyeLe)}
              </p>
            </article>
          ))}
        </div>

        {/* Le champ est là d'emblée : rien à ouvrir pour écrire. */}
        <form action={envoyer} className={styles.saisie}>
          <label htmlFor="contenu" className={styles.invisible}>
            Votre message
          </label>
          <textarea
            id="contenu"
            name="contenu"
            ref={champ}
            rows={2}
            placeholder="Écrivez votre message"
            disabled={estAdmin && !clientActif}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <button type="submit" disabled={enCours || (estAdmin && !clientActif)}>
            {enCours ? "Envoi" : "Envoyer"}
          </button>
        </form>
      </section>
    </div>
  );
}
