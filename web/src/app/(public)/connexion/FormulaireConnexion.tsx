"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function FormulaireConnexion() {
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const router = useRouter();
  const parametres = useSearchParams();

  function soumettre(donnees: FormData) {
    setErreur(null);
    demarrer(async () => {
      const reponse = await fetch("/api/auth/connexion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: donnees.get("email"),
          motDePasse: donnees.get("motDePasse"),
        }),
      });

      if (!reponse.ok) {
        const corps = await reponse.json().catch(() => ({}));
        setErreur(corps.error ?? "Connexion impossible. Réessayez dans un instant.");
        return;
      }

      // On revient là où la personne allait avant d'être renvoyée ici. Le chemin
      // vient de l'adresse : on refuse toute destination hors du site.
      const suite = parametres.get("suite");
      router.push(suite?.startsWith("/") && !suite.startsWith("//") ? suite : "/tableau-de-bord");
      router.refresh();
    });
  }

  return (
    <form action={soumettre} noValidate>
      <label htmlFor="email">Adresse email</label>
      <input id="email" name="email" type="email" autoComplete="email" required autoFocus />

      <label htmlFor="motDePasse">Mot de passe</label>
      <input
        id="motDePasse"
        name="motDePasse"
        type="password"
        autoComplete="current-password"
        required
      />

      <button type="submit" disabled={enCours}>
        {enCours ? "Connexion en cours" : "Se connecter"}
      </button>

      {erreur && (
        <p role="alert" aria-live="polite">
          {erreur}
        </p>
      )}
    </form>
  );
}
