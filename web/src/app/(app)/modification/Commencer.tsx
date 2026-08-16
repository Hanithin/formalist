"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MODIFICATIONS } from "@/domain/modification/types";
import styles from "./Modification.module.css";

/**
 * L'entrée du parcours.
 *
 * Les huit changements y sont cochables, et la sélection part avec le dossier : on
 * arrive à l'étape des changements avec ses cases déjà faites. La première version
 * les affichait en cartes inertes, qui avaient tout l'air de cases à cocher et n'en
 * étaient pas - on cliquait sans que rien ne se passe.
 *
 * Le dossier s'ouvre sans société : elle se cherche à la première étape, au registre.
 * C'est ce qui permet de modifier une société créée ailleurs, c'est-à-dire la plupart.
 */
export function Commencer() {
  const [codes, setCodes] = useState<string[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const router = useRouter();

  function basculer(code: string) {
    setCodes((precedents) =>
      precedents.includes(code) ? precedents.filter((c) => c !== code) : [...precedents, code]
    );
  }

  function ouvrir() {
    setErreur(null);
    demarrer(async () => {
      const reponse = await fetch("/api/formalites/modification", { method: "POST" });
      const corps = await reponse.json().catch(() => ({}));

      if (!reponse.ok) {
        setErreur(corps.error ?? "Le dossier n'a pas pu être ouvert");
        return;
      }

      // La sélection suit le dossier : la reperdre en changeant d'écran ferait
      // recommencer le geste qu'on vient de faire.
      if (codes.length > 0) {
        await fetch("/api/formalites/modification", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dossier: corps.dossier, codes }),
        });
      }

      router.push("/modification?dossier=" + corps.dossier);
    });
  }

  return (
    <div className={styles.contenu}>
      <h2>Que voulez-vous changer ?</h2>
      <p className={styles.description}>
        Cochez ce qui est décidé - une même assemblée peut en décider plusieurs. Nous rédigeons les
        actes, publions l&apos;annonce et déposons au guichet unique. Vos statuts sont mis à jour
        article par article, sur votre document d&apos;origine.
      </p>

      <ul className={styles.changements}>
        {MODIFICATIONS.map((m) => (
          <li key={m.code}>
            <label
              className={
                codes.includes(m.code)
                  ? `${styles.changement} ${styles.changementChoisi}`
                  : styles.changement
              }
            >
              <input
                type="checkbox"
                checked={codes.includes(m.code)}
                onChange={() => basculer(m.code)}
              />
              <span className={styles.changementCase} aria-hidden="true">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </span>
              <span className={styles.changementTitre}>{m.libelle}</span>
              <span className={styles.changementDesc}>{m.description}</span>
            </label>
          </li>
        ))}
      </ul>

      {erreur && <p role="alert">{erreur}</p>}

      <div className={styles.actions}>
        <span className={styles.compte}>
          {codes.length === 0
            ? "Vous pourrez aussi les choisir à l'étape suivante"
            : codes.length === 1
              ? "1 modification sélectionnée"
              : codes.length + " modifications sélectionnées"}
        </span>
        <button type="button" className={styles.principal} onClick={ouvrir} disabled={enCours}>
          {enCours ? "Ouverture" : "Commencer"}
        </button>
      </div>
    </div>
  );
}
