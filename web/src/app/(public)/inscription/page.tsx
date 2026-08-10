import type { Metadata } from "next";
import Link from "next/link";
import { FormulaireInscription } from "./FormulaireInscription";

export const metadata: Metadata = {
  title: "Créer un compte - Formalist",
  description:
    "Créez votre compte Formalist et lancez la création de votre société, accompagné par des avocats.",
};

export default function Inscription() {
  return (
    <main>
      <h1>Créer un compte</h1>
      <p>Quelques minutes suffisent pour lancer la création de votre société.</p>

      <FormulaireInscription />

      <p>
        Vous avez déjà un compte ? <Link href="/connexion">Se connecter</Link>
      </p>
    </main>
  );
}
