"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
/**
 * Une pièce attendue, quel que soit le parcours.
 *
 * La création de société et l'auto-entreprise décrivent chacune les leurs, dans leur
 * domaine. Le dépôt, lui, est le même geste : il n'a pas à connaître laquelle des deux
 * l'appelle.
 */
export interface PieceAttendue {
  identifiant: string;
  titre: string;
  description: string;
  formats: string[];
}
import type { Controle, PieceDeposee } from "@/domain/formalite/controle-identite";
import styles from "./Pieces.module.css";

/**
 * Ce qui s'affiche sous une carte après un dépôt.
 *
 * Le verdict du contrôle d'identité s'y ajoute quand il y en a un : « Pièce
 * enregistrée » ne suffit pas à dire qu'une carte est périmée, et le client repart
 * alors en croyant son dossier complet.
 */
interface MessageDeDepot {
  ok: boolean;
  texte: string;
  controle?: Controle | null;
}

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
  deposees: PieceDeposee[];
}

export function Pieces({ dossierId, pieces, deposees }: Props) {
  const [messages, setMessages] = useState<Record<string, MessageDeDepot>>({});
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

      /*
       * Le verdict du contrôle prend la place de « Pièce enregistrée ».
       *
       * Le dépôt d'une carte périmée réussit - elle est reçue, stockée, et retenue - si
       * bien que la réponse est un succès au sens du protocole. Annoncer « Pièce
       * enregistrée » sur cette réponse-là ferait repartir le client en croyant son
       * dossier complet, et c'est justement ce que ce contrôle existe pour éviter.
       */
      const controle: Controle | null = corps.controle ?? null;

      setMessages((m) => ({
        ...m,
        [piece.identifiant]: reponse.ok
          ? {
              ok: controle?.gravite !== "refusee",
              texte: controle?.resume ?? "Pièce enregistrée",
              controle,
            }
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

        /*
         * Une pièce retenue n'est pas une pièce acquise.
         *
         * La carte passait au vert dès qu'un fichier existait, motif de refus compris :
         * le client voyait « déposé » sur la pièce même qu'on lui demandait de
         * remplacer, et n'avait aucune raison d'y revenir.
         */
        const retenue = !!dejaLa?.motifRejet?.trim();
        const verdict = message?.controle ?? dejaLa?.controle ?? null;
        /*
         * Au rechargement, le message du dépôt a disparu : le verdict gardé le remplace.
         *
         * Seul le motif de refus prenait le relais, et une pièce acceptée avec réserve
         * n'en a pas : une carte prorogée, un nom qui ne correspond pas au dossier, une
         * image peu définie s'affichaient au dépôt puis disparaissaient dès qu'on
         * revenait sur la page. Ce qui a été constaté est pourtant gardé en base, et
         * arrive jusqu'ici.
         */
        const phrase =
          message?.texte ?? verdict?.resume ?? (retenue ? dejaLa!.motifRejet! : null);
        const bloquant = message ? !message.ok : retenue;

        /*
         * Le ton suit la gravité, non le rôle d'accessibilité.
         *
         * globals.css encadre tout [role="alert"] de rouge et tout [role="status"] de
         * vert. Le bloc porte bien ces rôles - il faut que la synthèse vocale annonce ce
         * qui bloque - mais une réserve cerclée de vert dit « c'est bon » sur une phrase
         * qui dit le contraire. La teinte est donc redite ici, comme le fait déjà le
         * bilan des accords.
         */
        const ton = bloquant
          ? styles.verdictBloquant
          : verdict?.gravite === "reserve"
            ? styles.verdictReserve
            : styles.verdictAbouti;

        return (
          <div
            key={piece.identifiant}
            className={[
              styles.docCard,
              dejaLa && !retenue ? styles.docDepose : "",
              retenue ? styles.docRetenue : "",
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
                <Icone depose={!!dejaLa && !retenue} />
              </span>

              <div className={styles.docInfo}>
                <p className={styles.docTitre}>
                  {piece.titre}
                  <span className={styles.docRequis}>Requis</span>
                </p>
                <p className={styles.docDesc}>{piece.description}</p>

                {/* Le label porte le clic : le champ de fichier lui-même est
                    masqué, comme dans l'original. */}
                {/*
                  La zone porte l'identifiant, non le champ.

                  Le champ de fichier est masqué : le viser depuis un autre écran - « il
                  reste une pièce à déposer », dans la carte de règlement - n'amenait le
                  focus sur rien. C'est la zone qu'on voit, c'est elle qu'on désigne.
                */}
                <label
                  id={"zone-piece-" + piece.identifiant}
                  tabIndex={-1}
                  className={styles.docZone}
                  htmlFor={"piece-" + piece.identifiant}
                >
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
                  {/*
                    Une pièce déposée se remplace, et il faut que ça se voie.
                    La zone portait le nom du fichier en gras suivi de « déposer un
                    autre fichier » en gris : on y lisait une étiquette, non un geste,
                    et l'on cherchait où corriger un mauvais envoi. C'est l'action qui
                    passe en gras, le fichier en place qui la suit.
                  */}
                  <span>
                    {dejaLa ? (
                      <>
                        <strong>Remplacer le fichier</strong> · {dejaLa.nom}
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

                {phrase && (
                  <div
                    className={styles.verdict + " " + ton}
                    role={bloquant ? "alert" : "status"}
                    aria-live="polite"
                  >
                    <p className={styles.verdictPhrase}>{phrase}</p>

                    {/*
                      Le détail ne se répète pas.

                      Le résumé reprend déjà le constat qui bloque, mot pour mot : le
                      lister à nouveau juste en dessous donnait deux fois la même phrase.
                      On n'écrit donc que ce que le résumé n'a pas dit - et rien du tout
                      quand il a tout dit.
                    */}
                    {verdict && verdict.constats.length > 1 && (
                      <ul className={styles.verdictDetail}>
                        {verdict.constats
                          .filter((c) => c.phrase !== phrase)
                          .map((c) => (
                            <li key={c.code}>{c.phrase}</li>
                          ))}
                      </ul>
                    )}

                    {/*
                      Une pièce non lue se dit, plutôt que de passer pour vérifiée.

                      Quand le service de lecture manque, seules les mesures ont joué :
                      la carte peut être périmée sans que rien ne l'ait vu. Le taire
                      donnerait au client une assurance que nous n'avons pas.
                    */}
                    {verdict?.lectureIndisponible && (
                      <p className={styles.verdictNote}>
                        La validité n&apos;a pas pu être vérifiée automatiquement : l&apos;avocat
                        la contrôlera.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
