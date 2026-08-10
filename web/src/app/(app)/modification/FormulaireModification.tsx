"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ChampModification } from "@/domain/formalite/modifications";
import styles from "./Modification.module.css";

interface Props {
  dossierId: number;
  champs: ChampModification[];
  valeurs: Record<string, string | number>;
}

export function FormulaireModification({ dossierId, champs, valeurs }: Props) {
  const [saisie, setSaisie] = useState<Record<string, string | number>>(valeurs);
  const [retour, setRetour] = useState<{ ok: boolean; texte: string } | null>(null);
  const [documents, setDocuments] = useState<{ titre: string }[]>([]);
  const [enCours, demarrer] = useTransition();
  const router = useRouter();

  function produire() {
    setRetour(null);
    demarrer(async () => {
      await fetch("/api/formalites/modification", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossier: dossierId, valeurs: saisie }),
      });

      const reponse = await fetch("/api/formalites/modification/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossier: dossierId }),
      });
      const corps = await reponse.json().catch(() => ({}));

      if (!reponse.ok) {
        const manques: { message: string }[] = corps.manques ?? [];
        setRetour({
          ok: false,
          texte: manques.length ? manques.map((m) => m.message).join(". ") : corps.error,
        });
        return;
      }

      setDocuments(corps.documents);
      setRetour({ ok: true, texte: "Documents produits" });
      router.refresh();
    });
  }

  return (
    <form
      className={styles.formulaire}
      onSubmit={(e) => {
        e.preventDefault();
        produire();
      }}
    >
      {champs.map((champ) => (
        <div key={champ.identifiant} className={styles.champ}>
          <label htmlFor={champ.identifiant}>{champ.libelle}</label>
          {champ.type === "long" ? (
            <textarea
              id={champ.identifiant}
              rows={4}
              value={String(saisie[champ.identifiant] ?? "")}
              onChange={(e) => setSaisie({ ...saisie, [champ.identifiant]: e.target.value })}
            />
          ) : (
            <input
              id={champ.identifiant}
              inputMode={champ.type === "nombre" ? "decimal" : undefined}
              value={String(saisie[champ.identifiant] ?? "")}
              onChange={(e) =>
                setSaisie({
                  ...saisie,
                  [champ.identifiant]:
                    champ.type === "nombre" ? Number(e.target.value) || 0 : e.target.value,
                })
              }
            />
          )}
        </div>
      ))}

      <button type="submit" disabled={enCours}>
        {enCours ? "Génération en cours" : "Générer les documents"}
      </button>

      {retour && (
        <p role={retour.ok ? "status" : "alert"} aria-live="polite">
          {retour.texte}
        </p>
      )}

      {documents.length > 0 && (
        <ul>
          {documents.map((d) => (
            <li key={d.titre}>{d.titre}</li>
          ))}
        </ul>
      )}
    </form>
  );
}
