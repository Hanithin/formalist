"use client";

import { useState, useTransition } from "react";
import { LONGUEUR_MAXIMALE_DESCRIPTION } from "@/domain/formalite/objet-social";
import styles from "./Parcours.module.css";

/**
 * L'objet social, rédigé par l'IA à partir de quelques mots.
 *
 * Reprise du bloc de public/creation.html : la ligne d'explication en violet, la
 * saisie courte avec son bouton « Générer », et le texte produit dans une zone
 * qui reste modifiable.
 *
 * Deux différences avec l'original, toutes deux voulues :
 *
 *   - la proposition n'écrase pas un texte déjà écrit sans le dire. L'original
 *     remplaçait la zone d'un coup ; ici la substitution est confirmée, parce
 *     qu'un objet social relu et ajusté représente un vrai travail.
 *   - l'échec s'affiche à côté du champ, et non dans une alerte du navigateur.
 *     Sans clé de rédaction configurée, le service répond 503 : on le dit, et la
 *     saisie manuelle reste ouverte.
 */

interface Props {
  /** Le texte retenu, qui partira dans les statuts. */
  valeur: string;
  surChangement: (texte: string) => void;
  /** La description courte, gardée pour pouvoir relancer une génération. */
  description: string;
  surDescription: (texte: string) => void;
  anomalie?: string;
}

export function ObjetSocial({
  valeur,
  surChangement,
  description,
  surDescription,
  anomalie,
}: Props) {
  const [erreur, setErreur] = useState<string | null>(null);
  const [avertissement, setAvertissement] = useState<string | null>(null);
  const [aConfirmer, setAConfirmer] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  function generer() {
    const propre = description.trim();
    if (!propre) return;

    setErreur(null);
    setAvertissement(null);

    demarrer(async () => {
      try {
        const reponse = await fetch("/api/objet-social", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ description: propre }),
        });
        const donnees = (await reponse.json()) as {
          proposition?: string;
          avertissement?: string;
          error?: string;
        };

        if (!reponse.ok || !donnees.proposition) {
          setErreur(donnees.error ?? "La rédaction assistée n'a rien renvoyé");
          return;
        }

        if (valeur.trim()) {
          // Un texte est déjà là : on ne le remplace pas dans son dos.
          setAConfirmer(donnees.proposition);
        } else {
          surChangement(donnees.proposition);
        }
        setAvertissement(donnees.avertissement ?? null);
      } catch {
        setErreur("La rédaction assistée est injoignable");
      }
    });
  }

  return (
    <div className={styles.objet}>
      <p className={styles.objetAide}>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5" />
          <path d="M2 12l10 5 10-5" />
        </svg>
        Décrivez votre activité en quelques mots et l&apos;IA rédigera l&apos;objet social complet
      </p>

      <div className={styles.objetSaisie}>
        <input
          id="descriptionActivite"
          value={description}
          maxLength={LONGUEUR_MAXIMALE_DESCRIPTION}
          placeholder="Ex : vente de vêtements en ligne, consulting IT, restaurant japonais..."
          aria-label="Décrivez votre activité"
          onChange={(e) => surDescription(e.target.value)}
          onKeyDown={(e) => {
            // Entrée génère : dans un formulaire, elle enverrait la page.
            if (e.key === "Enter") {
              e.preventDefault();
              generer();
            }
          }}
        />
        <button
          type="button"
          className={styles.objetBouton}
          onClick={generer}
          disabled={enCours || !description.trim()}
        >
          {enCours ? (
            <>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
              Génération
            </>
          ) : (
            <>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
              Générer
            </>
          )}
        </button>
      </div>

      {erreur && (
        <p role="alert" className={styles.objetErreur}>
          {erreur}. Vous pouvez rédiger l&apos;objet social vous-même ci-dessous.
        </p>
      )}

      {aConfirmer && (
        <div className={styles.objetConfirmation} role="alert">
          <p>
            Un objet social est déjà écrit. Le remplacer par la proposition ? Votre texte actuel
            sera perdu.
          </p>
          <div className={styles.objetConfirmationGestes}>
            <button
              type="button"
              onClick={() => {
                surChangement(aConfirmer);
                setAConfirmer(null);
              }}
            >
              Remplacer
            </button>
            <button type="button" onClick={() => setAConfirmer(null)}>
              Garder mon texte
            </button>
          </div>
        </div>
      )}

      <textarea
        id="activite"
        className={styles.objetTexte}
        value={valeur}
        placeholder="L'objet social apparaîtra ici après génération, ou rédigez-le vous-même..."
        aria-label="Objet social"
        onChange={(e) => surChangement(e.target.value)}
      />

      {avertissement && <p className={styles.objetNote}>{avertissement}</p>}
      {anomalie && <p role="alert">{anomalie}</p>}
    </div>
  );
}
