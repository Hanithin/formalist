"use client";

import { useState, useTransition } from "react";
import { soumettreSansEffacer } from "@/components/formulaire/soumission";
import styles from "../Authentification.module.css";

/**
 * Demande d'un lien de réinitialisation.
 *
 * Une fois la demande partie, le formulaire disparaît au profit du message : le
 * laisser inviterait à recommencer, et chaque nouvelle demande invalide le lien
 * précédent - on finirait par cliquer sur un lien périmé en croyant qu'il ne marche
 * pas.
 */
export function FormulaireDemande() {
  const [envoye, setEnvoye] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  function soumettre(donnees: FormData) {
    setErreur(null);
    demarrer(async () => {
      const reponse = await fetch("/api/auth/mot-de-passe-oublie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: donnees.get("email") }),
      });

      const corps = await reponse.json().catch(() => ({}));
      if (!reponse.ok) {
        setErreur(corps.error ?? "Demande impossible. Réessayez dans un instant.");
        return;
      }
      setEnvoye(corps.message as string);
    });
  }

  if (envoye) {
    return (
      <p role="status" className={styles.authNotice}>
        {envoye}
      </p>
    );
  }

  return (
    <form onSubmit={soumettreSansEffacer(soumettre)} noValidate>
      <div className={styles.formGroup}>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          placeholder="vous@exemple.com"
          autoComplete="email"
          required
          autoFocus
        />
      </div>

      {erreur && (
        <p role="alert" aria-live="polite" className={styles.authError}>
          {erreur}
        </p>
      )}

      <button className={styles.btnLogin} type="submit" disabled={enCours}>
        {enCours ? "Envoi en cours" : "Recevoir un lien"}
      </button>
    </form>
  );
}
