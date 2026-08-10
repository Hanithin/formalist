import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Suspense } from "react";
import { FormulaireConnexion } from "./FormulaireConnexion";
import { PanneauDroit } from "../PanneauDroit";
import { messageJeton, type EtatJeton } from "@/domain/acces/inscription";
import styles from "../Authentification.module.css";

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
            <h1>Bienvenue sur Formalist</h1>
            <p className={styles.subtitle}>
              Créez et modifiez votre société avec un avocat, des statuts jusqu&apos;au Kbis.
            </p>

            {etat && (
              <p role="status" className={styles.authNotice}>
                {messageJeton(etat)}
              </p>
            )}

            <Suspense>
              <FormulaireConnexion />
            </Suspense>

            <div className={styles.authOr}>Pas encore de compte ?</div>
            <Link href="/inscription" className={styles.btnSecondary}>
              Créer un compte
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
