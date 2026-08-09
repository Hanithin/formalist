"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface Props {
  roles: { valeur: string; libelle: string }[];
}

export function Inviter({ roles }: Props) {
  const [retour, setRetour] = useState<{ ok: boolean; texte: string } | null>(null);
  const [enCours, demarrer] = useTransition();
  const router = useRouter();

  function soumettre(donnees: FormData) {
    setRetour(null);
    demarrer(async () => {
      const reponse = await fetch("/api/equipe/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: donnees.get("email"),
          role: donnees.get("role"),
          voitTousLesDossiers: donnees.get("voitTousLesDossiers") === "on",
          peutModifier: donnees.get("peutModifier") === "on",
          peutCreer: donnees.get("peutCreer") === "on",
        }),
      });
      const corps = await reponse.json().catch(() => ({}));

      if (!reponse.ok) {
        const premier = corps.details ? Object.values(corps.details)[0] : null;
        setRetour({
          ok: false,
          texte: (Array.isArray(premier) ? premier[0] : corps.error) ?? "Invitation non envoyée",
        });
        return;
      }

      setRetour({ ok: true, texte: "Invitation envoyée à " + corps.email });
      router.refresh();
    });
  }

  return (
    <form action={soumettre} noValidate>
      <label htmlFor="email">Adresse email</label>
      <input id="email" name="email" type="email" required />

      <label htmlFor="role">Rôle</label>
      <select id="role" name="role" defaultValue="collaborateur">
        {roles.map((r) => (
          <option key={r.valeur} value={r.valeur}>
            {r.libelle}
          </option>
        ))}
      </select>

      <fieldset>
        <legend>Ce que cette personne pourra faire</legend>
        <label>
          <input type="checkbox" name="voitTousLesDossiers" /> Voir tous les dossiers de l&apos;équipe
        </label>
        <label>
          <input type="checkbox" name="peutModifier" /> Modifier les dossiers qu&apos;elle voit
        </label>
        <label>
          <input type="checkbox" name="peutCreer" defaultChecked /> Créer des formalités
        </label>
      </fieldset>

      <button type="submit" disabled={enCours}>
        {enCours ? "Envoi" : "Envoyer l'invitation"}
      </button>

      {retour && (
        <p role={retour.ok ? "status" : "alert"} aria-live="polite">
          {retour.texte}
        </p>
      )}
    </form>
  );
}
