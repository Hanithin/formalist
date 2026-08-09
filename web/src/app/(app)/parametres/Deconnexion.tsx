"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

export function Deconnexion() {
  const [enCours, demarrer] = useTransition();
  const router = useRouter();

  return (
    <button
      type="button"
      disabled={enCours}
      onClick={() =>
        demarrer(async () => {
          await fetch("/api/auth/deconnexion", { method: "POST" });
          router.push("/connexion");
          router.refresh();
        })
      }
    >
      {enCours ? "Déconnexion" : "Se déconnecter"}
    </button>
  );
}
