"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { dateHeureLongue } from "@/lib/dates";
import { presentation } from "@/domain/messagerie/messages";
import { EcrireAuCabinet } from "./EcrireAuCabinet";
import { useRouter } from "next/navigation";
import { A_RELIRE } from "@/domain/document/publication";
import { nomDeLaPartie } from "@/domain/formalite/etat-civil";
import type { Brouillon } from "@/domain/formalite/parcours";
import { Apercu } from "./Apercu";
import styles from "./Parcours.module.css";

/**
 * La dernière étape : les actes produits, à relire et à faire signer.
 *
 * Portage de la liste .gen-doc-card de public/js/creation/lifecycle.js : une carte
 * par document, avec sa pastille d'état, « Visualiser » et « Télécharger », et
 * l'entrée en cascade de 60 millisecondes par carte.
 *
 * Trois gestes s'enchaînent dans cet ordre : produire, relire, signer. Signer un
 * acte qu'on n'a pas relu est précisément ce qu'il faut éviter.
 *
 * Les signataires ne sont pas saisis ici : ce sont les associés du dossier, avec
 * leur email. Les faire retaper ouvrirait la porte à une signature demandée à la
 * mauvaise adresse.
 */

export interface ActeProduit {
  id: number;
  nom: string;
  fichier: string | null;
  statut: string | null;
}

interface Props {
  dossierId: number;
  brouillon: Brouillon;
  actes: ActeProduit[];
  /**
   * Le dernier mot du cabinet, et ce qui reste à lire.
   *
   * Le parcours ne porte pas de messagerie : elle existe à sa place, complète. Il dit
   * qu'on a écrit et il y mène.
   */
  dernierMot: DernierMot;
  /**
   * L'attestation de dépôt de capital est-elle au dossier ?
   *
   * Elle date les actes : c'est le jour où la banque la délivre qu'on signe les
   * statuts. Ouvrir la signature avant, c'est signer des actes qui seront reproduits
   * à une autre date - et les faire signer deux fois.
   */
  attestationRecue: boolean;
}

function Oeil() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function Fleche() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function Coche() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function Cadenas() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 018 0v4" />
    </svg>
  );
}

