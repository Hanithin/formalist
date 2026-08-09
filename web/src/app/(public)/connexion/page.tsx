import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FormulaireConnexion } from "./FormulaireConnexion";

export const metadata: Metadata = {
  title: "Connexion - Formalist",
  // Une page de connexion n'a rien à faire dans un index de moteur.
  robots: { index: false, follow: false },
};

export default function Connexion() {
  return (
    <main>
      <h1>Bienvenue sur Formalist</h1>
      <p>Créez et modifiez votre société, accompagné par des avocats.</p>

      <Suspense>
        <FormulaireConnexion />
      </Suspense>

      <p>
        Pas encore de compte ? <Link href="/inscription">Créer un compte</Link>
      </p>
    </main>
  );
}
