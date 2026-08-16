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
}: {
  dossier: number;
  taches: Tache[];
  /** Les actes se produisent d'ici : c'est une commande, non un écran. */
  peutProduireLesActes: boolean;
}) {
  const [refus, setRefus] = useState<string | null>(null);
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

  function demanderDesCorrections() {
    const motif = window.prompt("Que doit reprendre le client ?");
    if (!motif?.trim()) return;

    setRefus(null);
    demarrer(async () => {
      const reponse = await fetch("/api/avocat/dossier", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dossier,
          etat: "corrections_demandees",
          commentaire: motif.trim(),
        }),
      });

      if (!reponse.ok) {
        setRefus("La demande n'a pas pu être envoyée");
        return;
      }
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
          onClick={demanderDesCorrections}
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

              {tache.etat !== "faite" && !tache.bloquee && (
                <span className={styles.tacheActions}>
                  {tache.identifiant === "actes" && peutProduireLesActes ? (
                    <button
                      type="button"
                      className={styles.travailPrincipal}
                      onClick={produire}
                      disabled={enCours}
                    >
                      {enCours ? "Production" : "Produire les actes"}
                    </button>
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
