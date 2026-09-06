"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { etatDocument, estStatutsRepris } from "@/domain/document/statuts";
import { A_RELIRE } from "@/domain/document/publication";
import { TITRE_STATUTS_A_JOUR, TITRE_STATUTS_EN_VIGUEUR } from "@/domain/modification/formalites";
import { Verification } from "./Verification";
import { OuvrirLaPiece } from "./OuvrirLaPiece";
import { RelireLActe, ReprendreLActe } from "./RelireLActe";
import { MenuGestes } from "./MenuGestes";
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

export function Piece({
  piece,
  dossier,
  retouchable,
  repris,
}: {
  piece: PieceAffichee;
  dossier: number;
  /**
   * Le dossier touche-t-il aux statuts ?
   *
   * La ligne des statuts en vigueur porte alors le geste qui les reprend. Il vivait sur
   * une ligne à part, sous celle-ci, dont le nom se faisait chasser du cadre par
   * l'explication qui suivait la pastille : on lisait une ligne anonyme et un bouton.
   */
  retouchable?: boolean;
  /**
   * Des statuts à jour ont-ils déjà été produits depuis ceux-ci ?
   *
   * Le bouton disait « Modifier les statuts » comme au premier jour, sur des statuts
   * déjà repris : il propose de reprendre. La ligne portait aussi la mention « Reprise
   * dans les statuts à jour » - retirée : les statuts à jour figurent au-dessus dans la
   * même liste, avec la date de leur production, et le bouton dit le reste.
   */
  repris?: boolean;
}) {
  /*
   * Elles ne se déplient que si l'acte en a : une mention « 0 version » sur chaque
   * document n'apprendrait rien, et il y en a rarement.
   */
  const versions = piece.versions ?? [];

  /* Ce que la rangée range derrière les trois points, s'il y a quelque chose à ranger. */
  const gestesDeRepli =
    (estUnActeProduit(piece) && piece.statut === "generated") ||
    piece.statut === "uploaded" ||
    piece.statut === "verified";
  const [versionsOuvertes, setVersionsOuvertes] = useState(false);
  const [menuOuvert, setMenuOuvert] = useState(false);

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
      {/*
        La rangée, puis les versions dessous.

        Elles étaient posées dans la rangée elle-même, qui ne se replie pas : « 1 version
        antérieure » prenait sa place sur la ligne et le nom de l'acte, seul à céder,
        tombait à « Pro… ». Reproduire un acte rendait donc son propre document illisible
        dans la liste.
      */}
      <div className={styles.docLigne}>
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

      {/*
        L'état contre le nom.

        Il avait rejoint le bord droit, pour que les noms commencent tous au même
        endroit : les pastilles s'y retrouvaient loin de ce qu'elles qualifient, et
        toujours pas alignées entre elles - les groupes de boutons n'ont pas la même
        largeur. La pastille qualifie le document : elle se lit contre son nom.
      */}
      <div className={styles.docInfo}>
        <div className={styles.docName}>{piece.nom}</div>
        <div className={styles.docMeta}>
          {/* L'état porte sa teinte : ce qui attend une décision se voit sans lire. */}
          {/* Le ton « neutre » n'a pas de classe : sans cette garde, la pastille sortait
              avec un « undefined » dans son attribut de classe. */}
          <span
            className={
              etat.ton in styles ? `${styles.docEtat} ${styles[etat.ton]}` : styles.docEtat
            }
          >
            {etat.libelle}
          </span>
          {piece.creeLe && (
            <span className={styles.docQuand}>
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

          {/*
            L'historique tient sur la rangée, il ne lui ajoute plus une ligne.

            « 4 versions antérieures » en toutes lettres y prenait la place du nom, d'où
            son renvoi dessous ; réduit à une horloge et à un nombre, il rentre là où il
            appartient - à côté de l'état, qui dit aussi ce qu'est devenu le document.
          */}
          {versions.length > 0 && (
            <button
              type="button"
              className={styles.actesVersionsTete}
              onClick={() => setVersionsOuvertes((ouvert) => !ouvert)}
              aria-expanded={versionsOuvertes}
              title={
                versions.length +
                " version" +
                (versions.length > 1 ? "s" : "") +
                " antérieure" +
                (versions.length > 1 ? "s" : "")
              }
            >
              {/* L'horloge dit de quoi il s'agit avant qu'on ait lu : c'est du passé. */}
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                <polyline points="3 3 3 8 8 8" />
                <polyline points="12 7 12 12 15 14" />
              </svg>

              <span className={styles.actesVersionsCompte}>{versions.length}</span>

              <svg
                className={
                  versionsOuvertes
                    ? `${styles.actesVersionsChevron} ${styles.actesVersionsChevronOuvert}`
                    : styles.actesVersionsChevron
                }
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="9 6 15 12 9 18" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className={styles.docActions}>
        {piece.fichier && <OuvrirLaPiece nom={piece.nom} fichier={piece.fichier} />}

        {/*
          Les statuts ne se corrigent pas dans un traitement de texte : ils sortent de
          l'éditeur de retouches, qui reprend le document du greffe passage par passage.

          Le bouton menait à une ancre - « #statuts » - vers le bas de la page du
          dossier, sous les documents et sous le fil des échanges : on cliquait sans
          rien voir arriver, la page ayant défilé deux écrans plus bas. L'éditeur a sa
          page, et le bouton y mène.
        */}
        {(piece.nom === TITRE_STATUTS_A_JOUR ||
          (retouchable && piece.nom === TITRE_STATUTS_EN_VIGUEUR)) && (
          <a href={"/avocat/" + dossier + "/statuts"} className={styles.decisionPrincipale}>
            {/*
              « Modifier », sur une ligne qui dit déjà « Statuts ».
              
              « Reprendre les modifications » prenait deux cents pixels sur les trois
              cents de la colonne des gestes : la colonne ne pouvait pas se figer sans
              rogner les noms. Le mot suffit ici, et le document que l'on modifie est
              nommé juste à gauche.
            */}
            {piece.nom === TITRE_STATUTS_A_JOUR || repris ? "Modifier" : "Modifier les statuts"}
          </a>
        )}

        {/*
          Corriger le Word et déposer sa version tiennent dans un menu.

          Quatre gestes côte à côte prenaient quatre cents pixels sur les sept cents de
          la colonne : le nom de l'acte n'avait plus la place de s'écrire, et la rangée
          se repliait sous lui. Les deux qui restent visibles sont ceux qu'on fait à
          chaque acte - l'ouvrir, puis le valider ; les deux autres sont les issues quand
          il cloche.
        */}
        {piece.depose === "system" &&
          piece.statut === A_RELIRE &&
          piece.nom !== TITRE_STATUTS_EN_VIGUEUR && (
            <RelireLActe
                document={piece.id}
                dossier={dossier}
                /*
                 * Les statuts à jour se valident, ils ne se corrigent pas au traitement
                 * de texte : ils sortent de l'éditeur de retouches, à un bouton de là
                 * sur la même ligne. Ils étaient écartés de la relecture entière - et
                 * restaient donc « Projet à relire » pour toujours, sans jamais
                 * atteindre l'espace du client.
                 */
                validationSeule={piece.nom === TITRE_STATUTS_A_JOUR}
                /*
                 * Sans LibreOffice, l'acte est gardé en Word plutôt que perdu : c'est
                 * alors le fichier remis lui-même qu'on corrige.
                 */
                source={piece.source ?? (piece.fichier?.endsWith(".docx") ? piece.fichier : null)}
              />
          )}

        {piece.statut === "uploaded" && <Verification documentId={piece.id} dossier={dossier} />}

        {/*
          Ce qui revient en arrière tient dans un menu.

          La rangée portait tous ses gestes côte à côte : quatre lignes, quatre groupes
          de largeurs différentes, et « Ouvrir » à quatre abscisses. Aligner cette
          colonne demandait de lui réserver la largeur du groupe le plus large - trois
          cent trente-huit pixels - et il ne restait plus assez pour les noms, qui se
          faisaient tronquer. Chaque rangée garde donc « Ouvrir » et le geste qui fait
          avancer le dossier ; reprendre un acte remis, revenir sur une validation,
          demander une autre pièce passent derrière les trois points.
        */}
        {gestesDeRepli && (
          <MenuGestes ouvert={menuOuvert} surChangement={setMenuOuvert}>
            {/*
              Un acte remis se reprend : la coquille se voit parfois après coup, et il
              quitte alors l'espace du client pour redevenir un projet.
            */}
            {estUnActeProduit(piece) && piece.statut === "generated" && (
              <ReprendreLActe document={piece.id} dossier={dossier} />
            )}

            {piece.statut === "uploaded" && (
              <Verification
                documentId={piece.id}
                dossier={dossier}
                partie="repli"
                surFin={() => setMenuOuvert(false)}
              />
            )}

            {/* Une validation se reprend : on se trompe de bouton, ou de pièce. */}
            {piece.statut === "verified" && (
              <Verification
                documentId={piece.id}
                dossier={dossier}
                decidee
                surFin={() => setMenuOuvert(false)}
              />
            )}
          </MenuGestes>
        )}
      </div>
      </div>



      {versionsOuvertes && versions.length > 0 && (
        <ListeDesVersions versions={versions} dossier={dossier} />
      )}
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
function ListeDesVersions({
  versions,
  dossier,
}: {
  versions: VersionDeLActe[];
  dossier: number;
}) {
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
    <div className={styles.actesVersions}>
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
    </div>
  );
}
