"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import styles from "../Avocat.module.css";

/**
 * L'attestation de parution, déposée depuis la liste des documents.
 *
 * Le cabinet publie l'avis et reçoit la preuve du journal : le greffe l'exige au dépôt,
 * et le client la garde dans ses documents. Elle se dépose aussi depuis le volet de
 * l'annonce, là où l'on vient de copier le texte publié - mais c'est ici qu'on la
 * cherche, avec les autres pièces du dossier, et une place en pointillé se lit comme
 * une place à remplir plutôt que comme une action de plus.
 */
export function DepotParution({
  dossier,
  attendues,
  deposees,
  ressorts,
  avis,
}: {
  dossier: number;
  /**
   * Combien d'attestations ce dossier appelle-t-il ?
   *
   * Une par parution. Un transfert qui change de département en fait paraître deux -
   * un avis dans celui de départ, un dans celui d'arrivée - et le journal délivre une
   * attestation pour chacune. La ligne disait « l'attestation » au singulier, et rien
   * n'avertissait qu'il en faudrait une seconde avant d'ouvrir le volet.
   */
  attendues: number;
  /**
   * Les rangs déjà déposés.
   *
   * La ligne disparaissait une fois déposée - et emportait le volet de l'avis avec
   * elle, refermant d'un coup la fenêtre d'où l'on venait justement de déposer. Elle
   * reste, et dit ce qu'elle porte : le texte publié se relit après coup, et c'est ici
   * qu'on l'a lu la première fois.
   */
  deposees: number[];
  /** Les villes où l'on publie, pour dire laquelle manque encore. */
  ressorts: string[];
  /**
   * Le volet de l'avis, posé à droite de la place à remplir.
   *
   * On ne dépose pas une attestation de parution sans avoir d'abord publié : le texte à
   * porter au journal se lisait derrière un bouton de la barre du dossier, tout en haut,
   * et il fallait savoir l'y chercher. Les deux gestes de l'annonce - lire ce qu'on
   * publie, remettre la preuve - tiennent sur la même ligne.
   */
  avis?: React.ReactNode;
}) {
  const [refus, setRefus] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const router = useRouter();

  /* La zone de la ligne remplit le premier rang qui manque ; le volet, celui qu'on vise. */
  const manquant = Array.from({ length: attendues }, (_, rang) => rang).find(
    (rang) => !deposees.includes(rang)
  );
  const deposee = manquant === undefined;

  function deposer(fichier: File) {
    setRefus(null);

    demarrer(async () => {
      const corps = new FormData();
      corps.append("dossier", String(dossier));
      corps.append("type", "parution");
      corps.append("rang", String(manquant ?? 0));
      corps.append("fichier", fichier);

      const reponse = await fetch("/api/avocat/livrables", { method: "POST", body: corps });
      if (!reponse.ok) {
        const retour = await reponse.json().catch(() => ({}));
        setRefus(retour.error ?? "L'attestation n'a pas pu être déposée");
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      {/*
        Le volet est frère de la zone, non son enfant : un bouton posé dans un label en
        déclenche le champ de fichier, et cliquer « Annonce légale » aurait ouvert le
        sélecteur du système.
      */}
      <div className={deposee ? styles.depotFait : styles.depotPointille}>
      {deposee ? (
        <p className={styles.depotPointilleZone}>
          <span className={styles.depotPointilleSigne} aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </span>
          <span className={styles.depotPointilleTexte}>
            {attendues > 1
              ? "Les " + attendues + " attestations de parution sont déposées"
              : "Attestation de parution déposée"}
            <span className={styles.depotPointilleNote}>
              {attendues > 1
                ? "Elles partent au guichet et figurent dans les documents du client."
                : "Elle part au guichet et figure dans les documents du client."}
            </span>
          </span>
        </p>
      ) : (
      <label className={styles.depotPointilleZone}>
        <span className={styles.depotPointilleSigne} aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </span>

        <span className={styles.depotPointilleTexte}>
          {enCours ? "Envoi…" : invite(attendues, deposees.length, ressorts, manquant)}
          <span className={styles.depotPointilleNote}>
            {precision(attendues, ressorts)}
          </span>
        </span>

        <input
          type="file"
          className={styles.champFichier}
          accept=".pdf,.jpg,.jpeg,.png,.heic,.heif"
          disabled={enCours}
          onChange={(e) => {
            const fichier = e.target.files?.[0];
            e.target.value = "";
            if (fichier) deposer(fichier);
          }}
        />
      </label>
      )}

        {avis}
      </div>

      {refus && (
        <p className={styles.decisionRefus} role="alert">
          {refus}
        </p>
      )}
    </>
  );
}

/**
 * Ce que la ligne demande, selon ce qui manque.
 *
 * « Déposer l'attestation de parution » sur un dossier qui en appelle deux laissait
 * croire le travail fini une fois la première remise.
 */
function invite(
  attendues: number,
  faites: number,
  ressorts: string[],
  manquant: number | undefined
): string {
  if (attendues <= 1) return "Déposer l'attestation de parution";
  if (faites === 0) return "Déposer les " + attendues + " attestations de parution";

  const ressort = manquant === undefined ? "" : ressorts[manquant];
  return (
    faites +
    " attestation" +
    (faites > 1 ? "s" : "") +
    " sur " +
    attendues +
    (ressort ? " - reste celle de " + ressort : "")
  );
}

/**
 * Et pourquoi il y en a deux.
 *
 * Le nombre seul laisse chercher : c'est le changement de département qui l'impose, et
 * l'avocat qui vient de corriger l'adresse ne le sait pas encore.
 */
function precision(attendues: number, ressorts: string[]): string {
  if (attendues <= 1) {
    return "Le justificatif du journal - il part au guichet et rejoint les documents du client.";
  }

  const villes = ressorts.filter(Boolean);
  return (
    "Le siège change de département" +
    (villes.length > 1 ? " : un avis paraît dans celui de " + villes.join(", puis dans celui de ") : "") +
    ". Le journal délivre une attestation par parution."
  );
}