/** L'icône du document, celle de la page d'origine pour un acte. */
function Document() {
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
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

/*
 * Les actes n'ont plus de sous-titre.
 *
 * Chacun portait une phrase sous son nom - « L'acte fondateur de la société, à signer
 * par tous les associés » - qui doublait la hauteur de sa ligne. À cinq actes, la liste
 * descendait sur deux écrans pour dire cinq noms que leur intitulé suffit à
 * reconnaître.
 */

export function Actes({ dossierId, brouillon, actes, dernierMot, attestationRecue }: Props) {
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);
  /* La fenêtre d'aperçu ne retient que le nom de l'acte, pas son fichier.
     L'original re-sollicitait un aperçu ouvert après une régénération (« If a preview
     is currently open, re-fetch it with fresh data ») ; comme l'acte reproduit porte
     un nouveau nom de stockage, déduire le fichier du nom à chaque rendu suffit à
     obtenir le même comportement, et la fenêtre ne peut pas montrer une version
     périmée. */
  const [apercuDe, setApercuDe] = useState<string | null>(null);
  /* L'échec de production se dit sous le bouton qui l'a déclenché. Au bas de la page,
     sous la note à l'avocat, personne ne le lit. */
  const [enCours, demarrer] = useTransition();
  const router = useRouter();

  const associes = brouillon.associes ?? [];

  /** Les signataires : les associés qui portent un nom et une adresse email. */
  const signataires = associes
    .map((a) => ({
      nom: nomDeLaPartie(a),
      email: a.personne?.email?.trim() ?? "",
    }))
    .filter((s) => s.nom && s.email);

  const sansEmail = associes.filter((a) => nomDeLaPartie(a) && !a.personne?.email?.trim());

  /* Les actes que l'avocat n'a pas encore relus : ils s'affichent, sans s'ouvrir. */
  const enRelecture = actes.filter((a) => a.statut === A_RELIRE);

  function ouvrirSignatures() {
    setMessage(null);

    demarrer(async () => {
      const reponse = await fetch("/api/signature", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossier: dossierId, signataires }),
      });
      const corps = (await reponse.json().catch(() => ({}))) as { error?: string };

      if (!reponse.ok) {
        setMessage({ ok: false, texte: corps.error ?? "L'ouverture des signatures a échoué" });
        return;
      }

      setMessage({
        ok: true,
        texte:
          "Demande envoyée à " +
          signataires.map((s) => s.nom).join(", ") +
          ". Chacun reçoit son lien par email.",
      });
      router.refresh();
    });
  }

  // L'acte dont l'aperçu est ouvert, relu dans la liste courante : après une
  // régénération, c'est le fichier reproduit que la fenêtre affiche.
  const acteApercu = apercuDe ? actes.find((a) => a.nom === apercuDe) : undefined;

  return (
    <div className={styles.full}>
      {/* ---------- Ce que le dossier va produire ---------- */}
      {/*
        Le rappel « Société / Formule / Dirigeant / Associés » a été retiré.

        Il posait quatre faits en tête d'un écran qui en a déjà long à montrer, et la
        colonne de droite les dit tous - avec le siège, le capital et la clôture en
        plus. Deux endroits pour la même chose, dont l'un était le moins complet.
      */}

      {/*
        ---------- Les actes ----------

        Sans en-tête : « Documents générés / Statuts, PV et attestations préparés
        automatiquement » redisait le titre de l'étape et sa phrase, trois centimètres
        plus haut - « Mes documents / Les actes produits, à relire et à signer ».
      */}
      <div className={styles.genSection}>
        {actes.length === 0 ? (
          <p className={styles.actesVide}>
            Aucun document pour l&apos;instant. Les statuts, la liste des souscripteurs et les
            déclarations sont produits au règlement, à partir de ce que vous avez saisi.
          </p>
        ) : (
          <div className={styles.genList}>
            {actes.map((a, i) => {
              const signe = a.statut === "signed";
              const enRelecture = a.statut === A_RELIRE;
              const pret = !!a.fichier;

              return (
                <div
                  key={a.id}
                  className={pret ? styles.genCard : `${styles.genCard} ${styles.genCardEnAttente}`}
                  /* L'entrée en cascade de l'original : soixante millisecondes
                     par carte, pour que la liste se pose au lieu d'apparaître. */
                  style={{ animationDelay: 60 * i + "ms" }}
                >
                  <span className={styles.genIcone} aria-hidden="true">
                    <Document />
                  </span>

                  <div className={styles.genInfo}>
                    <div className={styles.genNom}>{a.nom}</div>
                  </div>

                  {/*
                    L'état de l'acte, la relecture d'abord.

                    Un acte produit à l'encaissement est un projet : l'avocat le relit,
                    corrige ce qu'il faut, et c'est sa relecture qui en fait un document
                    signable. L'annoncer « Prêt » entre-temps inviterait à l'envoyer à
                    sa banque ou à le signer avant que quiconque l'ait lu.
                  */}
                  <span
                    className={[
                      styles.genBadge,
                      signe
                        ? styles.genBadgeSigne
                        : enRelecture
                          ? styles.genBadgeRelecture
                          : pret
                            ? styles.genBadgePret
                            : styles.genBadgeVerrou,
                    ].join(" ")}
                  >
                    {signe ? (
                      <>
                        <Coche /> Signé
                      </>
                    ) : enRelecture ? (
                      <>
                        <Cadenas /> En relecture
                      </>
                    ) : pret ? (
                      <>
                        <Coche /> Prêt
                      </>
                    ) : (
                      <>
                        <Cadenas /> En attente
                      </>
                    )}
                  </span>

                  <div className={styles.genActions}>
                    <button
                      type="button"
                      className={styles.genBtn}
                      disabled={!a.fichier}
                      onClick={() => a.fichier && setApercuDe(a.nom)}
                    >
                      <Oeil /> Visualiser
                    </button>

                    {a.fichier ? (
                      <a
                        href={
                          "/api/fichier?nom=" +
                          encodeURIComponent(a.fichier) +
                          "&titre=" +
                          encodeURIComponent(a.nom) +
                          "&telecharger=1"
                        }
                        className={`${styles.genBtn} ${styles.genBtnPrimaire}`}
                      >
                        <Fleche /> Télécharger
                      </a>
                    ) : (
                      <button
                        type="button"
                        className={`${styles.genBtn} ${styles.genBtnPrimaire}`}
                        disabled
                      >
                        <Fleche /> Télécharger
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/*
          Le bouton « Régénérer les documents » a été retiré.

          La production ne se demande plus : elle a lieu au règlement, et de nouveau
          quand l'attestation de dépôt de capital arrive - c'est ce dépôt qui date les
          actes, du jour où la banque l'a délivrée. Un bouton laissait croire qu'il
          fallait y penser, et invitait à reproduire des actes que l'avocat était en
          train de relire.
        */}

      </div>

      {/*
        ---------- La signature ----------

        Elle n'apparaît qu'une fois l'attestation de dépôt de capital au dossier : c'est
        elle qui date les actes, et signer avant ferait signer des actes que la
        re-datation reproduira - donc signer deux fois. Le suivi, à droite, dit où l'on
        en est de cette attente.
      */}
      {attestationRecue && (
        <>
          <div className={styles.genSection}>
            <div className={styles.genSectionHead}>
              <p className={styles.genSectionLabel}>Signature</p>
              <p className={styles.genSectionSub}>
                Chaque signataire reçoit son propre lien par email
              </p>
            </div>

            {signataires.length > 0 ? (
              <p className={styles.actesVide}>
                {signataires.map((s) => s.nom + " (" + s.email + ")").join(", ")}.
              </p>
            ) : (
              <p className={styles.actesVide}>
                Aucun signataire : renseignez l&apos;adresse email des associés à l&apos;étape «
                Associés ».
              </p>
            )}

            {sansEmail.length > 0 && signataires.length > 0 && (
              <p role="alert">
                {sansEmail.length} associé(s) sans adresse email ne recevront pas de demande.
              </p>
            )}

            {/*
          La signature s'ouvre quand l'avocat a rendu les actes.

          On ne signe pas ce qu'il n'a pas relu, et c'est sa validation qui accorde la
          mise en signature. Le serveur le refuse aussi : un écran se contourne, et la
          demande part par courriel avec un jeton d'accès.
        */}
            {enRelecture.length > 0 && (
              <p className={styles.actesRelecture} role="status">
                La signature s&apos;ouvrira dès que votre avocat aura validé vos actes.
              </p>
            )}

            <div className={styles.actesEntete}>
              <button
                type="button"
                className={styles.actesBouton}
                onClick={ouvrirSignatures}
                /* Rien à signer tant que rien n'est produit, rien qui ne soit relu, et
               personne à qui l'envoyer sans adresse email. */
                disabled={
                  enCours ||
                  actes.length === 0 ||
                  signataires.length === 0 ||
                  enRelecture.length > 0
                }
              >
                Demander les signatures
              </button>
            </div>
          </div>
        </>
      )}

      {/*
        ---------- Les échanges avec le cabinet ----------

        Ici vivait « Note pour l'avocat (optionnel) », une zone de texte enregistrée
        dans le brouillon et qu'aucun écran d'avocat n'affichait : le client croyait
        écrire à quelqu'un, personne ne lisait.

        La messagerie du dossier, elle, existe et fonctionne - texte, pièces jointes,
        horodatage, temps réel, et l'avocat assigné y a accès. Le parcours n'a donc pas
        à porter un second fil : il dit qu'on a écrit, et il y mène.
      */}
      <Echanges dossierId={dossierId} dernierMot={dernierMot} />

      {message && (
        <p role={message.ok ? "status" : "alert"} aria-live="polite">
          {message.texte}
        </p>
      )}


      {acteApercu?.fichier && (
        <Apercu
          nom={acteApercu.nom}
          fichier={acteApercu.fichier}
          surFermeture={() => setApercuDe(null)}
        />
      )}
    </div>
  );
}

export interface DernierMot {
  message: {
    auteur: string;
    contenu: string;
    /** La nature de la demande : une pièce réclamée, une correction. */
    type: string | null;
    aUnePieceJointe: boolean;
    envoyeLe: string;
  } | null;
  nonLus: number;
}

/**
 * Ce que le cabinet a écrit, et par où répondre.
 *
 * Un client qui remplit son dossier ne va pas voir sa messagerie de lui-même : la
 * demande d'une pièce y dormait sans que rien ici ne la signale. Le dernier message
 * paraît donc à l'endroit où l'on travaille, avec sa date, et le bouton mène au fil -
 * où l'on répond, où l'on joint, et où tout reste.
 */
function Echanges({ dossierId, dernierMot }: { dossierId: number; dernierMot: DernierMot }) {
  const [ouverte, setOuverte] = useState(false);
  const { message, nonLus } = dernierMot;
  const nature = message?.type ? presentation(message.type) : null;

  return (
    <section className={styles.echanges} aria-label="Échanges avec le cabinet">
      <div className={styles.echangesTete}>
        <p className={styles.echangesTitre}>Échanges avec le cabinet</p>
        {nonLus > 0 && (
          <span className={styles.echangesNonLus}>
            {nonLus === 1 ? "1 message non lu" : nonLus + " messages non lus"}
          </span>
        )}
      </div>

      {message ? (
        <blockquote className={styles.echangesMot}>
          <span className={styles.echangesQui}>
            {message.auteur}
            <time dateTime={message.envoyeLe}>{dateHeureLongue(new Date(message.envoyeLe))}</time>
            {/*
              La nature de la demande, quand elle en est une.

              Un type inconnu retombe sur la présentation d'un message ordinaire : la
              pastille dirait alors « Message » à côté du nom de son auteur, ce qui
              n'apprend rien. Seuls les tons qui appellent un geste s'affichent.
            */}
            {nature && nature.ton !== "neutre" && (
              <span
                className={styles.echangesNature}
                style={{ background: nature.fond, color: nature.encre }}
              >
                {nature.libelle}
              </span>
            )}
          </span>
          <span className={styles.echangesTexte}>
            {message.contenu || (message.aUnePieceJointe ? "Une pièce jointe vous attend." : "")}
          </span>
        </blockquote>
      ) : (
        <p className={styles.echangesVide}>
          Une question, une précision sur votre situation ? Écrivez au cabinet : vous pouvez
          joindre un document, et tout reste au dossier.
        </p>
      )}

      {/*
        On écrit sans quitter son dossier.

        Le bouton menait droit à la messagerie : on perdait l'écran qu'on remplissait
        pour une phrase à écrire. La fenêtre envoie par la même route, pièce jointe
        comprise, et garde le lien vers le fil pour qui veut tout relire.
      */}
      <div className={styles.echangesGestes}>
        <button type="button" className={styles.echangesBouton} onClick={() => setOuverte(true)}>
          {message ? "Répondre" : "Écrire au cabinet"}
        </button>
        <Link href={"/messagerie?dossier=" + dossierId} className={styles.echangesFil}>
          Voir la conversation
        </Link>
      </div>

      {ouverte && (
        <EcrireAuCabinet dossierId={dossierId} surFermeture={() => setOuverte(false)} />
      )}
    </section>
  );
}
