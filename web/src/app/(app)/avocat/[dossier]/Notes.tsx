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
      {/*
        Les notes d'abord, la saisie ensuite.
        
        Le formulaire ouvrait la carte et la note qu'on venait d'écrire tombait sous le
        bouton, sans cadre : elle ressemblait à un débordement plutôt qu'à une note.
      */}
      {notes.length > 0 && (
        <ul className={styles.notes}>
          {notes.map((n) => (
            <li key={n.id} className={styles.noteItem}>
              <p className={styles.noteTexte}>{n.contenu}</p>
              <span className={styles.noteSignature}>
                {n.auteur}
                {n.date
                  ? " · " +
                    new Intl.DateTimeFormat("fr-FR", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    }).format(new Date(n.date))
                  : ""}
              </span>
            </li>
          ))}
        </ul>
      )}

      <form action={ajouter} className={styles.formNote}>
        <textarea
          id="note"
          name="contenu"
          rows={2}
          placeholder="Point de vigilance, relance…"
          aria-label="Ajouter une note interne"
        />
        <button type="submit" disabled={enCours}>
          {enCours ? "Enregistrement…" : "Ajouter"}
        </button>
        {erreur && (
          <p role="alert" className={styles.noteRefus}>
            {erreur}
          </p>
        )}
      </form>
    </>
  );
}
