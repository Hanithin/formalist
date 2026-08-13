"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  presentation,
  libelleJour,
  grouperParJour,
  initiales,
  citation,
  correspond,
  heureCourte,
  dateCourte,
  apercuDeConversation,
} from "@/domain/messagerie/messages";
import {
  Loupe,
  Bulle,
  Trombone,
  Avion,
  Croix,
  FlecheRetour,
  FlecheDroite,
  Televersement,
  PieceJointe,
  IconeDuType,
} from "./Icones";
import { EtatVide } from "./EtatVide";
import styles from "./Messagerie.module.css";

/**
 * La messagerie de public/messagerie.html.
 *
 * Deux colonnes : les conversations à gauche, le fil à droite. Un fil par dossier avec
 * l'avocat qui le suit, et un fil avec le support pour tout le reste - c'est le
 * découpage de la page d'origine, où « Avocat » et « Support » formaient deux sections
 * de la liste.
 */

export interface Fil {
  /** « dossier-12 » ou « support » : la liste mélange deux origines. */
  cle: string;
  genre: "dossier" | "support";
  dossierId: number | null;
  /**
   * Le client de la conversation.
   *
   * C'est lui qui parle à droite, la plateforme - avocat ou support - à gauche. Le
   * côté dit donc qui parle, et non qui regarde : sinon un avocat ou un
   * administrateur voyait tout le fil du même côté, et ne distinguait plus les
   * demandes des réponses.
   */
  clientId: number;
  titre: string;
  sousTitre: string | null;
  forme: string | null;
  dernierMessage: string | null;
  dernierDeMoi: boolean;
  dernierLe: string | null;
  nonLus: number;
}

export interface MessageAffiche {
  id: number;
  expediteurId: number;
  expediteur: string;
  contenu: string;
  type: string | null;
  fichier: string | null;
  repondA: number | null;
  envoyeLe: string;
}

interface Props {
  fils: Fil[];
  filActif: string;
  messagesInitiaux: MessageAffiche[];
}

/** Les classes de bulle par type, le CSS module n'acceptant pas de nom calculé. */
const CLASSES_DE_TYPE: Record<string, string | undefined> = {
  correction_request: styles.kindCorrectionRequest,
  rejection: styles.kindRejection,
  validation: styles.kindValidation,
  validation_pending: styles.kindValidationPending,
  document_request: styles.kindDocumentRequest,
  status_note: styles.kindStatusNote,
};

