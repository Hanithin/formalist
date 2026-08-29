"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { A_RELIRE } from "@/domain/document/publication";
import { nomDeLaPartie } from "@/domain/formalite/etat-civil";
import type { Brouillon } from "@/domain/formalite/parcours";
import { Champ } from "./EtatCivil";
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
  surNote: (texte: string) => void;
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

/** Les flèches circulaires du bouton de régénération, reprises de creation.html. */
function Rotation() {
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
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
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

export function Actes({ dossierId, brouillon, actes, surNote }: Props) {
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
  const [erreurActes, setErreurActes] = useState<string | null>(null);
  const [confirme, setConfirme] = useState(false);
  /* Les actes que la dernière production a reproduits : c'est ce que liste la
     fenêtre de confirmation. Vide tant qu'il n'y a rien à annoncer. */
  const [reproduits, setReproduits] = useState<string[] | null>(null);
  const [enCours, demarrer] = useTransition();
  const router = useRouter();

  // Les deux secondes de confirmation sur le bouton, puis retour à son état normal.
  useEffect(() => {
    if (!confirme) return;
    const minuteur = setTimeout(() => setConfirme(false), 2000);
    return () => clearTimeout(minuteur);
  }, [confirme]);

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

  function produire() {
    setErreurActes(null);
    setConfirme(false);

    demarrer(async () => {
      const reponse = await fetch("/api/formalites/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossier: dossierId }),
      });
      const corps = (await reponse.json().catch(() => ({}))) as {
        error?: string;
        etape?: number;
        documents?: { titre: string }[];
      };

      if (!reponse.ok) {
        setErreurActes(
          corps.etape
            ? "Le dossier est incomplet : reprenez à l'étape " + corps.etape + "."
            : (corps.error ?? "La production des documents a été interrompue")
        );
        return;
      }

      // Deux confirmations, l'une derrière l'autre : la fenêtre dit ce qui a été
      // reproduit, et le bouton garde la trace verte de l'original quand elle est
      // refermée.
      setConfirme(true);
      setReproduits((corps.documents ?? []).map((d) => d.titre));
      router.refresh();
    });
  }

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
            Aucun document produit pour l&apos;instant. Les statuts, la liste des souscripteurs et
            les déclarations sont générés à partir de ce que vous avez saisi.
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

        <div className={styles.genRegenLigne}>
          <button
            type="button"
            className={confirme ? `${styles.genRegen} ${styles.genRegenOk}` : styles.genRegen}
            onClick={produire}
            disabled={enCours || confirme}
          >
            {confirme ? (
              "Documents régénérés !"
            ) : (
              <>
                <Rotation />
                {enCours
                  ? "Régénération…"
                  : actes.length > 0
                    ? "Régénérer les documents"
                    : "Générer les documents"}
              </>
            )}
          </button>
        </div>

        {erreurActes && (
          <p className={styles.actesErreur} role="alert">
            {erreurActes}
          </p>
        )}
      </div>

      {/* ---------- La signature ---------- */}
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
            Aucun signataire : renseignez l&apos;adresse email des associés à l&apos;étape
            « Associés ».
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

      {/* ---------- Le mot à l'avocat ---------- */}
      <div className={styles.formGrid}>
        <Champ id="noteAvocat" libelle="Note pour l'avocat (optionnel)" pleineLargeur>
          <textarea
            id="noteAvocat"
            rows={4}
            placeholder="Une précision sur votre situation, une question à poser avant la relecture..."
            value={brouillon.noteAvocat ?? ""}
            onChange={(e) => surNote(e.target.value)}
          />
        </Champ>
      </div>

      {message && (
        <p role={message.ok ? "status" : "alert"} aria-live="polite">
          {message.texte}
        </p>
      )}

      {reproduits && (
        <Reproduits actes={reproduits} surFermeture={() => setReproduits(null)} />
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

/**
 * La fenêtre qui suit une production, et dit ce qu'elle a produit.
 *
 * Elle n'existait pas dans creation.html - la confirmation y tenait au bouton - mais
 * régénérer sans rien voir laissait douter que quelque chose se soit passé, la liste
 * se reconstruisant à l'identique. Elle nomme donc les actes reproduits.
 */
function Reproduits({ actes, surFermeture }: { actes: string[]; surFermeture: () => void }) {
  useEffect(() => {
    function auClavier(e: KeyboardEvent) {
      if (e.key === "Escape") surFermeture();
    }
    document.addEventListener("keydown", auClavier);
    return () => document.removeEventListener("keydown", auClavier);
  }, [surFermeture]);

  return (
    <div className={styles.apercuVoile} onClick={surFermeture}>
      <div
        className={styles.reproduitsFenetre}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reproduits-titre"
        onClick={(e) => e.stopPropagation()}
      >
        <span className={styles.reproduitsCoche} aria-hidden="true">
          <Coche />
        </span>

        <h3 className={styles.reproduitsTitre} id="reproduits-titre">
          {actes.length > 1 ? "Documents régénérés" : "Document régénéré"}
        </h3>

        <p className={styles.reproduitsSous}>
          {actes.length} document{actes.length > 1 ? "s" : ""} à relire avant signature.
        </p>

        <ul className={styles.reproduitsListe}>
          {actes.map((titre) => (
            <li key={titre}>{titre}</li>
          ))}
        </ul>

        <button
          type="button"
          className={`${styles.genBtn} ${styles.genBtnPrimaire}`}
          onClick={surFermeture}
          autoFocus
        >
          Fermer
        </button>
      </div>
    </div>
  );
}
