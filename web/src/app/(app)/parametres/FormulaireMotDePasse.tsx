"use client";

import { useRef, useState, useTransition } from "react";

export function FormulaireMotDePasse() {
  const [retour, setRetour] = useState<{ ok: boolean; texte: string } | null>(null);
  const [enCours, demarrer] = useTransition();
  const formulaire = useRef<HTMLFormElement>(null);

  function soumettre(donnees: FormData) {
    setRetour(null);
    demarrer(async () => {
      const reponse = await fetch("/api/auth/mot-de-passe", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(donnees)),
      });
      const corps = await reponse.json().catch(() => ({}));

      if (!reponse.ok) {
        const premier = corps.details ? Object.values(corps.details)[0] : null;
        setRetour({
          ok: false,
          texte: (Array.isArray(premier) ? premier[0] : corps.error) ?? "Modification interrompue",
        });
        return;
      }

      setRetour({ ok: true, texte: corps.message ?? "Mot de passe modifié" });
      formulaire.current?.reset(); // ne pas laisser les mots de passe dans les champs
    });
  }

  return (
    <form ref={formulaire} action={soumettre} noValidate>
      <label htmlFor="actuel">Mot de passe actuel</label>
      <input id="actuel" name="actuel" type="password" autoComplete="current-password" required />

      <label htmlFor="nouveau">Nouveau mot de passe</label>
      <input id="nouveau" name="nouveau" type="password" autoComplete="new-password" required minLength={8} />

      <button type="submit" disabled={enCours}>
        {enCours ? "Modification" : "Modifier le mot de passe"}
      </button>

      {retour && (
        <p role={retour.ok ? "status" : "alert"} aria-live="polite">
          {retour.texte}
        </p>
      )}
    </form>
  );
}
