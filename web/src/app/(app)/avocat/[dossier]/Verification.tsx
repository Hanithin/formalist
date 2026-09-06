"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import styles from "../Avocat.module.css";

/**
 * Valider une pièce, ou en demander une autre.
 *
 * Les deux boutons n'avaient aucune mise en forme - leurs classes n'existaient pas
 * dans la feuille - et sortaient donc en boutons de navigateur, plus hauts que le lien
 * « Ouvrir » d'à côté, qu'ils repoussaient à la ligne. Ils portent maintenant la même
 * hiérarchie que partout ailleurs : la décision attendue en plein, le refus en creux.
 *
 * Le motif est obligatoire au refus : « document refusé » sans raison oblige le client
 * à écrire pour comprendre ce qu'on attend de lui, et le dossier attend deux jours de
 * plus.
 */
export function Verification({
  documentId,
  dossier,
  decidee,
  partie = "principale",
  surFin,
}: {
  documentId: number;
  /** Le dossier, pour joindre une pièce d'exemple au fil de la demande. */
  dossier: number;
  /**
   * La pièce porte déjà une décision.
   *
   * On ne propose plus alors de statuer, mais de revenir dessus : une validation
   * donnée trop vite ne se reprenait pas, la pièce passait « Vérifié » et n'offrait
   * plus aucun geste.
   */
  decidee?: boolean;
  /** « principale » rend le geste qui avance, « repli » celui qui revient en arrière. */
  partie?: "principale" | "repli";
  /** Le geste a fini : le menu qui le porte peut se refermer, son voile avec. */
  surFin?: () => void;
}) {
  const [refus, setRefus] = useState(false);
  const [motif, setMotif] = useState("");
  const [piece, setPiece] = useState<File | null>(null);
  const [enCours, demarrer] = useTransition();
  const router = useRouter();

  function statuer(decision: "valider" | "refuser" | "reprendre", raison?: string) {
    demarrer(async () => {
      await fetch("/api/avocat/documents", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document: documentId, decision, motif: raison }),
      });

      /*
       * La pièce d'exemple part dans le fil, non dans la demande.
       *
       * Le refus écrit déjà un message au client avec le motif ; le fichier joint le
       * suit dans la même conversation, par le chemin qu'emprunte tout ce qu'on lui
       * envoie. Rien de neuf côté serveur, et le client le retrouve là où il lit le
       * reste.
       */
      if (decision === "refuser" && piece) {
        const corps = new FormData();
        corps.append("dossier", String(dossier));
        corps.append("fichier", piece);
        corps.append("contenu", "Un exemple de ce qui est attendu.");
        await fetch("/api/messages", { method: "POST", body: corps });
      }

      fermer();
      router.refresh();
    });
  }

  /* Refermer efface ce que la demande abandonnée avait commencé à dire. */
  function fermer() {
    setRefus(false);
    setMotif("");
    setPiece(null);
    /* Et le menu qui portait le geste se referme avec, son voile compris. */
    surFin?.();
  }

  if (decidee) {
    return (
      <button
        type="button"
        className={styles.decisionSecondaire}
        onClick={() => {
          surFin?.();
          statuer("reprendre");
        }}
        disabled={enCours}
      >
        {enCours ? "…" : "Revenir sur la validation"}
      </button>
    );
  }

  return (
    <>
      {/*
        Valider reste sur la rangée, demander une autre pièce passe dans le menu.

        C'est ce qu'on fait de chaque pièce déposée ; en demander une autre arrive quand
        celle-là ne convient pas, et la place que son libellé prenait sur la ligne
        empêchait la colonne des gestes de s'aligner d'une rangée à l'autre.
      */}
      {partie === "repli" ? (
        <button
          type="button"
          className={styles.decisionSecondaire}
          onClick={() => setRefus(true)}
          disabled={enCours}
        >
          Demander une autre pièce
        </button>
      ) : (
        <button
          type="button"
          className={styles.decisionPrincipale}
          onClick={() => statuer("valider")}
          disabled={enCours}
        >
          {enCours ? "…" : "Valider"}
        </button>
      )}

      {/*
        La demande se fait dans une fenêtre, non sur la ligne de la pièce.

        Le formulaire s'ouvrait dans la rangée : le champ, deux boutons et une phrase
        d'explication s'y ajoutaient aux gestes déjà là, et le nom du document se
        réduisait à « J… ». On écrivait ce que le client doit refaire sans plus voir de
        quelle pièce il s'agit.
      */}
      {refus && (
        <>
          <div className={styles.voile} onClick={fermer} aria-hidden="true" />

          <form
            className={styles.fenetreCorrections}
            role="dialog"
            aria-modal="true"
            aria-label="Demander une autre pièce"
            onSubmit={(e) => {
              e.preventDefault();
              statuer("refuser", motif);
            }}
          >
            <h3 className={styles.fenetreCorrectionsTitre}>Demander une autre pièce</h3>
            <p className={styles.fenetreCorrectionsDetail}>
              Le client est prévenu par courriel, reçoit un message reprenant ce que vous
              écrivez ici, et peut déposer une autre pièce. La pièce actuelle reste au
              dossier tant qu&apos;il n&apos;en a pas remis une.
            </p>

            <label className={styles.fenetreCorrectionsLabel} htmlFor={"motif-" + documentId}>
              Que doit redéposer le client ?
            </label>
            <textarea
              id={"motif-" + documentId}
              className={styles.fenetreCorrectionsChamp}
              rows={4}
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              placeholder="Le justificatif est au nom d'un tiers : il nous faut un bail ou une attestation au nom de la société."
              required
              autoFocus
            />

            {/*
              Un exemple vaut mieux qu'une description.

              Une pièce refusée l'est souvent parce que le client s'est trompé de
              document : lui montrer celui qu'on attend évite un troisième aller-retour.
            */}
            <label className={styles.demandePiece}>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                className={styles.champFichier}
                onChange={(e) => setPiece(e.target.files?.[0] ?? null)}
              />
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
              </svg>
              {piece ? piece.name : "Joindre un exemple, facultatif"}
            </label>

            <div className={styles.fenetreCorrectionsActions}>
              <button
                type="button"
                className={styles.decisionSecondaire}
                onClick={fermer}
                disabled={enCours}
              >
                Annuler
              </button>
              <button
                type="submit"
                className={styles.decisionRefuser}
                disabled={enCours || !motif.trim()}
              >
                {enCours ? "Envoi…" : "Demander"}
              </button>
            </div>
          </form>
        </>
      )}
    </>
  );
}
