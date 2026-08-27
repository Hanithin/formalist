"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { phasesDuCabinet, type Tache } from "@/domain/formalite/cabinet";
import {
  FenetreDesPieces,
  estUnActeProduit,
  type PieceAffichee,
} from "./Piece";
import { Livrables } from "./Avancement";
import styles from "../Avocat.module.css";

/*
 * Ce qu'une tâche montre quand on lui demande ses pièces.
 *
 * Une tâche ne parle jamais de tout le dossier : la vérification porte sur ce que le
 * client a déposé, la production et la relecture sur ce que le cabinet a écrit.
 */
function piecesDeLaTache(pieces: PieceAffichee[], tache: string): PieceAffichee[] {
  if (tache === "pieces" || tache === "attestations") {
    return pieces.filter((p) => !estUnActeProduit(p));
  }
  if (tache === "actes" || tache === "relecture" || tache === "confidentialite") {
    return pieces.filter(estUnActeProduit);
  }
  return pieces;
}

function libelleDesPieces(tache: string): string {
  if (tache === "pieces" || tache === "attestations") return "Voir les justificatifs";
  if (tache === "actes" || tache === "relecture") return "Voir les actes";
  return "Voir les documents";
}

function titreDesPieces(tache: string): string {
  if (tache === "pieces" || tache === "attestations") return "Les justificatifs du client";
  if (tache === "actes" || tache === "relecture") return "Les actes produits";
  return "Les documents du dossier";
}

function explicationDesPieces(tache: string): string {
  if (tache === "pieces" || tache === "attestations") {
    return "Ce que le client a déposé. Vous pouvez ouvrir chaque pièce, la valider ou en demander une autre.";
  }
  if (tache === "actes" || tache === "relecture") {
    return "Ce que le cabinet a écrit. Le PDF s'ouvre ici, le Word se corrige et se redépose.";
  }
  return "Les documents du dossier.";
}

/**
 * Ce qu'il reste à faire sur le dossier.
 *
 * L'avocat ouvrait cinq onglets et une colonne de sous-phases, et devait reconstituer
 * lui-même l'état du dossier pour savoir par où commencer. Ici, les tâches sont dans
 * l'ordre, chacune dit pourquoi elle existe, et celle qui attend dit ce qu'elle attend.
 */
