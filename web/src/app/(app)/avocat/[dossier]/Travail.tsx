"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Tache } from "@/domain/formalite/cabinet";
import styles from "../Avocat.module.css";

/**
 * Ce qu'il reste à faire sur le dossier.
 *
 * L'avocat ouvrait cinq onglets et une colonne de sous-phases, et devait reconstituer
 * lui-même l'état du dossier pour savoir par où commencer. Ici, les tâches sont dans
 * l'ordre, chacune dit pourquoi elle existe, et celle qui attend dit ce qu'elle attend.
 */
export function Travail({
  dossier,
  taches,
  peutProduireLesActes,
  informationsVerifiees,
}: {
  dossier: number;
  taches: Tache[];
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

  return (
    <div className={styles.travail}>
      <div className={styles.travailTete}>
        <h2 className={styles.titre}>
          {restantes === 0
            ? "Tout est fait sur ce dossier"
            : restantes === 1
              ? "Une chose à faire"
              : restantes + " choses à faire"}
        </h2>
        <button
          type="button"
          className={styles.travailSecondaire}
          onClick={() => setCorrections(true)}
          disabled={enCours}
        >
          Demander des corrections au client
        </button>
      </div>

      <ol className={styles.taches}>
        {taches.map((tache) => (
          <li
            key={tache.identifiant}
            className={
              tache.etat === "faite"
                ? `${styles.tache} ${styles.tacheFaite}`
                : tache.bloquee
                  ? `${styles.tache} ${styles.tacheBloquee}`
                  : styles.tache
            }
          >
            <span className={styles.tacheCoche} aria-hidden="true">
              {tache.etat === "faite" ? "✓" : ""}
            </span>

            <div className={styles.tacheCorps}>
              <span className={styles.tacheTitre}>{tache.titre}</span>
              <span className={styles.tacheExplication}>{tache.explication}</span>

              {tache.bloquee && <span className={styles.tacheBlocage}>{tache.bloquee}</span>}

              {/*
                Revenir sur une relecture déclarée.
                
                Le client corrige parfois après coup, et il faut relire. Seule une
                relecture déclarée se retire : une tâche cochée parce que le dossier a
                dépassé l'étape ne se décoche pas d'un lien.
              */}
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
                      className={styles.travailPrincipal}
                      onClick={mettreADisposition}
                      disabled={enCours}
                    >
                      {enCours ? "Mise à disposition" : "Mettre à disposition du client"}
                    </button>
                  ) : tache.identifiant === "actes" && peutProduireLesActes ? (
                    <button
                      type="button"
                      className={styles.travailPrincipal}
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
                        className={styles.travailPrincipal}
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
                  ) : (
                    tache.onglet && (
                      <Link
                        href={"/avocat/" + dossier + "?onglet=" + tache.onglet}
                        className={styles.travailPrincipal}
                      >
                        Y aller
                      </Link>
                    )
                  )}
                </span>
              )}
            </div>
          </li>
        ))}
      </ol>

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
