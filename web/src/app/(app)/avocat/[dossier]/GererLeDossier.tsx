"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Historique, type EntreeDuJournal } from "./Historique";
import styles from "../Avocat.module.css";

type Geste = "corrections" | "refus" | "dessaisissement" | "invitation";

interface Formulaire {
  titre: string;
  detail: string;
  label: string;
  exemple: string;
  bouton: string;
  /** Le champ est-il obligatoire ? Un motif de dessaisissement ne l'est pas. */
  exige: boolean;
  envoyer: (texte: string) => Promise<Response>;
  succes: string;
}

/**
 * Ce qu'un avocat fait du dossier lui-même, et non de son travail.
 *
 * Ces gestes vivaient dans une barre sous la carte du dossier, entre deux boutons qui
 * ouvraient des lectures - l'avis à publier, le journal. Ils n'ont rien à voir : les uns
 * changent la main qui tient le dossier, les autres se consultent. La barre disparaît,
 * et le menu monte en tête d'écran, à côté du retour à la liste - là où l'on décide de
 * ce qu'on fait du dossier plutôt que de ce qu'on y fait.
 *
 * Le journal les rejoint : c'est une lecture rare, qui n'a pas à tenir un bouton pour
 * elle seule. Sa fenêtre est sœur du menu, non sa fille - refermer le menu au clic la
 * démonterait aussitôt.
 */
