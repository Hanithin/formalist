"use client";

import { Fragment, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Vide } from "@/components/liste/Vide";
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

/** « 16:10 » : le jour est dit une fois par le séparateur qui ouvre la journée. */
function heure(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { timeStyle: "short" }).format(new Date(iso));
}

/** « Aujourd'hui », « Hier », puis la date en toutes lettres. */
function jourEnClair(iso: string, maintenant: Date = new Date()): string {
  const quand = new Date(iso);
  const jour = (d: Date) => d.toISOString().slice(0, 10);

  const veille = new Date(maintenant);
  veille.setDate(veille.getDate() - 1);

  if (jour(quand) === jour(maintenant)) return "Aujourd'hui";
  if (jour(quand) === jour(veille)) return "Hier";

  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(quand);
}

function changeDeJour(precedent: string | undefined, actuel: string): boolean {
  if (!precedent) return true;
  return precedent.slice(0, 10) !== actuel.slice(0, 10);
}

/** « il y a 3 h », puis la date : dans une liste, l'heure exacte n'apprend rien. */
function depuis(iso: string, maintenant: Date = new Date()): string {
  const minutes = Math.floor((maintenant.getTime() - new Date(iso).getTime()) / 60000);
  if (minutes < 60) return Math.max(1, minutes) + " min";
  const heures = Math.floor(minutes / 60);
  if (heures < 24) return heures + " h";
  const jours = Math.floor(heures / 24);
  if (jours < 7) return jours + " j";
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(
    new Date(iso)
  );
}

/*
  Les initiales, faute d'avatar.

  Un nom seul en tête d'un fil se confond avec le premier message ; deux lettres dans un
  rond disent d'un coup d'œil de qui l'on parle, et c'est ce que fait déjà la barre du
  compte en bas de la colonne.
*/
function initiales(nom: string): string {
  return nom
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((mot) => mot[0]?.toUpperCase() ?? "")
    .join("");
}

export function Support({
  estAdmin,
  clientActif,
  conversations,
  messagesInitiaux,
}: Props) {
  const [messages, setMessages] = useState(messagesInitiaux);
  const [terme, setTerme] = useState("");
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

  const retenues = conversations.filter((c) =>
    (c.client + " " + (c.email ?? "")).toLowerCase().includes(terme.trim().toLowerCase())
  );
  const ouverte = conversations.find((c) => c.clientId === clientActif) ?? null;

  return (
    <div className={estAdmin ? styles.dispositionAdmin : styles.disposition}>
      {estAdmin && (
        <div className={styles.colonneListe}>
          {/*
            La recherche en tête de la colonne.

            Deux conversations se trouvent à l'œil ; cinquante ne se trouvent plus, et
            l'on faisait défiler une liste de noms pour retrouver celui qui vient
            d'écrire.
          */}
          <div className={styles.rechercheFil}>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="search"
              value={terme}
              placeholder="Rechercher un client"
              aria-label="Rechercher une conversation"
              onChange={(e) => setTerme(e.target.value)}
            />
          </div>

          <nav className={styles.conversations} aria-label="Conversations de support">
            {retenues.length === 0 && (
              <Vide
                ton="discret"
                texte={
                  conversations.length === 0
                    ? "Aucune conversation ouverte."
                    : "Aucun client ne correspond."
                }
              />
            )}
            {retenues.map((c) => (
              <button
                key={c.clientId}
                type="button"
                onClick={() => router.push("/support?client=" + c.clientId)}
                className={
                  c.clientId === clientActif ? styles.conversationActive : styles.conversation
                }
                aria-current={c.clientId === clientActif ? "true" : undefined}
              >
                <span className={styles.client}>{c.client}</span>
                {c.dernierLe && <span className={styles.quand}>{depuis(c.dernierLe)}</span>}
                <span className={styles.apercu}>{c.dernierMessage}</span>
              </button>
            ))}
          </nav>
        </div>
      )}

      <section className={styles.echange}>
        {/*
          À qui l'on écrit, en tête du fil.

          La colonne de droite s'ouvrait sur un message sans dire de qui il venait : le
          nom n'était que dans la liste de gauche, sur une ligne surlignée qu'il fallait
          retrouver des yeux. Un fil de discussion nomme son correspondant.
        */}
        {estAdmin && ouverte && (
          <header className={styles.enTeteFil}>
            <span className={styles.initiales} aria-hidden="true">
              {initiales(ouverte.client)}
            </span>
            <span className={styles.enTeteTextes}>
              <span className={styles.enTeteNom}>{ouverte.client}</span>
              {ouverte.email && <span className={styles.enTeteMail}>{ouverte.email}</span>}
            </span>
          </header>
        )}

        <div className={styles.fil} ref={fil} role="log" aria-live="polite">
          {/*
            Tant qu'aucune conversation n'est ouverte, le fil ne montre rien.

            Sans client choisi, la colonne affichait les messages de l'administrateur
            lui-même : un fil sans en-tête, sous un champ de saisie désactivé, dont rien
            ne disait à qui il appartenait. On croyait une conversation ouverte.
          */}
          {estAdmin && !clientActif ? (
            <Vide
              ton="discret"
              texte={
                conversations.length === 0
                  ? "Aucune conversation ouverte."
                  : "Choisissez une conversation dans la liste."
              }
            />
          ) : (
            messages.length === 0 && (
              <Vide
                ton="discret"
                texte={
                  estAdmin
                    ? "Aucun message dans cette conversation."
                    : "Aucun message pour l'instant. Écrivez-nous, on vous répond."
                }
              />
            )
          )}

          {(!estAdmin || clientActif) &&
            messages.map((m, rang) => (
            <Fragment key={m.id}>
              {/*
                Un séparateur quand le jour change.

                Chaque bulle portait sa date entière - « 09/08/2026 16:10 » - et deux
                messages du même jour la répétaient. Le jour se dit une fois, au-dessus
                du premier message qu'il porte ; l'heure suffit ensuite.
              */}
              {changeDeJour(messages[rang - 1]?.envoyeLe, m.envoyeLe) && (
                <p className={styles.jour}>{jourEnClair(m.envoyeLe)}</p>
              )}

              <article className={m.duSupport ? styles.recu : styles.mien}>
                <p className={styles.contenu}>{m.contenu}</p>
                <p className={styles.signature}>
                  {m.expediteur} · {heure(m.envoyeLe)}
                </p>
              </article>
            </Fragment>
            ))}
        </div>

        {/*
          Le champ est là d'emblée : rien à ouvrir pour écrire.

          Le bouton est dans le cadre, non à côté : la zone de saisie occupait la moitié
          de la largeur - une règle globale borne tout champ à quatre cent soixante
          pixels - et le bouton flottait à sa droite avec cinq cents pixels de vide
          derrière lui. Un cadre unique prend la ligne entière, et le raccourci clavier,
          que le code appliquait déjà en silence, s'y écrit.
        */}
        <form action={envoyer} className={styles.saisie}>
          <label htmlFor="contenu" className={styles.invisible}>
            Votre message
          </label>
          <div className={styles.zoneSaisie}>
            <textarea
              id="contenu"
              name="contenu"
              ref={champ}
              rows={1}
              placeholder="Écrivez votre message"
              disabled={estAdmin && !clientActif}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <div className={styles.piedSaisie}>
              <span className={styles.astuce}>
                Entrée pour envoyer, Maj + Entrée pour aller à la ligne
              </span>
              <button type="submit" disabled={enCours || (estAdmin && !clientActif)}>
                {enCours ? "Envoi" : "Envoyer"}
              </button>
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}
