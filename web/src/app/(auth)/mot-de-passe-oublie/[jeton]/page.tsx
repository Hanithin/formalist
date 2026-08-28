import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { etatDuLien } from "@/infrastructure/db/depots/reinitialisation";
import { messageReinitialisation } from "@/domain/acces/reinitialisation";
import { FormulaireNouveau } from "./FormulaireNouveau";
import { PanneauDroit } from "../../PanneauDroit";
import styles from "../../Authentification.module.css";

export const metadata: Metadata = {
  title: "Nouveau mot de passe - Formalist",
  robots: { index: false, follow: false },
};

/**
 * Le lien reçu par email mène ici.
 *
 * L'état du jeton est vérifié avant d'afficher quoi que ce soit : présenter deux
 * champs pour dire ensuite que le lien a expiré ferait saisir un mot de passe pour
 * rien. Ouvrir la page ne consomme pas le jeton - les antivirus et les aperçus de
 * messagerie visitent les liens reçus, et un lien consommé à l'ouverture n'arriverait
 * jamais intact à son destinataire.
 */
export default async function NouveauMotDePasse({
  params,
}: {
  params: Promise<{ jeton: string }>;
}) {
  const { jeton } = await params;
  const etat = await etatDuLien(decodeURIComponent(jeton));

  return (
    <div className={styles.authSplit}>
      <div className={styles.authLeft}>
        <div className={styles.authTopbar}>
          <Link href="/connexion" className={styles.logo}>
            <Image
              src="/images/logo.png"
              alt="Formalist"
              /* Dimensions réelles du PNG (4725 × 861) : le CSS le ramène à 30 px de haut. */
              width={225}
              height={41}
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
            <h1>Nouveau mot de passe</h1>

            {etat === "valide" ? (
              <>
                <p className={styles.subtitle}>{messageReinitialisation(etat)}</p>
                <FormulaireNouveau jeton={decodeURIComponent(jeton)} />
              </>
            ) : (
              <>
                <p role="status" className={styles.authNotice}>
                  {messageReinitialisation(etat)}
                </p>
                <Link href="/mot-de-passe-oublie" className={styles.btnSecondary}>
                  Demander un nouveau lien
                </Link>
              </>
            )}

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
