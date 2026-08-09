"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface Props {
  prenom: string;
  nom: string;
  email: string;
}

export function FormulaireProfil({ prenom, nom, email }: Props) {
  const [retour, setRetour] = useState<{ ok: boolean; texte: string } | null>(null);
  const [enCours, demarrer] = useTransition();
  const router = useRouter();

  function soumettre(donnees: FormData) {
    setRetour(null);
    demarrer(async () => {
      const reponse = await fetch("/api/auth/profil", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(donnees)),
      });
      const corps = await reponse.json().catch(() => ({}));

      if (!reponse.ok) {
        const premier = corps.details ? Object.values(corps.details)[0] : null;
        setRetour({
          ok: false,
          texte: (Array.isArray(premier) ? premier[0] : corps.error) ?? "Enregistrement interrompu",
        });
        return;
      }

      setRetour({ ok: true, texte: "Informations enregistrées" });
      router.refresh(); // le nom affiché dans la colonne doit suivre
    });
  }

  return (
    <form action={soumettre} noValidate>
      <label htmlFor="prenom">Prénom</label>
      <input id="prenom" name="prenom" defaultValue={prenom} autoComplete="given-name" required />

      <label htmlFor="nom">Nom</label>
      <input id="nom" name="nom" defaultValue={nom} autoComplete="family-name" required />

      <label htmlFor="email">Adresse email</label>
      <input id="email" name="email" type="email" defaultValue={email} autoComplete="email" required />

      <button type="submit" disabled={enCours}>
        {enCours ? "Enregistrement" : "Enregistrer"}
      </button>

      {retour && (
        <p role={retour.ok ? "status" : "alert"} aria-live="polite">
          {retour.texte}
        </p>
      )}
    </form>
  );
}
