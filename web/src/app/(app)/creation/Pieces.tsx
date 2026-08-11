"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PieceAttendue } from "@/domain/formalite/documents";
import styles from "./Parcours.module.css";

/**
 * Le dépôt des pièces justificatives.
 *
 * Portage de .doc-upload-card de public/css/creation.css : une carte à bordure
 * pointillée par pièce, qui se resserre et s'assombrit quand un fichier la survole
 * (état « dragging »), et passe au vert quand la pièce est déposée. L'écran
 * précédent posait un champ de fichier nu, avec le bouton du navigateur.
 *
 * Le glisser-déposer était dans l'original ; il l'est de nouveau. Un simple champ
 * de fichier oblige à traverser une fenêtre de sélection alors que le fichier est
 * souvent déjà à l'écran, dans un autre onglet ou sur le bureau.
 */

function Icone({ depose }: { depose: boolean }) {
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
      {depose ? (
        <>
          <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </>
      ) : (
        <>
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </>
      )}
    </svg>
  );
}

interface Props {
  dossierId: number;
  pieces: PieceAttendue[];
  deposees: { type: string | null; nom: string }[];
}

export function Pieces({ dossierId, pieces, deposees }: Props) {
  const [messages, setMessages] = useState<Record<string, { ok: boolean; texte: string }>>({});
  const [survolee, setSurvolee] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const champs = useRef<Record<string, HTMLInputElement | null>>({});
  const router = useRouter();

  function deposer(piece: PieceAttendue, fichier: File) {
    setMessages((m) => ({ ...m, [piece.identifiant]: { ok: true, texte: "Envoi en cours" } }));

    demarrer(async () => {
      const donnees = new FormData();
      donnees.set("dossier", String(dossierId));
      donnees.set("piece", piece.identifiant);
      donnees.set("fichier", fichier);

      const reponse = await fetch("/api/formalites/pieces", { method: "POST", body: donnees });
      const corps = await reponse.json().catch(() => ({}));

      setMessages((m) => ({
        ...m,
        [piece.identifiant]: reponse.ok
          ? { ok: true, texte: "Pièce enregistrée" }
          : { ok: false, texte: corps.error ?? "Dépôt interrompu" },
      }));

      if (reponse.ok) router.refresh();
    });
  }

  return (
    <div className={styles.docList}>
      {pieces.map((piece) => {
        const dejaLa = deposees.find((d) => d.type === piece.identifiant);
        const message = messages[piece.identifiant];
        const glisse = survolee === piece.identifiant;

        return (
          <div
            key={piece.identifiant}
            className={[
              styles.docCard,
              dejaLa ? styles.docDepose : "",
              glisse ? styles.docGlisse : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onDragOver={(e) => {
              e.preventDefault();
              setSurvolee(piece.identifiant);
            }}
            onDragLeave={() => setSurvolee(null)}
            onDrop={(e) => {
              e.preventDefault();
              setSurvolee(null);
              const fichier = e.dataTransfer.files?.[0];
              if (fichier) deposer(piece, fichier);
            }}
          >
            <div className={styles.docHeader}>
              <span className={styles.docIcone} aria-hidden="true">
                <Icone depose={!!dejaLa} />
              </span>

              <div className={styles.docInfo}>
                <p className={styles.docTitre}>
                  {piece.titre}
                  <span className={styles.docRequis}>Requis</span>
                </p>
                <p className={styles.docDesc}>{piece.description}</p>

                {/* Le label porte le clic : le champ de fichier lui-même est
                    masqué, comme dans l'original. */}
                <label className={styles.docZone} htmlFor={"piece-" + piece.identifiant}>
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  <span>
                    {dejaLa ? (
                      <>
                        <strong>{dejaLa.nom}</strong> · déposer un autre fichier
                      </>
                    ) : (
                      <>
                        <strong>Choisir un fichier</strong> ou le glisser ici
                      </>
                    )}
                  </span>
                  <input
                    id={"piece-" + piece.identifiant}
                    ref={(el) => {
                      champs.current[piece.identifiant] = el;
                    }}
                    type="file"
                    accept={piece.formats.join(",")}
                    disabled={enCours}
                    onChange={(e) => {
                      const fichier = e.target.files?.[0];
                      if (fichier) deposer(piece, fichier);
                      e.target.value = ""; // permet de redéposer le même fichier
                    }}
                  />
                </label>

                <p className={styles.docFormats}>
                  Formats acceptés : {piece.formats.join(", ")}
                </p>

                {message && (
                  <p role={message.ok ? "status" : "alert"} aria-live="polite">
                    {message.texte}
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
