import type { Metadata } from "next";
import Link from "next/link";
import { FormulaireInscription } from "./FormulaireInscription";
import { Propos } from "../Propos";
import styles from "../Authentification.module.css";

export const metadata: Metadata = {
  title: "Créer un compte - Formalist",
  description:
    "Créez votre compte Formalist et lancez la création de votre société, accompagné par des avocats.",
};

export default function Inscription() {
  return (
    <main className={styles.disposition}>
      <div className={styles.formulaire}>
        <h1>Créer un compte</h1>
        <p>Quelques minutes suffisent pour lancer la création de votre société.</p>

        <FormulaireInscription />

        <p className={styles.pied}>
          Vous avez déjà un compte ? <Link href="/connexion">Se connecter</Link>
        </p>
      </div>

      <Propos />
    </main>
  );
}
