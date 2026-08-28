"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Apercu } from "@/components/document/Apercu";
import { formaterDate } from "@/lib/dates";
import styles from "./Dossier.module.css";

/** D'où vient le document, et ce qu'il vaut à cet instant. */
export type EtatDuDocument = "valide" | "en_relecture" | "depose";

export interface DocumentDuDossier {
  id: string;
  nom: string;
  /** Nul tant que l'acte est chez l'avocat : il n'y a rien avec quoi l'ouvrir. */
  fichier: string | null;
  creeLe: string | null;
  etat: EtatDuDocument;
}

const MENTIONS: Record<EtatDuDocument, string> = {
  valide: "Validé par l'avocat",
  en_relecture: "En relecture par l'avocat",
  depose: "Déposé par vous",
};

/**
 * Les documents d'un dossier, dans le dossier.
 *
 * Ils vivaient dans la bibliothèque commune, rangés par société : y retrouver les
 * trois actes d'un dépôt supposait de traverser tout ce qu'on avait déjà déposé
 * ailleurs. Ceux-ci sont ceux de ce dossier, et rien d'autre.
 *
 * Chaque ligne dit ce que vaut le document - un acte relu par l'avocat n'est pas un
 * projet - et donne les deux gestes qu'on lui demande : le regarder, l'emporter. La
 * ligne était un lien de téléchargement, et vérifier qu'on tenait le bon acte
 * supposait de le télécharger, l'ouvrir, puis le jeter.
 *
 * Un acte encore en relecture figure sans son fichier : le cacher donnerait un écran
 * vide juste après le règlement, et l'ouvrir remettrait au client un acte que
 * l'avocat n'a pas encore relu.
 */
export function DocumentsDuDossier({
  dossier,
  documents,
}: {
  /** Ce qu'on ajoute se range dans ce dossier, non dans le coffre en vrac. */
  dossier: number;
  documents: DocumentDuDossier[];
}) {
  const [apercu, setApercu] = useState<{ nom: string; fichier: string } | null>(null);
  const [refus, setRefus] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const router = useRouter();

  function ajouter(fichier: File) {
    setRefus(null);

    demarrer(async () => {
      const corps = new FormData();
      corps.append("fichier", fichier);
      corps.append("nom", fichier.name);
      corps.append("dossier", String(dossier));

      const reponse = await fetch("/api/documents", { method: "POST", body: corps });
      if (!reponse.ok) {
        const retour = await reponse.json().catch(() => ({}));
        setRefus(retour.error ?? "Le dépôt n'a pas abouti.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      <section className={styles.documents} aria-label="Documents du dossier">
        {documents.length === 0 ? (
          <p className={styles.vide}>
            Aucun document pour l&apos;instant. Vos actes apparaîtront ici dès que
            l&apos;avocat les aura relus.
          </p>
        ) : (
        <ul className={styles.documentsListe}>
          {documents.map((document) => {
            const quand = document.creeLe ? formaterDate(new Date(document.creeLe)) : null;

            return (
              <li key={document.id} className={styles.document}>
                <span className={styles.documentIcone} aria-hidden="true">
                  <Feuille />
                </span>

                <div className={styles.documentCorps}>
                  <span className={styles.documentNom}>{document.nom}</span>

                  <span className={styles.documentMentions}>
                    {/* La teinte dit ce que vaut l'acte avant qu'on ait lu le mot. */}
                    <span
                      className={`${styles.documentEtat} ${styles["etat_" + document.etat]}`}
                    >
                      {document.etat === "valide" && <Coche />}
                      {MENTIONS[document.etat]}
                    </span>
                    {quand && <span className={styles.documentQuand}>{quand}</span>}
                  </span>
                </div>

                {document.fichier && (
                  <div className={styles.documentGestes}>
                    <button
                      type="button"
                      className={styles.documentGeste}
                      onClick={() =>
                        setApercu({ nom: document.nom, fichier: document.fichier as string })
                      }
                    >
                      <Oeil />
                      Aperçu
                    </button>

                    <a
                      className={styles.documentGeste}
                      href={
                        "/api/fichier?nom=" +
                        encodeURIComponent(document.fichier) +
                        "&titre=" +
                        encodeURIComponent(document.nom) +
                        "&telecharger=1"
                      }
                    >
                      <Fleche />
                      Télécharger
                    </a>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        )}

        {/*
          Ajouter une pièce, depuis le dossier auquel elle se rapporte.

          Déposer un justificatif demandait de quitter le dossier pour la bibliothèque
          commune, d'y ouvrir une fenêtre et d'y redésigner la société qu'on venait de
          quitter. Le bouton est ici, en pointillé et pleine largeur : il se lit comme
          une place à remplir, non comme une action de plus.
        */}
        <label className={styles.ajout}>
          <span className={styles.ajoutSigne} aria-hidden="true">
            <Plus />
          </span>
          <span className={styles.ajoutTexte}>
            {enCours ? "Envoi…" : "Ajouter un document à ce dossier"}
            <span className={styles.ajoutNote}>
              PDF, image, Word ou Excel - il rejoint ce dossier et votre bibliothèque.
            </span>
          </span>
          <input
            type="file"
            className={styles.champFichier}
            disabled={enCours}
            onChange={(e) => {
              const fichier = e.target.files?.[0];
              e.target.value = "";
              if (fichier) ajouter(fichier);
            }}
          />
        </label>

        {refus && (
          <p className={styles.ajoutRefus} role="alert">
            {refus}
          </p>
        )}
      </section>

      {apercu && (
        <Apercu
          nom={apercu.nom}
          fichier={apercu.fichier}
          surFermeture={() => setApercu(null)}
        />
      )}
    </>
  );
}

function Plus() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function Feuille() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function Coche() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function Oeil() {
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
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" />
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
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 4v12" />
      <polyline points="7 11 12 16 17 11" />
      <path d="M5 20h14" />
    </svg>
  );
}
