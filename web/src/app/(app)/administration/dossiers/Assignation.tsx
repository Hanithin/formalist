"use client";

import { ChampChoix } from "@/components/formulaire/ChampChoix";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface Props {
  dossierId: number;
  avocatActuel: number | null;
  avocats: { id: number; name: string }[];
}

export function Assignation({ dossierId, avocatActuel, avocats }: Props) {
  const [erreur, setErreur] = useState<string | null>(null);
  /*
   * La liste était non contrôlée (`defaultValue`) : la valeur affichée venait du
   * navigateur, non de l'état. Un composant écrit ne peut pas en faire autant - il ne
   * lit pas le DOM - et l'on veut de toute façon que l'écran montre ce qui vient d'être
   * assigné, sans attendre le rafraîchissement du serveur.
   */
  const [choisi, setChoisi] = useState(avocatActuel === null ? "" : String(avocatActuel));
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
      <ChampChoix
        id={"avocat-" + dossierId}
        valeur={choisi}
        options={[
          { valeur: "", libelle: "Aucun" },
          ...avocats.map((a) => ({ valeur: String(a.id), libelle: a.name })),
        ]}
        disabled={enCours || avocats.length === 0}
        surChangement={(id) => {
          setChoisi(id);
          if (id) assigner(Number(id));
        }}
      />
      {erreur && <p role="alert">{erreur}</p>}
    </>
  );
}
