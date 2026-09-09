"use client";

import { useEffect, useState, useTransition } from "react";
import styles from "./Administration.module.css";

/**
 * Les pièces que le cabinet fournit quand il domicilie une société.
 *
 * Elles ne vivent pas sur un dossier : ce sont les siennes, déposées une fois et
 * reprises à chaque domiciliation. Deux d'entre elles se périment - un extrait Kbis et
 * un justificatif de domicile de plus de trois mois se font refuser au guichet - et
 * c'est la seule raison pour laquelle l'écran demande leur date.
 *
 * La date est celle que porte la pièce, non celle du téléversement : un Kbis tiré en
 * janvier et déposé ici en juin est périmé le jour où on le dépose.
 */

type Etat = "fraiche" | "bientot" | "perimee" | "sans-date";

interface Piece {
  identifiant: string;
  titre: string;
  description: string;
  perissable: boolean;
  formats: string[];
  deposee: { nomFichier: string; etabliLe: string | null; deposeLe: string; etat: Etat } | null;
}

const MOTS: Record<Etat, string> = {
  fraiche: "À jour",
  bientot: "À renouveler bientôt",
  perimee: "Périmée",
  "sans-date": "Date manquante",
};

export function PiecesDuCabinet() {
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [dates, setDates] = useState<Record<string, string>>({});
  const [refus, setRefus] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  function charger() {
    demarrer(async () => {
      const reponse = await fetch("/api/administration/pieces-du-cabinet");
      const corps = await reponse.json().catch(() => ({}));
      if (!reponse.ok) {
        setRefus(corps.error ?? "Les pièces du cabinet n'ont pas pu être lues");
        return;
      }
      setPieces(corps.pieces ?? []);
      setDates(
        Object.fromEntries(
          (corps.pieces ?? []).map((p: Piece) => [p.identifiant, p.deposee?.etabliLe ?? ""])
        )
      );
    });
  }

  useEffect(charger, []);

  function deposer(piece: Piece, fichier: File) {
    setRefus(null);
    demarrer(async () => {
      const corps = new FormData();
      corps.append("piece", piece.identifiant);
      corps.append("fichier", fichier);
      if (piece.perissable) corps.append("etabliLe", dates[piece.identifiant] ?? "");

      const reponse = await fetch("/api/administration/pieces-du-cabinet", {
        method: "POST",
        body: corps,
      });
      const retour = await reponse.json().catch(() => ({}));
      if (!reponse.ok) {
        setRefus(retour.error ?? "Le dépôt a été refusé");
        return;
      }
      charger();
    });
  }

  return (
    <>
      {refus && <p role="alert">{refus}</p>}

      <ul className={styles.piecesCabinet}>
        {pieces.map((piece) => (
          <li key={piece.identifiant} className={styles.pieceCabinet}>
            <div className={styles.pieceCabinetTete}>
              <span className={styles.pieceCabinetTitre}>{piece.titre}</span>
              {piece.deposee && (
                <span
                  className={styles.pieceCabinetEtat}
                  data-etat={piece.perissable ? piece.deposee.etat : "fraiche"}
                >
                  {piece.perissable ? MOTS[piece.deposee.etat] : "Déposée"}
                </span>
              )}
            </div>

            <p className={styles.pieceCabinetDetail}>{piece.description}</p>

            {piece.deposee && (
              <p className={styles.pieceCabinetFichier}>{piece.deposee.nomFichier}</p>
            )}

            <div className={styles.pieceCabinetActions}>
              {/*
                La date de la pièce se saisit avant le fichier.

                C'est elle qui décide de la fraîcheur, et le dépôt la prend telle qu'elle
                est au moment où il part : la demander après aurait exigé un second geste
                pour la corriger.
              */}
              {piece.perissable && (
                <label className={styles.pieceCabinetDate}>
                  <span>Date de la pièce</span>
                  <input
                    type="date"
                    value={dates[piece.identifiant] ?? ""}
                    onChange={(e) =>
                      setDates((precedentes) => ({
                        ...precedentes,
                        [piece.identifiant]: e.target.value,
                      }))
                    }
                  />
                </label>
              )}

              <input
                type="file"
                accept={piece.formats.join(",")}
                aria-label={"Déposer " + piece.titre.toLowerCase()}
                disabled={enCours}
                onChange={(e) => {
                  const fichier = e.target.files?.[0];
                  if (fichier) deposer(piece, fichier);
                }}
              />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
