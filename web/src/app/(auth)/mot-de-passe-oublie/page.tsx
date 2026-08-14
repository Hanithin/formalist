import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { FormulaireDemande } from "./FormulaireDemande";
import { PanneauDroit } from "../PanneauDroit";
import styles from "../Authentification.module.css";

export const metadata: Metadata = {
  title: "Mot de passe oublié - Formalist",
  robots: { index: false, follow: false },
};

export default function MotDePasseOublie() {
  return (
    <div className={styles.authSplit}>
      <div className={styles.authLeft}>
        <div className={styles.authTopbar}>
          <Link href="/" className={styles.logo}>
            <Image
              src="/images/logo.png"
              alt="Formalist"
              width={140}
              height={30}
              style={{ height: 30, width: "auto" }}
              priority
            />
          </Link>
          <Link href="/connexion" className={styles.backLink}>
            Retour
          </Link>
        </div>

        <div className={styles.authFormWrap}>
          <div className={styles.loginCard}>
            <h1>Mot de passe oublié</h1>
            <p className={styles.subtitle}>
              Indiquez l&apos;adresse de votre compte : nous vous envoyons un lien pour en choisir
              un nouveau. Il est valable une heure.
            </p>

            <FormulaireDemande />

            <div className={styles.authOr}>Vous vous en souvenez ?</div>
            <Link href="/connexion" className={styles.btnSecondary}>
              Retour à la connexion
            </Link>
          </div>
        </div>

        <div className={styles.authFooter}>
          Une question sur votre dossier ?{" "}
          <a href="mailto:contact@formalist.fr">contact@formalist.fr</a>
        </div>
      </div>

      <PanneauDroit />
    </div>
  );
}
