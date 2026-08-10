import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FormulaireConnexion } from "./FormulaireConnexion";
import { messageJeton, type EtatJeton } from "@/domain/acces/inscription";

export const metadata: Metadata = {
  title: "Connexion - Formalist",
  // Une page de connexion n'a rien à faire dans un index de moteur.
  robots: { index: false, follow: false },
};

export default async function Connexion({
  searchParams,
}: {
  searchParams: Promise<{ confirmation?: string }>;
}) {
  const { confirmation } = await searchParams;
  const etats: EtatJeton[] = ["valide", "utilise", "expire", "inconnu"];
  const etat = etats.includes(confirmation as EtatJeton) ? (confirmation as EtatJeton) : null;

  return (
    <main>
      <h1>Bienvenue sur Formalist</h1>
      <p>Créez et modifiez votre société, accompagné par des avocats.</p>

      {etat && (
        <p role="status" aria-live="polite">
          {messageJeton(etat)}
        </p>
      )}

      <Suspense>
        <FormulaireConnexion />
      </Suspense>

      <p>
        Pas encore de compte ? <Link href="/inscription">Créer un compte</Link>
      </p>
    </main>
  );
}
