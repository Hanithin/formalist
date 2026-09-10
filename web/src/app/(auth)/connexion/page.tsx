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
          {/* Le logo ne mène nulle part : cette page est la racine du site. */}
          <span className={styles.logo}>
            <Image
              src="/images/logo.png"
              alt="Formalist"
              /* Dimensions réelles du PNG (4725 × 861) : le CSS le ramène à 30 px de haut. */
              width={225}
              height={41}
              style={{ height: 30, width: "auto" }}
              priority
            />
          </span>
        </div>

        <div className={styles.authFormWrap}>
          <div className={styles.loginCard}>
            {/* Le titre dit bonjour, rien de plus : la marque est portée par le logo du
                bandeau et le panneau de droite explique déjà ce qu'on vient faire. */}
            <h1 className={styles.titreSeul}>Bienvenue</h1>

            {etat && (
              <p role="status" className={styles.authNotice}>
                {messageJeton(etat)}
              </p>
            )}

            <Suspense>
              <FormulaireConnexion />
            </Suspense>

            <p className={styles.authAlt}>
              Pas encore de compte ? <Link href="/inscription">Créer un compte</Link>
            </p>
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
