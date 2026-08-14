"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import styles from "../Authentification.module.css";

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

      <div className={styles.formGroup}>
        <div className={styles.labelLigne}>
          <label htmlFor="motDePasse">Mot de passe</label>
          {/* Le lien est ici, et non en bas de page : c'est au moment de buter sur ce
              champ qu'on cherche cette issue. */}
          <Link href="/mot-de-passe-oublie" className={styles.lienOubli}>
            Mot de passe oublié ?
          </Link>
        </div>
        <input
          id="motDePasse"
          name="motDePasse"
          type="password"
          placeholder="Votre mot de passe"
          autoComplete="current-password"
          required
        />
      </div>

      {erreur && (
        <p role="alert" aria-live="polite" className={styles.authError}>
          {erreur}
        </p>
      )}

      <button className={styles.btnLogin} type="submit" disabled={enCours}>
        {enCours ? "Connexion en cours" : "Se connecter"}
      </button>
    </form>
  );
}
