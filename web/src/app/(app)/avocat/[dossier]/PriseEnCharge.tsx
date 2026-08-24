"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../Avocat.module.css";

/**
 * Prendre un dossier depuis sa propre page.
 *
 * Le bouton n'existait que dans la liste : un avocat arrivé ici par un lien direct -
 * une notification, une conversation, une adresse recopiée - lisait le dossier sans
 * pouvoir se l'attribuer, et rien ne lui disait que personne ne s'en occupait. Il
 * fallait retourner à la liste, y retrouver la ligne, et ouvrir son panneau.
 *
 * Le bandeau reste sur la page après la prise : on rafraîchit plutôt que de naviguer,
 * puisqu'on est déjà là où il faut travailler. Ce sont les onglets qui changent - ils
 * n'attendent plus qu'un avocat prenne le dossier.
 */
export function PriseEnCharge({ dossier }: { dossier: number }) {
  const [enCours, setEnCours] = useState(false);
  const [refus, setRefus] = useState<string | null>(null);
  const router = useRouter();

  async function prendre() {
    setEnCours(true);
    setRefus(null);

    const reponse = await fetch("/api/avocat/prise", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dossier }),
    });

    setEnCours(false);

    /*
     * Le dossier est proposé à tous à la fois : le premier qui accepte le prend.
     *
     * Celui qui arrive après reçoit un 409, et le message nomme celui qui a été plus
     * rapide. On rafraîchit alors quand même : la page doit cesser de proposer un
     * dossier qui ne l'est plus.
     */
    if (reponse.status === 409) {
      const donnees = await reponse.json().catch(() => ({}));
      setRefus((donnees.error as string) ?? "Ce dossier a déjà été pris en charge.");
      router.refresh();
      return;
    }
    if (!reponse.ok) {
      setRefus("La prise en charge n'a pas abouti.");
      return;
    }

    router.refresh();
  }

  return (
    <div className={styles.bandeauPrise}>
      <div className={styles.bandeauPriseTexte}>
        <p className={styles.bandeauPriseTitre}>Ce dossier attend un avocat</p>
        <p className={styles.bandeauPriseDetail}>
          {refus ??
            "Personne ne s'en occupe pour l'instant. En le prenant, vous en devenez l'avocat : vous pourrez le réviser, produire les actes et le déposer."}
        </p>
      </div>

      <button
        type="button"
        className={styles.bandeauPriseBouton}
        onClick={prendre}
        disabled={enCours}
      >
        {enCours ? "…" : "Prendre en charge et réviser"}
      </button>
    </div>
  );
}
