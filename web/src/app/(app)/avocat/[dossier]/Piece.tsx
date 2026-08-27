"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { etatDocument, estStatutsRepris } from "@/domain/document/statuts";
import { A_RELIRE } from "@/domain/document/publication";
import { TITRE_STATUTS_A_JOUR, TITRE_STATUTS_EN_VIGUEUR } from "@/domain/modification/formalites";
import { Verification } from "./Verification";
import { OuvrirLaPiece } from "./OuvrirLaPiece";
import { RelireLActe, ReprendreLActe } from "./RelireLActe";
import styles from "../Avocat.module.css";

/**
 * Une pièce du dossier, avec ce qu'on en fait.
 *
 * La carte vivait dans la page, en dur : elle ne pouvait s'afficher qu'au seul endroit
 * qui la rendait. Les tâches n'avaient donc qu'un lien vers cet endroit - « Voir les
 * documents », trois fois la même page - là où il aurait suffi de montrer les deux ou
 * trois pièces dont la tâche parle.
 */

/** Ce qui traverse jusqu'au navigateur : les dates y sont des chaînes. */
export interface PieceAffichee {
  id: number;
  nom: string;
  statut: string | null;
  motifRejet: string | null;
  fichier: string | null;
  source: string | null;
  /** Le déposant : « system » pour ce que la plateforme produit. */
  depose: string | null;
  creeLe: string | null;
  /**
   * Les versions antérieures de l'acte, de la plus récente à la plus ancienne.
   *
   * Reproduire un acte le détruisait : l'avocat qui corrigeait une coquille perdait la
   * version d'origine sans pouvoir y revenir.
   */
  versions?: VersionDeLActe[];
}

export interface VersionDeLActe {
  id: number;
  fichier: string | null;
  produiteLe: string;
  archiveeLe: string;
  par: string | null;
}

/** « 24 août 2026 à 12:16 ». L'heure distingue deux dépôts du même jour. */
function quand(date: string): string {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short" }).format(
    new Date(date)
  );
}

/** La date seule : « 2 septembre 2022 ». */
function jour(date: string): string {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date(date));
}

/** Les actes produits par le cabinet, hors statuts repris au registre. */
export function estUnActeProduit(piece: PieceAffichee): boolean {
  return piece.depose === "system" && !estStatutsRepris(piece.nom);
}

export function Piece({ piece, dossier }: { piece: PieceAffichee; dossier: number }) {
  const brut = etatDocument({
    name: piece.nom,
    status: piece.statut,
    rejection_reason: piece.motifRejet,
  });

  /*
   * Un acte du cabinet dit s'il est parti, non comment il est né.
   *
   * « Généré » nommait la fabrication : l'avocat lisait le même mot sur un acte qu'il
   * venait de valider et sur un acte que personne n'avait relu, et cherchait où le
   * valider alors qu'il était déjà chez le client. « Projet à relire » attend, « Remis
   * au client » est parti.
   */
  const etat =
    estUnActeProduit(piece) && piece.statut === "generated"
      ? { libelle: "Remis au client", ton: "abouti" as const, motif: null }
      : brut;

  return (
    <div
      className={piece.motifRejet ? `${styles.docCard} ${styles.docRejected}` : styles.docCard}
    >
      <div className={styles.docIcon}>
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
        </svg>
      </div>

      <div className={styles.docInfo}>
        <div className={styles.docName}>{piece.nom}</div>
        <div className={styles.docMeta}>
          {/* L'état porte sa teinte : ce qui attend une décision se voit sans lire. */}
          <span className={`${styles.docEtat} ${styles[etat.ton]}`}>{etat.libelle}</span>
          {piece.creeLe && (
            <span>
              {/*
                Un acte repris au registre porte la date de son dépôt d'origine, sans
                heure : « à 02:00 » n'est qu'un artefact de fuseau sur une date sans
                heure, et laisse croire à un dépôt de cette nuit.
              */}
              {estStatutsRepris(piece.nom)
                ? "déposés par la société le " + jour(piece.creeLe)
                : quand(piece.creeLe)}
            </span>
          )}
        </div>
        {etat.motif && <div className={styles.docRejectionInfo}>Motif : {etat.motif}</div>}
      </div>

      {/*
        Les versions, sous la ligne.
        
        Elles ne se déplient que si l'acte en a : une mention « 0 version » sur chaque
        document n'apprendrait rien, et il y en a rarement.
      */}
      {piece.versions && piece.versions.length > 0 && (
        <Versions versions={piece.versions} dossier={dossier} />
      )}

      <div className={styles.docActions}>
        {piece.fichier && <OuvrirLaPiece nom={piece.nom} fichier={piece.fichier} />}

        {/*
          Les statuts à jour ne se corrigent pas dans un traitement de texte : ils
          sortent de l'éditeur de retouches, qui reprend le document du greffe passage
          par passage.
        */}
        {piece.nom === TITRE_STATUTS_A_JOUR && (
          <Link
            href={"/avocat/" + dossier + "?onglet=statuts"}
            className={styles.decisionPrincipale}
          >
            Mettre à jour les statuts
          </Link>
        )}

        {/*
          Un projet d'acte se relit sur le Word qui l'a produit : le PDF est ce qu'on
          remet, non ce qu'on corrige.
        */}
        {piece.depose === "system" &&
          piece.statut === A_RELIRE &&
          piece.nom !== TITRE_STATUTS_A_JOUR &&
          piece.nom !== TITRE_STATUTS_EN_VIGUEUR && (
            <RelireLActe
              document={piece.id}
              dossier={dossier}
              /*
               * Sans LibreOffice, l'acte est gardé en Word plutôt que perdu : c'est
               * alors le fichier remis lui-même qu'on corrige.
               */
              source={piece.source ?? (piece.fichier?.endsWith(".docx") ? piece.fichier : null)}
            />
          )}

        {/*
          Un acte remis se reprend : la coquille se voit parfois après coup, et il
          quitte alors l'espace du client pour redevenir un projet.
        */}
        {estUnActeProduit(piece) && piece.statut === "generated" && (
          <ReprendreLActe document={piece.id} dossier={dossier} />
        )}

        {piece.statut === "uploaded" && <Verification documentId={piece.id} />}
        {/* Une validation se reprend : on se trompe de bouton, ou de pièce. */}
        {piece.statut === "verified" && <Verification documentId={piece.id} decidee />}
      </div>
    </div>
  );
}

