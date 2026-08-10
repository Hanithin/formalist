"use client";

import { useState, useTransition } from "react";
import styles from "../Authentification.module.css";

export function FormulaireInscription() {
  const [erreurs, setErreurs] = useState<Record<string, string[]>>({});
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  function soumettre(donnees: FormData) {
    setErreurs({});
    demarrer(async () => {
      const reponse = await fetch("/api/auth/inscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(donnees)),
      });
      const corps = await reponse.json().catch(() => ({}));

      if (!reponse.ok) {
        setErreurs(corps.details ?? { _: [corps.error ?? "Inscription impossible"] });
        return;
      }
      setConfirmation(corps.message);
    });
  }

  if (confirmation) {
    return (
      <p role="status" aria-live="polite">
        {confirmation}
      </p>
    );
  }

  const erreur = (champ: string) => erreurs[champ]?.[0];

  return (
    <form action={soumettre} noValidate>
      <label htmlFor="prenom">Prénom</label>
      <input id="prenom" name="prenom" autoComplete="given-name" required />
      {erreur("prenom") && <p role="alert">{erreur("prenom")}</p>}

      <label htmlFor="nom">Nom</label>
      <input id="nom" name="nom" autoComplete="family-name" required />
      {erreur("nom") && <p role="alert">{erreur("nom")}</p>}

      <label htmlFor="email">Adresse email</label>
      <input id="email" name="email" type="email" autoComplete="email" required />
      {erreur("email") && <p role="alert">{erreur("email")}</p>}

      <label htmlFor="motDePasse">Mot de passe</label>
      <input
        id="motDePasse"
        name="motDePasse"
        type="password"
        autoComplete="new-password"
        minLength={8}
        required
        aria-describedby="aide-mot-de-passe"
      />
      {/* On dit la règle avant la saisie, pas après le refus. */}
      <p id="aide-mot-de-passe" className={styles.aide}>
        Au moins 8 caractères. Une phrase est plus sûre et plus facile à retenir qu&apos;un mot
        compliqué.
      </p>
      {erreur("motDePasse") && <p role="alert">{erreur("motDePasse")}</p>}

      {erreur("_") && <p role="alert">{erreur("_")}</p>}

      <button type="submit" disabled={enCours}>
        {enCours ? "Création en cours" : "Créer mon compte"}
      </button>
    </form>
  );
}
