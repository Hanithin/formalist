"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import styles from "../Avocat.module.css";

interface Note {
  id: number;
  contenu: string;
  auteur: string;
  date: string | null;
}

export function Notes({ dossierId, notes }: { dossierId: number; notes: Note[] }) {
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const router = useRouter();

  function ajouter(donnees: FormData) {
    const contenu = String(donnees.get("contenu") ?? "").trim();
    if (!contenu) return;
    setErreur(null);

    demarrer(async () => {
      const reponse = await fetch("/api/avocat/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossier: dossierId, contenu }),
      });
      if (!reponse.ok) {
        const corps = await reponse.json().catch(() => ({}));
        setErreur(corps.error ?? "La note n'a pas été enregistrée");
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      <form action={ajouter} className={styles.formNote}>
        <label htmlFor="note">Ajouter une note</label>
        <textarea id="note" name="contenu" rows={3} placeholder="Point de vigilance, relance…" />
        <button type="submit" disabled={enCours}>
          {enCours ? "Enregistrement" : "Ajouter la note"}
        </button>
        {erreur && <p role="alert">{erreur}</p>}
      </form>

      {notes.length > 0 && (
        <ul className={styles.notes}>
          {notes.map((n) => (
            <li key={n.id}>
              <p>{n.contenu}</p>
              <span className={styles.quand}>
                {n.auteur}
                {n.date
                  ? " · " +
                    new Intl.DateTimeFormat("fr-FR", {
                      dateStyle: "short",
                      timeStyle: "short",
                    }).format(new Date(n.date))
                  : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
