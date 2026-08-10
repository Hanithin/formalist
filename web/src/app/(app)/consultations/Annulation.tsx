"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function Annulation({ consultationId }: { consultationId: number }) {
  const [confirme, setConfirme] = useState(false);
  const [enCours, demarrer] = useTransition();
  const router = useRouter();

  if (!confirme) {
    return (
      <button type="button" onClick={() => setConfirme(true)}>
        Annuler
      </button>
    );
  }

  // Annuler libère le créneau pour quelqu'un d'autre : on demande confirmation
  // sur place, sans boîte de dialogue qui interrompt.
  return (
    <>
      <span>Annuler ce rendez-vous ?</span>
      <button
        type="button"
        disabled={enCours}
        onClick={() =>
          demarrer(async () => {
            await fetch("/api/consultations", {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ consultation: consultationId }),
            });
            router.refresh();
          })
        }
      >
        Oui, annuler
      </button>
      <button type="button" onClick={() => setConfirme(false)}>
        Garder
      </button>
    </>
  );
}
