"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import styles from "./ApresLApport.module.css";

/**
 * Ouvrir le dossier de la société dont les titres sont apportés.
 *
 * Le second dossier ne s'ouvre pas d'office. Le client vient acheter un apport, pas deux
 * formalités : un montant qu'il n'a pas demandé, découvert à l'écran de paiement, se lit
 * comme un piège. C'est donc un geste, et il est annoncé pour ce qu'il est.
 *
 * Le dossier arrive rempli de ce que l'apport sait déjà - la société, l'apporteur en
 * associé cédant, la holding en cessionnaire, les titres et leur valeur. Ce qui reste à
 * saisir, personne ne pouvait le deviner depuis le premier dossier.
 */
export function OuvrirLeDossierApportee({
  dossier,
  nomApportee,
  /** Le dossier déjà ouvert, s'il l'a été : on y renvoie plutôt que d'en ouvrir un autre. */
  dejaOuvert,
}: {
  dossier: number;
  nomApportee: string;
  dejaOuvert?: number | null;
}) {
  const [refus, setRefus] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const router = useRouter();

  function ouvrir() {
    setRefus(null);

    demarrer(async () => {
      if (dejaOuvert) {
        router.push("/modification?dossier=" + dejaOuvert);
        return;
      }

      const reponse = await fetch("/api/formalites/modification/societe-apportee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossier }),
      });

      const retour = await reponse.json().catch(() => ({}));
      if (!reponse.ok) {
        setRefus(retour.error ?? "Le dossier n'a pas pu être ouvert");
        return;
      }

      router.push("/modification?dossier=" + retour.dossier);
    });
  }

  return (
    <div className={styles.geste}>
      <div>
        <p className={styles.gesteQuoi}>
          {dejaOuvert
            ? "Le dossier de " + nomApportee + " est ouvert"
            : "Préparer la mise à jour de " + nomApportee}
        </p>
        <p className={styles.gestePourquoi}>
          {dejaOuvert
            ? "Il porte l'agrément, les statuts et le dépôt qui reviennent à cette société."
            : "Un dossier séparé, pour l'autre société : deux greffes, deux jeux d'actes. Il s'ouvre rempli de ce que cet apport sait déjà, et rien n'est facturé avant que vous ne le régliez."}
        </p>
      </div>

      <button type="button" className={styles.gesteBouton} onClick={ouvrir} disabled={enCours}>
        {enCours ? "Ouverture…" : dejaOuvert ? "Reprendre le dossier" : "Ouvrir le dossier"}
      </button>

      {refus && (
        <p className={styles.gesteRefus} role="alert">
          {refus}
        </p>
      )}
    </div>
  );
}