export function Messagerie({ fils, filActif, messagesInitiaux }: Props) {
  const [messages, setMessages] = useState(messagesInitiaux);
  const [recherche, setRecherche] = useState("");
  const [repondA, setRepondA] = useState<MessageAffiche | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [brouillon, setBrouillon] = useState("");
  const [enCours, demarrer] = useTransition();

  const filRef = useRef<HTMLDivElement>(null);
  const champRef = useRef<HTMLInputElement>(null);
  const fichierRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const actif = fils.find((f) => f.cle === filActif) ?? null;
  const estSupport = actif?.genre === "support";

  // On reste collé au dernier message, comme dans toute messagerie.
  useEffect(() => {
    filRef.current?.scrollTo({ top: filRef.current.scrollHeight });
  }, [messages]);

  // Les messages reçus pendant qu'on regarde sont marqués lus tout de suite.
  useEffect(() => {
    if (!actif) return;

    const adresse = estSupport ? "/api/support" : "/api/messages/lus";
    const corps = estSupport ? {} : { dossier: actif.dossierId };

    fetch(adresse, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corps),
    }).catch(() => undefined);
  }, [actif, estSupport, messages.length]);

  /*
   * Flux temps réel, pour les fils de dossier seulement.
   *
   * Le navigateur rouvre de lui-même quand le serveur ferme. On ne redémarre qu'au
   * changement de conversation : rouvrir à chaque message rendrait le flux inutile.
   */
  useEffect(() => {
    if (!actif || actif.genre !== "dossier" || actif.dossierId === null) return;

    const dernier = messagesInitiaux.length
      ? messagesInitiaux[messagesInitiaux.length - 1].id
      : 0;
    const source = new EventSource(
      "/api/messages/flux?dossier=" + actif.dossierId + "&depuis=" + dernier
    );

    source.addEventListener("messages", (evenement) => {
      const arrivants = JSON.parse((evenement as MessageEvent).data) as MessageAffiche[];
      setMessages((actuels) => {
        const connus = new Set(actuels.map((m) => m.id));
        return [...actuels, ...arrivants.filter((m) => !connus.has(m.id))];
      });
    });

    return () => source.close();
  }, [actif, messagesInitiaux]);

  function ouvrir(cle: string) {
    const fil = fils.find((f) => f.cle === cle);
    if (!fil) return;
    router.push(
      fil.genre === "support" ? "/messagerie?fil=support" : "/messagerie?dossier=" + fil.dossierId
    );
  }

  function envoyer() {
    const contenu = brouillon.trim();
    if (!contenu || !actif) return;

    setErreur(null);
    demarrer(async () => {
      const adresse = estSupport ? "/api/support" : "/api/messages";
      const corps = estSupport
        ? { contenu }
        : { dossier: actif.dossierId, contenu, repondA: repondA?.id ?? null };

      const reponse = await fetch(adresse, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corps),
      });

      if (!reponse.ok) {
        setErreur("Le message n'a pas pu être envoyé");
        return;
      }

      const { message } = (await reponse.json()) as { message: MessageAffiche };
      setMessages((actuels) =>
        actuels.some((m) => m.id === message.id) ? actuels : [...actuels, message]
      );
      setBrouillon("");
      setRepondA(null);
      champRef.current?.focus();
      router.refresh(); // l'aperçu de la conversation doit suivre
    });
  }

  /** Joint une pièce au fil : le fichier est porté par le message. */
  function joindre(fichier: File) {
    if (!actif) return;
    setErreur(null);

    demarrer(async () => {
      const formulaire = new FormData();
      formulaire.append("fichier", fichier);
      if (actif.dossierId !== null) formulaire.append("dossier", String(actif.dossierId));
      if (brouillon.trim()) formulaire.append("contenu", brouillon.trim());
      if (repondA) formulaire.append("repondA", String(repondA.id));

      const reponse = await fetch(estSupport ? "/api/support" : "/api/messages", {
        method: "POST",
        body: formulaire,
      });

      if (!reponse.ok) {
        const corps = (await reponse.json().catch(() => ({}))) as { error?: string };
        setErreur(corps.error ?? "La pièce n'a pas pu être jointe");
        return;
      }

      const { message } = (await reponse.json()) as { message: MessageAffiche };
      setMessages((actuels) =>
        actuels.some((m) => m.id === message.id) ? actuels : [...actuels, message]
      );
      setBrouillon("");
      setRepondA(null);
      router.refresh();
    });
  }

  const visibles = useMemo(
    () => fils.filter((f) => correspond({ titre: f.titre, dernierMessage: f.dernierMessage }, recherche)),
    [fils, recherche]
  );

  const dossiers = visibles.filter((f) => f.genre === "dossier");
  const supports = visibles.filter((f) => f.genre === "support");

  // Le message est porté tel quel à côté de sa date : l'étaler dans l'objet groupé
  // remplacerait envoyeLe par une Date, et le type du message avec.
  const parJour = grouperParJour(
    messages.map((m) => ({ message: m, envoyeLe: new Date(m.envoyeLe) }))
  );

  const parId = new Map(messages.map((m) => [m.id, m]));

  return (
    <div className={styles.msgContainer}>
      {/* ---------- Les conversations ---------- */}
      <div className={styles.convList}>
        <div className={styles.convListHeader}>
          <h1>Messagerie</h1>
          <div className={styles.convSearch}>
            <Loupe />
            <label htmlFor="recherche-conversation" className={styles.invisible}>
              Rechercher une conversation
            </label>
            <input
              id="recherche-conversation"
              type="text"
              value={recherche}
              placeholder="Rechercher une conversation…"
              onChange={(e) => setRecherche(e.target.value)}
            />
          </div>
        </div>

        <nav className={styles.convItems} aria-label="Conversations">
          {dossiers.length > 0 && <div className={styles.convSectionTitle}>Avocat</div>}
          {dossiers.map((f) => (
            <LigneDeFil key={f.cle} fil={f} actif={f.cle === filActif} surChoix={ouvrir} />
          ))}

          {supports.length > 0 && <div className={styles.convSectionTitle}>Support</div>}
          {supports.map((f) => (
            <LigneDeFil key={f.cle} fil={f} actif={f.cle === filActif} surChoix={ouvrir} />
          ))}

          {visibles.length === 0 && (
            <p className={styles.convNone}>
              Aucune conversation ne correspond à «&nbsp;{recherche}&nbsp;»
            </p>
          )}
        </nav>
      </div>

      {/* ---------- Le fil ---------- */}
      <div className={styles.chatView}>
        {!actif ? (
          <Accueil fils={fils} surChoix={ouvrir} />
        ) : (
          <>
            <div className={styles.chatViewHeader}>
              <div className={styles.chatViewInfo}>
                <span
                  className={
                    estSupport ? `${styles.avBig} ${styles.avBigSupport}` : styles.avBig
                  }
                  aria-hidden="true"
                >
                  {initiales(actif.titre)}
                </span>
                <div className={styles.infoText}>
                  <h2 className={styles.infoTitle}>
                    {actif.titre}
                    {actif.forme && <span className={styles.infoForme}>{actif.forme}</span>}
                  </h2>
                  {actif.sousTitre && (
                    <p className={styles.infoMeta}>
                      <span className={styles.infoMetaItem}>{actif.sousTitre}</span>
                    </p>
                  )}
                </div>
              </div>

              {actif.genre === "dossier" && actif.dossierId !== null && (
                <a
                  className={styles.chatBackBtn}
                  href={"/creation?dossier=" + actif.dossierId}
                >
                  <FlecheDroite />
                  Ouvrir le dossier
                </a>
              )}
            </div>

            {messages.length === 0 ? (
              <EtatVide
                genre={actif.genre}
                titre={actif.titre}
                surSujet={(texte) => {
                  setBrouillon(texte);
                  champRef.current?.focus();
                }}
              />
            ) : (
              <div className={styles.chatMessages} ref={filRef} role="log" aria-live="polite">
                {parJour.map(([jour, duJour]) => (
                  <div key={jour} style={{ display: "contents" }}>
                    <p className={styles.chatDay}>
                      <span>{libelleJour(jour)}</span>
                    </p>

                    {duJour.map(({ message: m }) => {
                      const duClient = m.expediteurId === actif.clientId;
                      const genre = presentation(m.type);
                      const type = m.type && m.type !== "text" ? m.type : null;
                      const cite = m.repondA ? parId.get(m.repondA) : undefined;

                      return (
                        <div
                          key={m.id}
                          className={[
                            styles.chatMsgWrap,
                            duClient ? styles.chatMsgWrapSent : styles.chatMsgWrapReceived,
                          ].join(" ")}
                        >
                          {type && (
                            <span
                              className={styles.chatMsgKind}
                              style={{ background: genre.fond, color: genre.encre }}
                            >
                              <IconeDuType type={type} />
                              {genre.libelle}
                            </span>
                          )}

                          <div
                            className={[
                              styles.chatMsg,
                              duClient ? styles.chatMsgSent : styles.chatMsgReceived,
                              type ? styles.chatMsgTypeE : "",
                              type ? (CLASSES_DE_TYPE[type] ?? "") : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                          >
                            {!duClient && <div className={styles.chatMsgSender}>{m.expediteur}</div>}

                            {cite && (
                              <div className={styles.chatMsgQuote}>
                                <div className={styles.chatMsgQuoteSender}>{cite.expediteur}</div>
                                {citation(cite.contenu)}
                              </div>
                            )}

                            {m.contenu && <div>{m.contenu}</div>}

                            {m.fichier && (
                              <a
                                className={styles.chatMsgFile}
                                href={"/api/fichier?nom=" + encodeURIComponent(m.fichier)}
                              >
                                <PieceJointe />
                                Pièce jointe
                              </a>
                            )}

                            {/* Le geste attendu, du côté de qui le reçoit. */}
                            {type && !duClient && genre.action === "dossier" && actif.dossierId && (
                              <a
                                className={styles.chatMsgCta}
                                href={"/creation?dossier=" + actif.dossierId}
                              >
                                <FlecheDroite />
                                {genre.libelleAction}
                              </a>
                            )}
                            {type && !duClient && genre.action === "piece" && (
                              <button
                                type="button"
                                className={styles.chatMsgCta}
                                onClick={() => fichierRef.current?.click()}
                              >
                                <Televersement />
                                {genre.libelleAction}
                              </button>
                            )}

                            <div className={styles.chatMsgTime}>
                              {heureCourte(new Date(m.envoyeLe))}
                            </div>
                          </div>

                          {actif.genre === "dossier" && (
                            <button
                              type="button"
                              className={styles.chatMsgReplyBtn}
                              title={"Répondre à " + m.expediteur}
                              aria-label={"Répondre à " + m.expediteur}
                              onClick={() => {
                                setRepondA(m);
                                champRef.current?.focus();
                              }}
                            >
                              <FlecheRetour />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}

            {repondA && (
              <div className={styles.chatReplyContext}>
                <div className={styles.rcBody}>
                  <div className={styles.rcLabel}>Répondre à {repondA.expediteur}</div>
                  <div className={styles.rcPreview}>{citation(repondA.contenu)}</div>
                </div>
                <button
                  type="button"
                  className={styles.rcClose}
                  title="Annuler la réponse"
                  aria-label="Annuler la réponse"
                  onClick={() => setRepondA(null)}
                >
                  <Croix />
                </button>
              </div>
            )}

            {erreur && (
              <p className={styles.chatErreur} role="alert">
                {erreur}
              </p>
            )}

            <div className={styles.chatInputArea}>
              <input
                type="file"
                ref={fichierRef}
                accept=".pdf,.jpg,.jpeg,.png,.docx"
                onChange={(e) => {
                  const fichier = e.target.files?.[0];
                  if (fichier) joindre(fichier);
                  e.target.value = ""; // permet de joindre deux fois le même fichier
                }}
              />
              <button
                type="button"
                className={styles.chatBtnAttach}
                title="Joindre un fichier"
                aria-label="Joindre un fichier"
                disabled={enCours}
                onClick={() => fichierRef.current?.click()}
              >
                <Trombone />
              </button>

              <label htmlFor="message" className={styles.invisible}>
                Votre message
              </label>
              <input
                id="message"
                type="text"
                ref={champRef}
                value={brouillon}
                placeholder="Votre message..."
                onChange={(e) => setBrouillon(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    envoyer();
                  }
                }}
              />

              <button
                type="button"
                className={
                  brouillon.trim()
                    ? `${styles.chatBtnSend} ${styles.chatBtnSendActive}`
                    : styles.chatBtnSend
                }
                title="Envoyer"
                aria-label="Envoyer"
                disabled={enCours || !brouillon.trim()}
                onClick={envoyer}
              >
                <Avion />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Une ligne de la liste : avatar, nom, aperçu, heure, non-lus. */
function LigneDeFil({
  fil,
  actif,
  surChoix,
}: {
  fil: Fil;
  actif: boolean;
  surChoix: (cle: string) => void;
}) {
  const classes = [styles.convItem];
  if (actif) classes.push(styles.convItemActif);
  if (fil.nonLus > 0) classes.push(styles.convItemNonLu);

  return (
    <button
      type="button"
      className={classes.join(" ")}
      aria-current={actif ? "true" : undefined}
      onClick={() => surChoix(fil.cle)}
    >
      <span
        className={
          fil.genre === "support"
            ? `${styles.convAvatar} ${styles.convAvatarSupport}`
            : styles.convAvatar
        }
        aria-hidden="true"
      >
        {initiales(fil.titre)}
      </span>

      <span className={styles.convInfo}>
        <span className={styles.convName}>{fil.titre}</span>
        <span className={styles.convPreview}>
          {apercuDeConversation({ contenu: fil.dernierMessage, deMoi: fil.dernierDeMoi })}
        </span>
      </span>

      <span className={styles.convMeta}>
        {fil.dernierLe && (
          <span className={styles.convTime}>{dateCourte(new Date(fil.dernierLe))}</span>
        )}
        {fil.nonLus > 0 && (
          <span
            className={styles.convBadge}
            aria-label={fil.nonLus + (fil.nonLus > 1 ? " messages non lus" : " message non lu")}
          >
            {fil.nonLus}
          </span>
        )}
      </span>
    </button>
  );
}

/**
 * L'écran d'accueil, quand aucune conversation n'est ouverte.
 *
 * Il ne se contente pas d'inviter à choisir : il liste les conversations, pour que le
 * premier clic soit possible depuis le milieu de l'écran.
 */
function Accueil({ fils, surChoix }: { fils: Fil[]; surChoix: (cle: string) => void }) {
  return (
    <div className={styles.chatViewEmpty}>
      <div className={styles.welcomePane}>
        <div className={styles.welcomeIc}>
          <Bulle />
        </div>
        <h2 className={styles.welcomeTitle}>Choisissez une conversation</h2>
        <p className={styles.welcomeDesc}>
          Un fil par dossier avec l&apos;avocat qui le suit, et un fil avec le support pour
          tout le reste.
        </p>

        <div className={styles.welcomeConvs}>
          {fils.map((f) => (
            <button
              key={f.cle}
              type="button"
              className={styles.wcv}
              onClick={() => surChoix(f.cle)}
            >
              <span
                className={
                  f.genre === "support"
                    ? `${styles.wcvAvatar} ${styles.wcvAvatarSupport}`
                    : styles.wcvAvatar
                }
                aria-hidden="true"
              >
                {initiales(f.titre)}
              </span>
              <span className={styles.wcvBody}>
                <span className={styles.wcvTitle}>{f.titre}</span>
                <span className={styles.wcvSub}>{f.sousTitre}</span>
              </span>
              {f.nonLus > 0 && <span className={styles.wcvBadge}>{f.nonLus}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
