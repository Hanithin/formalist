"use client";

import { useState, useTransition } from "react";
import { soumettreSansEffacer } from "@/components/formulaire/soumission";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import styles from "../Authentification.module.css";

export function FormulaireConnexion() {
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const router = useRouter();
  const parametres = useSearchParams();

  /*
   * L'adresse à confirmer, et ce qu'on répond quand on renvoie le lien.
   *
   * Le refus disait « ouvrez le lien reçu par email » à quelqu'un qui n'avait rien
   * reçu, et il n'avait aucune issue : la route de renvoi existait côté serveur, mais
   * aucun écran ne la connaissait. Une inscription dont le courriel a échoué laissait
   * son auteur enfermé dehors, sans autre recours que d'écrire au support.
   */
  const [aConfirmer, setAConfirmer] = useState<string | null>(null);
  /*
   * L'adresse survit à un refus.
   *
   * React réinitialise un formulaire après son action : à chaque mot de passe manqué,
   * l'adresse s'effaçait et il fallait la retaper. Deux essais suffisaient à agacer,
   * et la troisième tentative se faisait souvent sur une adresse mal recopiée - ce qui
   * changeait l'erreur sans rapprocher de la solution.
   */
  const [adresse, setAdresse] = useState("");
  const [renvoi, setRenvoi] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [renvoiEnCours, setRenvoiEnCours] = useState(false);

  function renvoyerLeLien() {
    if (!aConfirmer || renvoiEnCours) return;
    setRenvoiEnCours(true);
    setRenvoi(null);

    demarrer(async () => {
      try {
        const reponse = await fetch("/api/auth/renvoyer-verification", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: aConfirmer }),
        });
        const corps = await reponse.json().catch(() => ({}));
        setRenvoi(
          corps.message ??
            (reponse.ok
              ? "Un nouveau lien vient d'être envoyé."
              : "Le lien n'a pas pu être renvoyé. Réessayez dans un instant.")
        );
      } finally {
        setRenvoiEnCours(false);
      }
    });
  }

  function soumettre(donnees: FormData) {
    setErreur(null);
    setAConfirmer(null);
    setRenvoi(null);
    setAdresse(String(donnees.get("email") ?? ""));
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
        /*
         * L'adresse n'est retenue que dans ce cas : le mot de passe a été vérifié, et
         * c'est la confirmation qui manque. On la garde pour pouvoir renvoyer le lien
         * sans faire retaper l'adresse.
         */
        if (corps.adresseNonConfirmee) setAConfirmer(String(donnees.get("email") ?? ""));
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
          /* La réinitialisation d'après action rend le champ à sa valeur par défaut :
             c'est donc elle qui doit porter ce qui vient d'être saisi. */
          defaultValue={adresse}
          key={adresse}
        />
      </div>

      <div className={styles.formGroup}>
        <label htmlFor="motDePasse">Mot de passe</label>
        <div className={styles.champOeil}>
          {/* Plus de placeholder : il disait « Votre mot de passe » sous un libellé qui
              disait déjà « Mot de passe ». */}
          <input
            id="motDePasse"
            name="motDePasse"
            type={visible ? "text" : "password"}
            autoComplete="current-password"
            required
          />
          {/*
            Voir ce qu'on tape.
            Un mot de passe long se saisit mal en aveugle, et c'est justement celui
            qu'on veut encourager. L'intitulé dit l'action qu'on déclenche, pas
            l'état du champ.
          */}
          <button
            type="button"
            className={styles.boutonOeil}
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
          >
            {visible ? (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M3 3l18 18" />
                <path d="M10.6 10.6a2 2 0 002.8 2.8" />
                <path d="M9.4 5.2A9.5 9.5 0 0112 5c5 0 9 4.5 9 7 0 1-.7 2.4-1.9 3.7" />
                <path d="M6.2 6.7C4.1 8.2 3 10.2 3 12c0 2.5 4 7 9 7 1.4 0 2.7-.3 3.8-.9" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M3 12c0-2.5 4-7 9-7s9 4.5 9 7-4 7-9 7-9-4.5-9-7z" />
                <circle cx="12" cy="12" r="2.6" />
              </svg>
            )}
          </button>
        </div>
        {/* L'issue se lit dans l'ordre où l'on bute dessus : le champ, puis le recours. */}
        <Link href="/mot-de-passe-oublie" className={styles.lienOubli}>
          Mot de passe oublié ?
        </Link>
      </div>

      {erreur && (
        <p role="alert" aria-live="polite" className={styles.authError}>
          {erreur}
        </p>
      )}

      {/*
        L'issue, à l'endroit exact où l'on bute.
        Elle ne paraît que sur ce refus-là : proposer un lien de confirmation à qui
        s'est trompé de mot de passe ne ferait qu'ajouter au malentendu.
      */}
      {aConfirmer && !renvoi && (
        <button
          type="button"
          className={styles.btnRenvoi}
          onClick={renvoyerLeLien}
          disabled={renvoiEnCours}
        >
          {renvoiEnCours ? "Envoi en cours" : "Renvoyer le lien de confirmation"}
        </button>
      )}

      {renvoi && (
        <p role="status" aria-live="polite" className={styles.authInfo}>
          {renvoi}
        </p>
      )}

      <button className={styles.btnLogin} type="submit" disabled={enCours}>
        {enCours ? "Connexion en cours" : "Se connecter"}
      </button>
    </form>
  );
}
