"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { DefinitionModification } from "@/domain/formalite/modifications";
import styles from "./Modification.module.css";

interface Societe {
  id: number;
  societe: string | null;
  forme: string | null;
}

export function ChoixModification({
  societes,
  modifications,
}: {
  societes: Societe[];
  modifications: DefinitionModification[];
}) {
  const [societe, setSociete] = useState(societes[0]?.id ?? 0);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const router = useRouter();

  function commencer(typeModification: string) {
    setErreur(null);
    demarrer(async () => {
      const reponse = await fetch("/api/formalites/modification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ societe, typeModification }),
      });
      const corps = await reponse.json().catch(() => ({}));

      if (!reponse.ok) {
        setErreur(corps.error ?? "La modification n'a pas pu être ouverte");
        return;
      }
      router.push("/modification?dossier=" + corps.dossier);
    });
  }

  return (
    <>
      <label htmlFor="societe">Société à modifier</label>
      <select id="societe" value={societe} onChange={(e) => setSociete(Number(e.target.value))}>
        {societes.map((s) => (
          <option key={s.id} value={s.id}>
            {s.societe} {s.forme ? "(" + s.forme + ")" : ""}
          </option>
        ))}
      </select>

      <h2>Que voulez-vous changer ?</h2>
      <ul className={styles.choix}>
        {modifications.map((m) => (
          <li key={m.code}>
            <button type="button" onClick={() => commencer(m.code)} disabled={enCours}>
              <span className={styles.titre}>{m.libelle}</span>
              <span className={styles.description}>{m.description}</span>
            </button>
          </li>
        ))}
      </ul>

      {erreur && <p role="alert">{erreur}</p>}
    </>
  );
}
