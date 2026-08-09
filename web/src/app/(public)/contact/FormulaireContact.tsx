"use client";

import { useState, useTransition } from "react";
import { envoyerMessage, type ResultatContact } from "./actions";

const SUJETS = [
  { valeur: "creation", libelle: "Création d'entreprise" },
  { valeur: "contrat", libelle: "Contrats" },
  { valeur: "facturation", libelle: "Facturation" },
  { valeur: "technique", libelle: "Problème technique" },
  { valeur: "partenariat", libelle: "Partenariat" },
  { valeur: "autre", libelle: "Autre" },
];

export function FormulaireContact() {
  const [resultat, setResultat] = useState<ResultatContact | null>(null);
  const [enCours, demarrer] = useTransition();

  function soumettre(donnees: FormData) {
    demarrer(async () => {
      setResultat(await envoyerMessage(Object.fromEntries(donnees)));
    });
  }

  const erreur = (champ: string) => resultat?.details?.[champ]?.[0];

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

      <label htmlFor="sujet">Sujet</label>
      <select id="sujet" name="sujet" defaultValue="" required>
        <option value="" disabled>
          Sélectionnez un sujet
        </option>
        {SUJETS.map((s) => (
          <option key={s.valeur} value={s.valeur}>
            {s.libelle}
          </option>
        ))}
      </select>
      {erreur("sujet") && <p role="alert">{erreur("sujet")}</p>}

      <label htmlFor="message">Votre message</label>
      <textarea id="message" name="message" rows={6} required />
      {erreur("message") && <p role="alert">{erreur("message")}</p>}

      {/* Piège à robots : masqué, hors du parcours au clavier, jamais rempli par
          un humain. Le libellé reste présent pour les lecteurs d'écran, qui
          l'annoncent comme le champ facultatif qu'il est. */}
      <div aria-hidden="true" style={{ position: "absolute", left: "-9999px" }}>
        <label htmlFor="website">Ne pas remplir</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      <button type="submit" disabled={enCours}>
        {enCours ? "Envoi en cours" : "Envoyer le message"}
      </button>

      {resultat?.message && (
        <p role="status" aria-live="polite">
          {resultat.message}
        </p>
      )}
    </form>
  );
}