export function GererLeDossier({
  dossier,
  entreesDuJournal,
}: {
  dossier: number;
  entreesDuJournal: EntreeDuJournal[];
}) {
  const [menuOuvert, setMenuOuvert] = useState(false);
  const [fenetre, setFenetreBrute] = useState<Geste | null>(null);
  const [journalOuvert, setJournalOuvert] = useState(false);
  const [motif, setMotif] = useState("");
  const [refus, setRefus] = useState<string | null>(null);
  const [retour, setRetour] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const router = useRouter();

  const GESTES: Record<Geste, Formulaire> = {
    corrections: {
      titre: "Demander des corrections au client",
      detail:
        "Le dossier repasse de son côté et il en est prévenu par courriel. Ce que vous écrivez ici est ce qu'il lira : dites ce qui cloche et ce que vous attendez de lui.",
      label: "Ce que le client doit reprendre",
      exemple:
        "Le justificatif de jouissance est au nom d'un tiers : il nous faut un bail ou une attestation au nom de la société.",
      bouton: "Envoyer la demande",
      exige: true,
      envoyer: (texte) =>
        fetch("/api/avocat/dossier", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dossier, etat: "corrections_demandees", commentaire: texte }),
        }),
      succes: "Le client est prévenu de ce qu'il doit reprendre.",
    },
    refus: {
      titre: "Refuser le dossier",
      detail:
        "Le dossier est refusé et le client en est prévenu, avec votre motif. Il reste modifiable : s'il reprend ce qui bloque, il repartira en vérification.",
      label: "Le motif du refus",
      exemple:
        "L'objet social déclaré suppose un agrément que la société n'a pas : le greffe refusera l'immatriculation en l'état.",
      bouton: "Refuser le dossier",
      exige: true,
      envoyer: (texte) =>
        fetch("/api/avocat/dossier", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dossier, etat: "rejete", commentaire: texte }),
        }),
      succes: "Le dossier est refusé : le client a reçu votre motif.",
    },
    dessaisissement: {
      titre: "Me retirer du dossier",
      detail:
        "Le dossier repart dans la file : le premier avocat disponible le reprend. Votre client est prévenu qu'il change de mains. Ce que vous écrivez ici n'est lu que par nous.",
      label: "Pourquoi vous vous retirez",
      exemple: "Conflit d'intérêts : le siège est celui d'un autre de mes clients.",
      bouton: "Me retirer",
      exige: false,
      envoyer: (texte) =>
        fetch("/api/avocat/dessaisissement", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dossier, motif: texte || undefined }),
        }),
      succes: "Vous n'êtes plus sur ce dossier : il repart dans la file.",
    },
    invitation: {
      titre: "Inviter un avocat sur le dossier",
      detail:
        "Il pourra le lire et y travailler avec vous, et il en est prévenu par courriel. Vous en restez l'avocat responsable.",
      label: "L'adresse de l'avocat",
      exemple: "prenom.nom@exemple.fr",
      bouton: "Inviter",
      exige: true,
      envoyer: (texte) =>
        fetch("/api/avocat/invitations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dossier, courriel: texte }),
        }),
      succes: "L'avocat est invité : il voit le dossier dans sa liste.",
    },
  };

  /* Ouvrir ou fermer une fenêtre efface ce que la précédente avait à dire. */
  function setFenetre(geste: Geste | null) {
    setFenetreBrute(geste);
    setRefus(null);
    setMotif("");
  }

  function envoyerLeGeste() {
    if (!fenetre) return;
    const forme = GESTES[fenetre];
    const texte = motif.trim();
    if (forme.exige && !texte) return;

    setRefus(null);
    demarrer(async () => {
      const reponse = await forme.envoyer(texte);
      const corps = await reponse.json().catch(() => ({}));

      if (!reponse.ok) {
        setRefus(corps.error ?? "Le geste n'a pas abouti.");
        return;
      }
      setFenetre(null);
      setRetour(forme.succes);
      router.refresh();
    });
  }

  return (
    <span className={styles.menuGestes}>
      <button
        type="button"
        className={styles.situationGerer}
        onClick={() => setMenuOuvert((ouvert) => !ouvert)}
        disabled={enCours}
        aria-expanded={menuOuvert}
        aria-haspopup="menu"
      >
        Gérer le dossier
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {menuOuvert && (
        <>
          {/*
            Un voile sans teinte : il ferme le menu au clic dehors, ce qu'un menu doit
            faire, sans assombrir la page derrière pour trois lignes.
          */}
          <div
            className={styles.menuVoile}
            onClick={() => setMenuOuvert(false)}
            aria-hidden="true"
          />

          <div className={styles.menuGestesListe} role="menu">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOuvert(false);
                setJournalOuvert(true);
              }}
            >
              Voir l&apos;historique
            </button>

            {/*
              Demander des corrections n'est pas écrire au client.

              Le fil, en bas de page, envoie un message et le dossier reste dans la file
              du cabinet. Ce geste-ci le rend au client : il repasse de son côté, il en
              est prévenu par courriel, et son espace lui dit ce qu'il doit reprendre.
            */}
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOuvert(false);
                setFenetre("corrections");
              }}
            >
              Demander des corrections au client
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOuvert(false);
                setFenetre("invitation");
              }}
            >
              Inviter un avocat
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOuvert(false);
                setFenetre("dessaisissement");
              }}
            >
              Me retirer du dossier
            </button>

            {/* Refuser sort du dossier pour de bon : il se sépare et se teinte. */}
            <button
              type="button"
              role="menuitem"
              className={styles.menuGestesRupture}
              onClick={() => {
                setMenuOuvert(false);
                setFenetre("refus");
              }}
            >
              Refuser le dossier
            </button>
          </div>
        </>
      )}

      {journalOuvert && (
        <>
          <div
            className={styles.voile}
            onClick={() => setJournalOuvert(false)}
            aria-hidden="true"
          />

          <div
            className={`${styles.fenetreEtapes} ${styles.fenetreLarge}`}
            role="dialog"
            aria-modal="true"
            aria-label="L'historique du dossier"
          >
            <div className={styles.fenetreEtapesTete}>
              <h2 className={styles.fenetreEtapesTitre}>L&apos;historique du dossier</h2>
              <button
                type="button"
                className={styles.fenetreEtapesFermer}
                onClick={() => setJournalOuvert(false)}
                aria-label="Fermer"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <Historique entrees={entreesDuJournal} />
          </div>
        </>
      )}

    {fenetre && (
      <>
        {/* Le voile ne masque pas la liste : on écrit en regardant ce qui cloche. */}
        <div className={styles.voile} onClick={() => setFenetre(null)} aria-hidden="true" />

        <div
          className={styles.fenetreCorrections}
          role="dialog"
          aria-modal="true"
          aria-label={GESTES[fenetre].titre}
        >
          <h3 className={styles.fenetreCorrectionsTitre}>{GESTES[fenetre].titre}</h3>
          <p className={styles.fenetreCorrectionsDetail}>{GESTES[fenetre].detail}</p>

          <label className={styles.fenetreCorrectionsLabel} htmlFor="motif-du-geste">
            {GESTES[fenetre].label}
          </label>
          {/*
            Une adresse tient sur une ligne ; un motif, non. Le champ suit ce qu'on
            lui demande d'écrire.
          */}
          {fenetre === "invitation" ? (
            <input
              id="motif-du-geste"
              type="email"
              className={styles.fenetreCorrectionsChamp}
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              autoFocus
              placeholder={GESTES[fenetre].exemple}
            />
          ) : (
            <textarea
              id="motif-du-geste"
              className={styles.fenetreCorrectionsChamp}
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              rows={4}
              maxLength={1000}
              autoFocus
              placeholder={GESTES[fenetre].exemple}
            />
          )}

          {/*
            Le refus se lit dans la fenêtre qui l'a provoqué.
            
            Il s'affichait au bas de la page, sous les tâches : la fenêtre le
            masquait, et l'on recliquait sur un bouton qui semblait ne rien faire.
          */}
          {refus && (
            <p className={styles.fenetreCorrectionsRefus} role="alert">
              {refus}
            </p>
          )}

          <div className={styles.fenetreCorrectionsActions}>
            <button
              type="button"
              className={styles.travailSecondaire}
              onClick={() => setFenetre(null)}
              disabled={enCours}
            >
              Annuler
            </button>
            <button
              type="button"
              className={styles.travailPrincipal}
              onClick={envoyerLeGeste}
              disabled={enCours || (GESTES[fenetre].exige && !motif.trim())}
            >
              {enCours ? "Envoi" : GESTES[fenetre].bouton}
            </button>
          </div>
        </div>
      </>
    )}

      {retour && (
        <p className={styles.travailRetour} role="status">
          {retour}
        </p>
      )}
    </span>
  );
}
