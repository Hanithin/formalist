"use client";

import { useState, useTransition } from "react";
import { soumettreSansEffacer } from "@/components/formulaire/soumission";
import { useRouter } from "next/navigation";
import styles from "../../Authentification.module.css";

/**
 * Choix du nouveau mot de passe, depuis le lien reçu par email.
 *
 * La confirmation est demandée : une faute de frappe dans un champ masqué ne se voit
 * pas, et on se retrouverait enfermé dehors juste après avoir refait son mot de
 * passe. Elle se vérifie ici, sans aller-retour au serveur.
 */
export function FormulaireNouveau({ jeton }: { jeton: string }) {
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const router = useRouter();

  function soumettre(donnees: FormData) {
    setErreur(null);

    const motDePasse = String(donnees.get("motDePasse") ?? "");
    if (motDePasse !== String(donnees.get("confirmation") ?? "")) {
      setErreur("Les deux mots de passe ne sont pas identiques.");
      return;
    }

    demarrer(async () => {
      const reponse = await fetch("/api/auth/mot-de-passe-oublie", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jeton, motDePasse }),
      });

      const corps = await reponse.json().catch(() => ({}));
      if (!reponse.ok) {
        setErreur(corps.error ?? "Changement impossible. Réessayez dans un instant.");
        return;
      }

      // La session est déjà ouverte par la réponse : on entre directement.
      router.push("/tableau-de-bord");
      router.refresh();
    });
  }

  return (
    <form onSubmit={soumettreSansEffacer(soumettre)} noValidate>
      <div className={styles.formGroup}>
        <label htmlFor="motDePasse">Nouveau mot de passe</label>
        <input
          id="motDePasse"
          name="motDePasse"
          type="password"
          placeholder="Au moins 8 caractères"
          autoComplete="new-password"
          required
          autoFocus
        />
      </div>

      <div className={styles.formGroup}>
        <label htmlFor="confirmation">Confirmez</label>
        <input
          id="confirmation"
          name="confirmation"
          type="password"
          placeholder="Le même, pour être sûr"
          autoComplete="new-password"
          required
        />
      </div>

      {erreur && (
        <p role="alert" aria-live="polite" className={styles.authError}>
          {erreur}
        </p>
      )}

      <button className={styles.btnLogin} type="submit" disabled={enCours}>
        {enCours ? "Enregistrement" : "Changer mon mot de passe"}
      </button>
    </form>
  );
}
