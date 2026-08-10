"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PieceAttendue } from "@/domain/formalite/documents";
import styles from "./Parcours.module.css";

interface Props {
  dossierId: number;
  pieces: PieceAttendue[];
  deposees: { type: string | null; nom: string }[];
}

export function Pieces({ dossierId, pieces, deposees }: Props) {
  const [messages, setMessages] = useState<Record<string, { ok: boolean; texte: string }>>({});
  const [enCours, demarrer] = useTransition();
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
    <div className={styles.champs}>
      {pieces.map((piece) => {
        const dejaLa = deposees.find((d) => d.type === piece.identifiant);
        const message = messages[piece.identifiant];

        return (
          <fieldset key={piece.identifiant} className={styles.personne}>
            <legend>{piece.titre}</legend>
            <p className={styles.description}>{piece.description}</p>

            {dejaLa && <p>Déjà déposée : {dejaLa.nom}</p>}

            <label htmlFor={"piece-" + piece.identifiant}>
              {dejaLa ? "Remplacer le fichier" : "Choisir un fichier"}
            </label>
            <input
              id={"piece-" + piece.identifiant}
              type="file"
              accept={piece.formats.join(",")}
              disabled={enCours}
              onChange={(e) => {
                const fichier = e.target.files?.[0];
                if (fichier) deposer(piece, fichier);
                e.target.value = ""; // permet de redéposer le même fichier
              }}
            />
            <p className={styles.description}>Formats acceptés : {piece.formats.join(", ")}</p>

            {message && (
              <p role={message.ok ? "status" : "alert"} aria-live="polite">
                {message.texte}
              </p>
            )}
          </fieldset>
        );
      })}
    </div>
  );
}
