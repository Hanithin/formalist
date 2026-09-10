"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { dateHeureLongue, dateHeureCourte } from "@/lib/dates";
import { presentation } from "@/domain/messagerie/messages";
import { EcrireAuCabinet } from "./EcrireAuCabinet";
import { useRouter } from "next/navigation";
import { A_RELIRE } from "@/domain/document/publication";
import { nomDeLaPartie } from "@/domain/formalite/etat-civil";
import {
  dateDuJalon,
  libelleJalon,
  motifLisible,
  peutRelancer,
  type JalonEnvoi,
  type SuiviDemande,
} from "@/domain/formalite/signature";
import type { Brouillon } from "@/domain/formalite/parcours";
import { Apercu } from "./Apercu";
import { DepotDuCapital } from "./DepotDuCapital";
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
  /** Corriger l'adresse d'un signataire sans quitter l'écran. */
  surEmail: (rang: number, email: string) => void;
}

/** « Jean Dupont » donne « JD » ; un nom seul donne sa première lettre. */
function initiales(nom: string): string {
  const mots = nom.trim().split(/\s+/).filter(Boolean);
  if (mots.length === 0) return "?";
  const premiere = mots[0][0] ?? "";
  const derniere = mots.length > 1 ? (mots[mots.length - 1][0] ?? "") : "";
  return (premiere + derniere).toUpperCase();
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

/**
 * Une demande de signature telle que l'API la rend.
 *
 * Les dates y passent en texte : JSON n'a pas de type date. On les rétablit à la
 * lecture, sans quoi les règles du domaine compareraient des chaînes.
 */
interface Suivi extends SuiviDemande {
  rang: number;
  jalon: JalonEnvoi;
}

function versSuivi(brut: Record<string, unknown>): Suivi {
  const date = (v: unknown) => (typeof v === "string" ? new Date(v) : null);
  return {
    id: Number(brut.id),
    rang: Number(brut.rang),
    nom: String(brut.nom ?? ""),
    email: String(brut.email ?? ""),
    ouverteLe: date(brut.ouverteLe),
    signeeLe: date(brut.signeeLe),
    envoyeLe: date(brut.envoyeLe),
    remisLe: date(brut.remisLe),
    mailOuvertLe: date(brut.mailOuvertLe),
    motif: typeof brut.motif === "string" ? brut.motif : null,
    relances: Number(brut.relances ?? 0),
    jalon: brut.jalon as JalonEnvoi,
  };
}

/** La pastille et sa teinte : fait, en route, ou rien n'est arrivé. */
function tonDuJalon(jalon: JalonEnvoi): string {
  if (jalon === "signee") return "suiviFait";
  if (jalon === "lien_ouvert" || jalon === "mail_ouvert" || jalon === "remis") {
    return "suiviEnRoute";
  }
  if (jalon === "echec" || jalon === "rejete") return "suiviManque";
  return "";
}

export function Actes({
  dossierId,
  brouillon,
  actes,
  dernierMot,
  attestationRecue,
  surEmail,
}: Props) {
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);
  /* La fenêtre d'aperçu ne retient que le nom de l'acte, pas son fichier.
     L'original re-sollicitait un aperçu ouvert après une régénération (« If a preview
     is currently open, re-fetch it with fresh data ») ; comme l'acte reproduit porte
     un nouveau nom de stockage, déduire le fichier du nom à chaque rendu suffit à
     obtenir le même comportement, et la fenêtre ne peut pas montrer une version
     périmée. */
  const [apercuDe, setApercuDe] = useState<string | null>(null);
  /*
   * Où en est chaque demande partie.
   *
   * Ces lignes existaient en base - dates d'envoi, d'ouverture, de signature - et aucun
   * écran ne les lisait : le bloc annonçait « chacun reçoit son lien par email » puis
   * se taisait. On les relit après chaque geste, et au retour sur l'écran : une
   * signature arrive pendant qu'on regarde ailleurs.
   */
  const [demandes, setDemandes] = useState<Suivi[] | null>(null);
  const [relance, setRelance] = useState<number | null>(null);
  /* L'échec de production se dit sous le bouton qui l'a déclenché. Au bas de la page,
     sous la note à l'avocat, personne ne le lit. */
  const [enCours, demarrer] = useTransition();
  const router = useRouter();

  /*
   * Des actes produits, aucun qui attende encore l'avocat - et un dossier confié.
   *
   * La dernière condition n'est pas une précaution de plus : un acte produit avant le
   * règlement naît « generated », non « à relire ». Sans elle, un brouillon qui a
   * produit ses actes s'entendrait dire qu'ils sont validés et serait envoyé à sa
   * banque avec des statuts que personne n'a lus.
   */
  const actesRendus =
    !!brouillon.paye && actes.length > 0 && actes.every((a) => a.statut !== A_RELIRE);

  const associes = brouillon.associes ?? [];

  /*
   * Ceux qui doivent signer, avec ou sans adresse.
   *
   * La liste ne retenait que les associés joignables : celui dont l'adresse manquait
   * disparaissait de l'écran, remplacé par un décompte en bas de bloc. Il faut au
   * contraire le voir, puisque c'est ici qu'on renseigne son adresse - le rang le relie
   * à l'associé du dossier, et c'est lui qu'on modifie.
   */
  const destinataires = associes
    .map((a, rang) => ({
      rang,
      nom: nomDeLaPartie(a),
      email: a.personne?.email?.trim() ?? "",
    }))
    .filter((d) => d.nom);

  /** Ceux à qui la demande partira vraiment. */
  const signataires = destinataires.filter((d) => d.email);

  /* Des demandes sont-elles en circulation ? Le bouton d'ouverture ne dit pas la même
     chose selon la réponse : la seconde fois, il détruit ce qui est déjà parti. */
  const circuitOuvert = (demandes?.length ?? 0) > 0;

  /* Plus rien à demander quand tout le monde a signé : rouvrir le circuit ne créerait
     aucune demande, et le bouton n'aurait plus qu'à annoncer qu'il n'a rien fait. */
  const tousOntSigne = circuitOuvert && (demandes ?? []).every((d) => d.signeeLe);

  /* Les actes que l'avocat n'a pas encore relus : ils s'affichent, sans s'ouvrir. */
  const enRelecture = actes.filter((a) => a.statut === A_RELIRE);

  /*
   * On relit le suivi à l'ouverture de l'écran, puis après chaque geste.
   *
   * Pas de rafraîchissement continu : une signature qui arrive pendant qu'on regarde
   * l'écran est un cas rare, et interroger le serveur toutes les dix secondes pour
   * l'attraper coûterait plus qu'il ne rapporte. Revenir sur l'écran suffit.
   */
  const relireLeSuivi = useCallback(async () => {
    if (!attestationRecue) return;
    try {
      const reponse = await fetch("/api/signature?dossier=" + dossierId);
      if (!reponse.ok) return;
      const corps = (await reponse.json()) as { demandes?: Record<string, unknown>[] };
      setDemandes((corps.demandes ?? []).map(versSuivi));
    } catch {
      /* Le suivi qui ne se charge pas ne casse pas l'écran : le bloc reste ce qu'il
         était avant, avec son bouton. */
    }
  }, [dossierId, attestationRecue]);

  useEffect(() => {
    /* L'appel passe par une fonction asynchrone, comme partout ici : l'état ne se pose
       pas dans le corps de l'effet, mais quand la réponse arrive. */
    void (async () => {
      await relireLeSuivi();
    })();
  }, [relireLeSuivi]);

  /** Renvoie le lien à une personne, sans toucher aux jetons des autres. */
  function relancer(demande: Suivi) {
    setMessage(null);
    setRelance(demande.id);

    demarrer(async () => {
      try {
        const reponse = await fetch("/api/signature/relance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          /* L'adresse part telle qu'elle est à l'écran : c'est souvent qu'on vient de
             la corriger, et relancer à l'ancienne serait sans objet. */
          body: JSON.stringify({
            demande: demande.id,
            email: destinataires.find((d) => d.rang === demande.rang)?.email || undefined,
          }),
        });
        const corps = (await reponse.json().catch(() => ({}))) as {
          error?: string;
          parti?: boolean;
          simule?: boolean;
        };

        if (!reponse.ok) {
          setMessage({ ok: false, texte: corps.error ?? "La relance n'a pas abouti" });
          return;
        }

        setMessage({
          ok: true,
          texte: corps.simule
            ? "Relance simulée : aucune clé d'envoi n'est configurée sur cette machine."
            : "Le lien est reparti à " + demande.nom + ".",
        });
      } finally {
        setRelance(null);
        await relireLeSuivi();
      }
    });
  }

  function ouvrirSignatures() {
    setMessage(null);

    demarrer(async () => {
      const reponse = await fetch("/api/signature", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dossier: dossierId,
          signataires: signataires.map((s) => ({ nom: s.nom, email: s.email })),
        }),
      });
      const corps = (await reponse.json().catch(() => ({}))) as {
        error?: string;
        courrielsPartis?: number;
        simules?: number;
      };

      if (!reponse.ok) {
        setMessage({ ok: false, texte: corps.error ?? "L'ouverture des signatures a échoué" });
        return;
      }

      /*
       * On dit ce qui s'est passé, sans alarmer pour un fonctionnement normal.
       *
       * Le message d'échec - « aucun courriel n'est parti, prévenez le cabinet » -
       * s'affichait aussi en développement, où aucune clé d'envoi n'est configurée et
       * où rien ne doit partir. C'était le cas le plus fréquent, en rouge, pour un
       * circuit qui marchait. Et en cas de vrai refus, prévenir le cabinet n'est plus
       * le recours : le suivi ci-dessus porte le motif et le bouton qui relance.
       */
      const partis = corps.courrielsPartis ?? 0;
      const simules = corps.simules ?? 0;

      setMessage(
        partis > 0
          ? {
              ok: true,
              texte:
                partis > 1
                  ? partis + " liens de signature sont partis."
                  : "Le lien de signature est parti.",
            }
          : simules > 0
            ? {
                ok: true,
                texte:
                  "Demandes créées. Aucune clé d'envoi sur cette machine : les messages " +
                  "sont simulés, et les liens s'ouvrent depuis le journal du serveur.",
              }
            : {
                ok: false,
                texte: "Aucun message n'est parti. Le détail est sur la ligne de chacun.",
              }
      );

      await relireLeSuivi();
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
        {actes.length === 0 && brouillon.paye ? (
          <EnProduction />
        ) : actes.length === 0 ? (
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
        Ce qu'on fait des actes qu'on vient de télécharger.

        Le suivi nommait le geste dans la colonne de droite, sans dire comment s'y
        prendre ; il se pose ici, sous les documents à porter à la banque.
      */}
      {actesRendus && !attestationRecue && <DepotDuCapital dossierId={dossierId} />}

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

            {/*
              Les signataires se lisent un par un.

              Ils tenaient dans une phrase - « Jean Dupont (jean@…), Claire Martin
              (claire@…). » - qu'il fallait relire deux fois pour vérifier une adresse,
              et c'est précisément ce qu'on vient y faire : la demande part par courriel,
              une adresse fausse est une signature qui n'arrive jamais.
            */}
            {destinataires.length > 0 ? (
              <ul className={styles.signataires}>
                {destinataires.map((d) => {
                  /* La demande partie pour cette personne, s'il y en a une. Le rang la
                     relie à l'associé du dossier, comme partout ailleurs ici. */
                  const suivi = demandes?.find((s) => s.rang === d.rang);
                  const jalon = suivi?.jalon;
                  const quand = suivi ? dateDuJalon(suivi) : null;

                  return (
                    <li key={d.rang} className={styles.signataire}>
                      <span className={styles.signataireInitiales} aria-hidden="true">
                        {initiales(d.nom)}
                      </span>
                      <label
                        className={styles.signataireNom}
                        htmlFor={"signataire-email-" + d.rang}
                      >
                        {d.nom}
                      </label>

                      {/*
                        L'adresse de qui a signé ne se corrige plus.

                        Il n'y a plus rien à lui envoyer, et un champ ouvert laisserait
                        croire qu'on peut encore changer quelque chose à sa signature.
                      */}
                      {suivi?.signeeLe ? (
                        <span className={styles.suiviAdresse}>{d.email}</span>
                      ) : (
                        /*
                          L'adresse se corrige ici.
                          C'est le moment où on la relit - juste avant que la demande ne
                          parte - et retourner à l'étape des associés pour une faute de
                          frappe fait perdre l'endroit où l'on était.
                        */
                        <input
                          id={"signataire-email-" + d.rang}
                          type="email"
                          className={styles.signataireChamp}
                          value={d.email}
                          placeholder="adresse@exemple.fr"
                          autoComplete="off"
                          aria-label={"Adresse email de " + d.nom}
                          onChange={(e) => surEmail(d.rang, e.target.value)}
                        />
                      )}

                      {/*
                        Où en est sa demande, datée, et le geste qui la reprend.

                        Les deux tiennent dans une largeur fixe, à droite : sans elle,
                        l'état d'une ligne signée - qui n'a pas de bouton - glissait
                        jusqu'au bord et ne s'alignait avec aucune autre. On lit une
                        colonne, pas un escalier.

                        Rien tant qu'aucune demande n'est partie : une colonne d'états
                        vides avant le premier envoi n'apprend rien et prend la place.
                      */}
                      {suivi && jalon && (
                        <span className={styles.suiviFin}>
                          <span
                            className={[styles.suiviEtat, styles[tonDuJalon(jalon)]]
                              .filter(Boolean)
                              .join(" ")}
                          >
                            <span className={styles.suiviPastille} aria-hidden="true" />
                            {libelleJalon(jalon)}
                            {quand ? " le " + dateHeureCourte(quand) : ""}
                          </span>

                          {!suivi.signeeLe && (
                            <button
                              type="button"
                              className={styles.suiviRelance}
                              onClick={() => relancer(suivi)}
                              /* Pas deux fois dans la minute : un double clic ne doit
                                 pas poster deux messages identiques à quelqu'un qui n'a
                                 pas eu le temps d'ouvrir le premier. */
                              disabled={enCours || !peutRelancer(suivi)}
                            >
                              {relance === suivi.id ? "Envoi…" : "Relancer"}
                            </button>
                          )}
                        </span>
                      )}

                      {/* La phrase du fournisseur, là où on peut la corriger - et rien
                          quand elle ne ferait que redire le libellé en anglais. */}
                      {suivi && motifLisible(suivi) && (
                        <span className={styles.suiviMotif}>{motifLisible(suivi)}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className={styles.actesVide}>
                Aucun signataire : renseignez l&apos;adresse email des associés à l&apos;étape «
                Associés ».
              </p>
            )}

            {/* Le reproche se lit à côté du champ vide, non en bas du bloc. */}
            {destinataires.some((d) => !d.email) && (
              <p className={styles.signatairesManquants} role="status">
                Une adresse manque : la demande ne peut pas partir tant qu&apos;elle n&apos;est pas
                renseignée.
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

            {/*
              Le circuit se rouvre, il ne se répète pas.

              Le bouton crée les demandes et supprime celles qui ne sont pas signées :
              cliquer une seconde fois invalide les jetons en circulation. Tant qu'il
              disait « Demander les signatures » après un envoi, il invitait à le faire.
              Pour renvoyer à quelqu'un, c'est « Relancer », sur sa ligne.
            */}
            <div className={styles.signatureAction}>
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
                  enRelecture.length > 0 ||
                  tousOntSigne
                }
              >
                {circuitOuvert ? "Reprendre le circuit à zéro" : "Demander les signatures"}
              </button>
              {signataires.length > 0 && enRelecture.length === 0 && (
                <span className={styles.signaturePrecision}>
                  {tousOntSigne
                    ? "Tout le monde a signé"
                    : circuitOuvert
                      ? "De nouveaux liens partent, et les précédents cessent de fonctionner"
                      : signataires.length > 1
                        ? signataires.length + " liens partent maintenant, un par personne"
                        : "Le lien part maintenant"}
                </span>
              )}
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
          Une question, une précision sur votre situation ? Écrivez au cabinet : vous pouvez joindre
          un document, et tout reste au dossier.
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

      {ouverte && <EcrireAuCabinet dossierId={dossierId} surFermeture={() => setOuverte(false)} />}
    </section>
  );
}

/* Le temps d'un aller-retour en base, sans marteler le serveur. */
const REPOS_MS = 2_000;
/* Au-delà, la production a échoué : on arrête d'interroger et on le dit. */
const PATIENCE_MS = 60_000;

/**
 * L'attente pendant que les actes se produisent.
 *
 * Le règlement se confirme par deux chemins - le retour du client depuis Stripe et
 * l'avis du relais - et celui qui arrive second ressort aussitôt, sans attendre. Quand
 * le relais gagne la course, il marque le dossier réglé et fabrique les six actes
 * pendant que la page, elle, se rend sur une liste encore vide. Il fallait recharger.
 *
 * `router.refresh()` rejoue le composant serveur : la base est relue, la position dans
 * la page est gardée, et aucune route nouvelle n'est nécessaire. On s'arrête au bout
 * d'une minute - une production ratée ne doit pas faire tourner un compteur devant
 * quelqu'un qui attend.
 */
function EnProduction() {
  const router = useRouter();
  const [renonce, setRenonce] = useState(false);

  useEffect(() => {
    if (renonce) return;

    const rappel = setInterval(() => router.refresh(), REPOS_MS);
    const limite = setTimeout(() => setRenonce(true), PATIENCE_MS);

    return () => {
      clearInterval(rappel);
      clearTimeout(limite);
    };
  }, [router, renonce]);

  return (
    <div className={styles.actesEnProduction}>
      <MachineAEcrire />
      <p className={styles.actesEnProductionTexte}>
        {renonce ? (
          <>
            La production prend plus de temps que prévu. Vos actes ne sont pas perdus - le cabinet
            les voit de son côté.{" "}
            <button
              type="button"
              className={styles.actesRelance}
              onClick={() => {
                setRenonce(false);
                router.refresh();
              }}
            >
              Regarder à nouveau
            </button>
          </>
        ) : (
          <>
            Vos actes sont en cours de rédaction.
            <br />
            Ils apparaîtront ici dans quelques secondes, sans rien recharger.
          </>
        )}
      </p>
    </div>
  );
}

/**
 * Une machine à écrire qui sort ses feuilles.
 *
 * Trois feuilles se suivent derrière le rouleau et montent à travers la fente ; le
 * découpage s'arrête à la ligne du rouleau, si bien qu'une feuille au repos est
 * entièrement cachée dessous. C'est ce que fait l'application à cet instant, et cela se
 * regarde mieux qu'un disque qui tourne.
 */
function MachineAEcrire() {
  return (
    <svg
      className={styles.machine}
      width="72"
      height="58"
      viewBox="0 0 72 58"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <clipPath id="fenteDeLaMachine">
          <rect x="12" y="0" width="48" height="27" />
        </clipPath>
      </defs>

      <g clipPath="url(#fenteDeLaMachine)">
        {[styles.feuille1, styles.feuille2, styles.feuille3].map((rang, i) => (
          <g key={rang} className={`${styles.feuille} ${rang}`}>
            <rect x="21" y="27" width="30" height="24" rx="1.5" fill="#fff" stroke="#d4d4d8" />
            {/* Deux lignes frappées : la page n'est pas vide quand elle sort. */}
            <rect x="25" y="32" width="18" height="1.5" rx="0.75" fill="#d4d4d8" />
            <rect x="25" y="36" width={[22, 14, 19][i]} height="1.5" rx="0.75" fill="#d4d4d8" />
          </g>
        ))}
      </g>

      {/*
        Le rouleau et ses molettes : c'est ce qui fait lire une machine à écrire plutôt
        qu'une imprimante. Sans elles, le dessin est un bloc d'où sort du papier.
      */}
      <rect x="13" y="25" width="46" height="8" rx="4" fill="#f4f4f5" stroke="#111" />
      <circle cx="13" cy="29" r="5" fill="#fff" stroke="#111" />
      <circle cx="59" cy="29" r="5" fill="#fff" stroke="#111" />

      <g className={styles.chariot}>
        {/* Le corps, incliné comme le clavier d'une machine. */}
        <path
          d="M14 34h44l6 15a2 2 0 0 1-2 2.6H10A2 2 0 0 1 8 49z"
          fill="#f4f4f5"
          stroke="#111"
          strokeLinejoin="round"
        />

        {/* Deux rangs de touches, puis la barre d'espace. */}
        {[0, 1].map((rang) =>
          [0, 1, 2, 3, 4, 5].map((colonne) => (
            <circle
              key={rang + "-" + colonne}
              cx={23 + colonne * 5.2 + rang * 2.6}
              cy={39.5 + rang * 5}
              r="1.5"
              fill="#fff"
              stroke="#111"
              strokeWidth="0.9"
            />
          ))
        )}
        <rect x="22" y="47.5" width="28" height="2.6" rx="1.3" fill="#d4d4d8" />
      </g>
    </svg>
  );
}
