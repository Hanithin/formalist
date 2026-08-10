import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { FormulaireInscription } from "./FormulaireInscription";
import { PanneauDroit } from "../PanneauDroit";
import styles from "../Authentification.module.css";

export const metadata: Metadata = {
  title: "Créer un compte - Formalist",
  description:
    "Créez votre compte Formalist et lancez la création de votre société, accompagné par des avocats.",
};

export default function Inscription() {
  return (
    <div className={styles.authSplit}>
      <div className={styles.authLeft}>
        <div className={styles.authTopbar}>
          <Link href="/" className={styles.logo}>
            <Image src="/images/logo.png"
              alt="Formalist"
              width={140}
              height={30}
              style={{ height: 30, width: "auto" }}
              priority />
          </Link>
          <Link href="/" className={styles.backLink}>
            Retour
          </Link>
        </div>

        <div className={styles.authFormWrap}>
          <div className={styles.loginCard}>
            <h1>Créer un compte</h1>
            <p className={styles.subtitle}>
              Quelques minutes suffisent pour lancer la création de votre société.
            </p>

            <FormulaireInscription />

            <div className={styles.authOr}>Vous avez déjà un compte ?</div>
            <Link href="/connexion" className={styles.btnSecondary}>
              Se connecter
            </Link>
          </div>
        </div>

        <div className={styles.authFooter}>
          Une question ? <a href="mailto:contact@formalist.fr">contact@formalist.fr</a>
        </div>
      </div>

      <PanneauDroit />
    </div>
  );
}