export function Travail({
  livrables,
  dossier,
  taches,
  peutProduireLesActes,
  informationsVerifiees,
  pieces,
}: {
  dossier: number;
  taches: Tache[];
  /** Les pièces du dossier : les tâches montrent celles dont elles parlent. */
  pieces: PieceAffichee[];
  /**
   * Les documents que le cabinet remet au client.
   *
   * Ils tenaient leur propre carte au bas de la page : ce sont les pièces de l'étape
   * « Déposer », et ils se rangent avec les tâches qui les réclament. La page passe ce
   * qu'il faut pour les décrire, non les éléments eux-mêmes : un élément fabriqué par
   * la page et rendu ici, dans une liste, fait réclamer une clé à React.
   */
  livrables: { documentFinal: string; aLeKbis: boolean; aLeRbe: boolean };
  /** Les actes se produisent d'ici : c'est une commande, non un écran. */
  peutProduireLesActes: boolean;
  /**
   * L'avocat a déclaré avoir relu le récapitulatif.
   *
   * On le sait pour pouvoir revenir dessus : une tâche cochée par la sous-phase du
   * dossier ne se décoche pas ici, mais une relecture déclarée, si - le client corrige,
   * et il faut relire.
   */
  informationsVerifiees: boolean;
}) {
  const [refus, setRefus] = useState<string | null>(null);
  /** La demande de corrections, et ce qu'on y écrit. */
  const [corrections, setCorrections] = useState(false);
  const [motif, setMotif] = useState("");
  /*
   * La tâche dont on regarde les pièces.
   *
   * « Voir les documents » menait au même onglet depuis trois tâches différentes, et il
   * fallait ensuite retrouver dans la liste entière les deux pièces dont il s'agissait.
   */
  const [piecesMontrees, setPiecesMontrees] = useState<string | null>(null);
  const [retour, setRetour] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const router = useRouter();

  const restantes = taches.filter((t) => t.etat !== "faite").length;

  function produire() {
    setRefus(null);
    setRetour(null);
    demarrer(async () => {
      const reponse = await fetch("/api/formalites/modification/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossier }),
      });
      const corps = await reponse.json().catch(() => ({}));

      if (!reponse.ok) {
        setRefus(corps.error ?? "Les actes n'ont pas pu être produits");
        return;
      }
      setRetour(
        (corps.documents?.length ?? 0) + " actes produits, visibles dans l'onglet Pièces."
      );
      router.refresh();
    });
  }

  /** Rend les actes visibles au client, après relecture. */
  function mettreADisposition() {
    setRefus(null);
    demarrer(async () => {
      const reponse = await fetch("/api/avocat/actes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossier }),
      });
      const corps = await reponse.json().catch(() => ({}));

      if (!reponse.ok) {
        setRefus(corps.error ?? "Les actes n'ont pas pu être mis à disposition");
        return;
      }
      setRetour(
        corps.publies === 1
          ? "L'acte est disponible dans l'espace du client, qui en est prévenu."
          : corps.publies + " actes sont disponibles dans l'espace du client, qui en est prévenu."
      );
      router.refresh();
    });
  }

  /**
   * Déclarer la relecture du récapitulatif, ou revenir dessus.
   *
   * La tâche n'avait aucun geste pour s'accomplir : « Y aller » menait au récapitulatif,
   * et rien au retour ne permettait de dire qu'on l'avait lu.
   */
  function marquerLaRelecture(verifiees: boolean) {
    setRefus(null);
    setRetour(null);
    demarrer(async () => {
      const reponse = await fetch("/api/avocat/dossier", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossier, informationsVerifiees: verifiees }),
      });

      if (!reponse.ok) {
        setRefus("La vérification n'a pas pu être enregistrée");
        return;
      }
      setRetour(
        verifiees
          ? "Informations vérifiées : c'est inscrit au journal du dossier."
          : "Les informations sont de nouveau à relire."
      );
      router.refresh();
    });
  }

  /**
   * Renvoyer le dossier au client, en disant ce qu'il doit reprendre.
   *
   * La demande passait par window.prompt : une boîte grise du navigateur, sans le nom
   * du dossier, sans dire ce qu'elle déclenche, et qui gèle la page tant qu'on n'a pas
   * répondu. Le motif part pourtant au client tel quel - c'est la seule chose qu'il
   * lira - et il mérite plus de deux lignes et un champ d'une ligne.
   */
  /**
   * Retirer de l'espace du client les actes qu'on vient d'y mettre.
   *
   * Publier n'avait pas d'envers : un acte mis à disposition par erreur restait chez le
   * client, qui pouvait le signer ou l'envoyer à sa banque.
   */
  function retirerDeLEspaceClient() {
    setRefus(null);
    setRetour(null);
    demarrer(async () => {
      const reponse = await fetch("/api/avocat/actes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossier }),
      });
      const corps = await reponse.json().catch(() => ({}));

      if (!reponse.ok) {
        setRefus(corps.error ?? "Les actes n'ont pas pu être retirés");
        return;
      }
      setRetour(
        corps.retires === 1
          ? "L'acte est retiré de l'espace du client, qui en est prévenu."
          : corps.retires + " actes sont retirés de l'espace du client, qui en est prévenu."
      );
      router.refresh();
    });
  }

  function demanderDesCorrections() {
    const texte = motif.trim();
    if (!texte) return;

    setRefus(null);
    demarrer(async () => {
      const reponse = await fetch("/api/avocat/dossier", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dossier,
          etat: "corrections_demandees",
          commentaire: texte,
        }),
      });

      if (!reponse.ok) {
        setRefus("La demande n'a pas pu être envoyée");
        return;
      }
      setCorrections(false);
      setMotif("");
      setRetour("Le client est prévenu de ce qu'il doit reprendre.");
      router.refresh();
    });
  }

  const phases = phasesDuCabinet(taches);

  /*
   * La tâche qui attend maintenant : la première qui n'est ni faite ni empêchée.
   *
   * Elle seule porte son explication et un bouton plein. Les six autres répétaient
   * chacune leur phrase à chaque visite, et sept boutons noirs se disputaient l'œil
   * sans qu'aucun dise par où commencer.
   */
  const suivante = taches.find((t) => t.etat !== "faite" && !t.bloquee);

  return (
    <div className={styles.travail}>
      {/*
        Le compte est dit une fois, en tête de page.

        « 5 choses à faire » ici, « 2/7 tâches faites » dans le bandeau, « 1 sur 2 »
        dans la frise et « 1 / 2 » sur l'accordéon : quatre écritures du même total sur
        un écran. Seul reste ce qu'on ne lit nulle part ailleurs - que tout est fait.
      */}
      {restantes === 0 && <h2 className={styles.titre}>Tout est fait sur ce dossier</h2>}

      {/*
        Les trois étapes, dépliées.

        Elles se repliaient : voir « Rédiger » puis « Déposer » demandait deux clics,
        et ouvrir l'une fermait l'autre. Sept tâches tiennent sur un écran - il n'y
        avait rien à replier, seulement à cacher.
      */}
      {phases.map((phase, rang) => (
        <section key={phase.cle} className={styles.phase}>
          <div className={styles.phaseTete}>
            {/* Le rang et la coche : ce que la frise disait, là où on le lit. */}
            <span
              className={
                phase.etat === "faite"
                  ? `${styles.phasePastille} ${styles.phaseFaite}`
                  : phase.etat === "en_cours"
                    ? `${styles.phasePastille} ${styles.phaseEnCours}`
                    : styles.phasePastille
              }
              aria-hidden="true"
            >
              {phase.etat === "faite" ? "✓" : rang + 1}
            </span>
            <h2 className={styles.phaseTitre}>
              {phase.titre}
              {phase.etat === "en_cours" && (
                <span className={styles.phaseMarque}>en cours</span>
              )}
            </h2>
            <span className={styles.phaseCompte}>
              {phase.faites} / {phase.taches.length}
            </span>
          </div>

            <ol className={styles.taches}>
                {phase.taches.map((tache) => {
                  const cestElle = tache.identifiant === suivante?.identifiant;
                  /* Un seul bouton plein sur l'écran : celui de la tâche qui attend. */
                  const geste = cestElle ? styles.travailPrincipal : styles.travailSecondaire;
                  return (
          <li
            key={tache.identifiant}
            className={
              tache.etat === "faite"
                ? `${styles.tache} ${styles.tacheFaite}`
                : tache.bloquee
                  ? `${styles.tache} ${styles.tacheBloquee}`
                  : cestElle
                    ? `${styles.tache} ${styles.tacheSuivante}`
                    : styles.tache
            }
          >
            <span className={styles.tacheCoche} aria-hidden="true">
              {tache.etat === "faite" ? "✓" : ""}
            </span>

            <div className={styles.tacheCorps}>
              <span className={styles.tacheTitre}>{tache.titre}</span>
              {/* La phrase n'aide que là où l'on va agir. */}
              {cestElle && (
                <span className={styles.tacheExplication}>{tache.explication}</span>
              )}

              {tache.bloquee && <span className={styles.tacheBlocage}>{tache.bloquee}</span>}

              {/*
                Revenir sur une relecture déclarée.
                
                Le client corrige parfois après coup, et il faut relire. Seule une
                relecture déclarée se retire : une tâche cochée parce que le dossier a
                dépassé l'étape ne se décoche pas d'un lien.
              */}
              {/*
                Une tâche faite se relit.
                
                Elle ne portait plus rien : « Produire les actes » cochée, on n'avait
                aucun chemin vers ce qui avait été produit, et il fallait deviner que
                cela vivait dans l'onglet des pièces.
              */}
              {tache.etat === "faite" && tache.onglet === "pieces" && (
                <span className={styles.tacheActions}>
                  <button
                    type="button"
                    className={styles.travailTertiaire}
                    onClick={() => setPiecesMontrees(tache.identifiant)}
                  >
                    {libelleDesPieces(tache.identifiant)}
                  </button>
                </span>
              )}

              {/*
                Ce qui est fait peut se défaire, quand cela a un sens.
                
                Un acte publié par erreur restait chez le client : le geste le remet en
                relecture et l'en prévient.
              */}
              {tache.identifiant === "relecture" && tache.etat === "faite" && (
                <span className={styles.tacheActions}>
                  <button
                    type="button"
                    className={styles.travailTertiaire}
                    onClick={retirerDeLEspaceClient}
                    disabled={enCours}
                  >
                    Retirer de l&apos;espace du client
                  </button>
                </span>
              )}

              {tache.identifiant === "informations" &&
                tache.etat === "faite" &&
                informationsVerifiees && (
                  <span className={styles.tacheActions}>
                    <button
                      type="button"
                      className={styles.travailTertiaire}
                      onClick={() => marquerLaRelecture(false)}
                      disabled={enCours}
                    >
                      Revenir dessus
                    </button>
                  </span>
                )}

              {tache.etat !== "faite" && !tache.bloquee && (
                <span className={styles.tacheActions}>
                  {tache.identifiant === "relecture" ? (
                    /*
                      Le geste qui rend les actes visibles au client.
                      Jusque-là, ce qui sort du gabarit n'a été lu par personne : le
                      client pouvait le signer ou l'envoyer à sa banque tel quel.
                    */
                    <button
                      type="button"
                      className={geste}
                      onClick={mettreADisposition}
                      disabled={enCours}
                    >
                      {enCours ? "Mise à disposition" : "Mettre à disposition du client"}
                    </button>
                  ) : tache.identifiant === "actes" && peutProduireLesActes ? (
                    <button
                      type="button"
                      className={geste}
                      onClick={produire}
                      disabled={enCours}
                    >
                      {enCours ? "Production" : "Produire les actes"}
                    </button>
                  ) : tache.identifiant === "informations" ? (
                    /*
                      Lire, puis dire qu'on a lu.
                      
                      Deux gestes distincts : le récapitulatif s'ouvre dans son onglet,
                      et la case ne se coche qu'au retour, par une déclaration. Un seul
                      bouton « Y aller » laissait la tâche ouverte indéfiniment.
                    */
                    <>
                      <button
                        type="button"
                        className={geste}
                        onClick={() => marquerLaRelecture(true)}
                        disabled={enCours}
                      >
                        {enCours ? "Enregistrement" : "J'ai vérifié les informations"}
                      </button>
                      <Link
                        href={"/avocat/" + dossier + "?onglet=" + (tache.onglet ?? "recapitulatif")}
                        className={styles.travailSecondaire}
                      >
                        Relire le récapitulatif
                      </Link>
                    </>
                  ) : tache.onglet === "pieces" ? (
                    /*
                      Les pièces s'ouvrent en fenêtre, faite ou non.
                      
                      « Y aller » emmenait dans l'onglet du dossier, devant l'ensemble
                      des documents : on quittait sa liste pour retrouver ensuite les
                      deux pièces dont la tâche parlait.
                    */
                    <button
                      type="button"
                      className={geste}
                      onClick={() => setPiecesMontrees(tache.identifiant)}
                    >
                      {libelleDesPieces(tache.identifiant)}
                    </button>
                  ) : tache.onglet === "avancement" ? (
                    /*
                      Le dépôt se marque plus bas, dans la même page.
                      
                      « Y aller » menait à l'onglet de l'avancement, qui a rejoint
                      celui-ci : le bouton rechargeait donc l'écran où l'on était déjà.
                      Le dépôt lui-même se fait au guichet de l'INPI, hors d'ici ; ce
                      qui se fait ici, c'est de dire qu'il a eu lieu.
                    */
                    <a href="#avancement" className={geste}>
                      Marquer l&apos;avancement
                    </a>
                  ) : (
                    tache.onglet && (
                      <Link
                        href={"/avocat/" + dossier + "?onglet=" + tache.onglet}
                        className={geste}
                      >
                        Y aller
                      </Link>
                    )
                  )}
                </span>
              )}
            </div>
                  </li>
                  );
                })}
            </ol>

            {/* Les documents remis closent l'étape du dépôt. */}
            {phase.cle === "depot" && (
              <Livrables
                dossierId={dossier}
                documentFinal={livrables.documentFinal}
                aLeKbis={livrables.aLeKbis}
                aLeRbe={livrables.aLeRbe}
              />
            )}
        </section>
      ))}

      {/*
        Renvoyer le dossier au client ferme le travail : le geste se pose au bout.

        Il occupait une bande à lui seul en tête de l'onglet, au-dessus des étapes -
        soixante-quinze pixels pour une sortie qu'on emprunte rarement.
      */}
      <div className={styles.travailPied}>
        <button
          type="button"
          className={styles.travailSecondaire}
          onClick={() => setCorrections(true)}
          disabled={enCours}
        >
          Demander des corrections au client
        </button>
      </div>

      {piecesMontrees && (
        <FenetreDesPieces
          titre={titreDesPieces(piecesMontrees)}
          explication={explicationDesPieces(piecesMontrees)}
          pieces={piecesDeLaTache(pieces, piecesMontrees)}
          dossier={dossier}
          surFermeture={() => setPiecesMontrees(null)}
        />
      )}

      {corrections && (
        <>
          {/* Le voile ne masque pas la liste : on écrit en regardant ce qui cloche. */}
          <div
            className={styles.voile}
            onClick={() => setCorrections(false)}
            aria-hidden="true"
          />

          <div
            className={styles.fenetreCorrections}
            role="dialog"
            aria-modal="true"
            aria-label="Demander des corrections au client"
          >
            <h3 className={styles.fenetreCorrectionsTitre}>Demander des corrections au client</h3>
            <p className={styles.fenetreCorrectionsDetail}>
              Le dossier repasse de son côté et il en est prévenu par courriel. Ce que
              vous écrivez ici est ce qu&apos;il lira : dites ce qui cloche et ce que
              vous attendez de lui.
            </p>

            <label className={styles.fenetreCorrectionsLabel} htmlFor="motif-corrections">
              Ce que le client doit reprendre
            </label>
            <textarea
              id="motif-corrections"
              className={styles.fenetreCorrectionsChamp}
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              rows={4}
              maxLength={1000}
              autoFocus
              placeholder="Le justificatif de jouissance est au nom d'un tiers : il nous faut un bail ou une attestation au nom de la société."
            />

            <div className={styles.fenetreCorrectionsActions}>
              <button
                type="button"
                className={styles.travailSecondaire}
                onClick={() => setCorrections(false)}
                disabled={enCours}
              >
                Annuler
              </button>
              <button
                type="button"
                className={styles.travailPrincipal}
                onClick={demanderDesCorrections}
                disabled={enCours || !motif.trim()}
              >
                {enCours ? "Envoi" : "Envoyer la demande"}
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
      {refus && (
        <p className={styles.travailRefus} role="alert">
          {refus}
        </p>
      )}
    </div>
  );
}
