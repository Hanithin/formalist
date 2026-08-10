"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface Props {
  dossierId: number;
  avocatActuel: number | null;
  avocats: { id: number; name: string }[];
}

export function Assignation({ dossierId, avocatActuel, avocats }: Props) {
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const router = useRouter();

  function assigner(avocat: number) {
    setErreur(null);
    demarrer(async () => {
      const reponse = await fetch("/api/administration/assignation", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossier: dossierId, avocat }),
      });
      if (!reponse.ok) {
        const corps = await reponse.json().catch(() => ({}));
        setErreur(corps.error ?? "L'assignation n'a pas abouti");
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      <label htmlFor={"avocat-" + dossierId}>Avocat en charge</label>
      <select
        id={"avocat-" + dossierId}
        defaultValue={avocatActuel ?? ""}
        disabled={enCours || avocats.length === 0}
        onChange={(e) => e.target.value && assigner(Number(e.target.value))}
      >
        <option value="">Aucun</option>
        {avocats.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      {erreur && <p role="alert">{erreur}</p>}
    </>
  );
}