/**
 * Les pièces d'une tâche, montrées sans quitter la liste.
 *
 * « Voir les documents » menait au même onglet depuis trois tâches différentes, et il
 * fallait ensuite retrouver dans la liste entière les deux pièces dont il s'agissait.
 * La fenêtre ne montre que celles-là, avec les mêmes gestes.
 */
export function FenetreDesPieces({
  titre,
  explication,
  pieces,
  dossier,
  surFermeture,
}: {
  titre: string;
  explication: string;
  pieces: PieceAffichee[];
  dossier: number;
  surFermeture: () => void;
}) {
  return (
    <>
      <div className={styles.voile} onClick={surFermeture} aria-hidden="true" />

      <div className={styles.fenetrePieces} role="dialog" aria-modal="true" aria-label={titre}>
        <div className={styles.fenetrePiecesTete}>
          <div>
            <h3 className={styles.fenetrePiecesTitre}>{titre}</h3>
            <p className={styles.fenetrePiecesDetail}>{explication}</p>
          </div>

          <button
            type="button"
            className={styles.panneauFermer}
            onClick={surFermeture}
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
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className={styles.fenetrePiecesCorps}>
          {pieces.length === 0 ? (
            <p className={styles.fenetrePiecesVide}>Aucun document pour cette étape.</p>
          ) : (
            pieces.map((piece) => <Piece key={piece.id} piece={piece} dossier={dossier} />)
          )}
        </div>
      </div>
    </>
  );
}

/**
 * Les versions antérieures d'un acte, repliées.
 *
 * On ne les regarde que lorsqu'on se demande ce qui a changé, ou qu'on veut revenir
 * dessus : elles n'ont pas à occuper la ligne le reste du temps.
 */
function Versions({ versions, dossier }: { versions: VersionDeLActe[]; dossier: number }) {
  const [refus, setRefus] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const router = useRouter();

  function retablir(version: number) {
    setRefus(null);
    demarrer(async () => {
      const reponse = await fetch("/api/avocat/actes/versions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossier, version }),
      });
      if (!reponse.ok) {
        const retour = await reponse.json().catch(() => ({}));
        setRefus(retour.error ?? "Le rétablissement n'a pas abouti");
        return;
      }
      router.refresh();
    });
  }

  return (
    <details className={styles.actesVersions}>
      <summary className={styles.actesVersionsTete}>
        {versions.length} version{versions.length > 1 ? "s" : ""} antérieure
        {versions.length > 1 ? "s" : ""}
      </summary>

      {refus && (
        <p className={styles.decisionRefus} role="alert">
          {refus}
        </p>
      )}

      <ul className={styles.actesVersionsListe}>
        {versions.map((version) => (
          <li key={version.id} className={styles.acteVersion}>
            <span className={styles.acteVersionQuand}>
              Produite le {quand(version.produiteLe)}
              {version.par ? " · remplacée par " + version.par : ""}
            </span>
            <span className={styles.acteVersionGestes}>
              {version.fichier && (
                <OuvrirLaPiece nom={"Version du " + jour(version.produiteLe)} fichier={version.fichier} />
              )}
              <button
                type="button"
                className={styles.decisionSecondaire}
                onClick={() => retablir(version.id)}
                disabled={enCours}
              >
                Revenir à celle-ci
              </button>
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
