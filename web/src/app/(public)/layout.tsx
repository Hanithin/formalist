import type { ReactNode } from "react";
import Link from "next/link";
import styles from "./Vitrine.module.css";

/**
 * La vitrine est rendue à chaque requête, non pré-générée.
 *
 * Une page produite à la compilation ne peut pas porter le jeton de la requête,
 * et ses scripts seraient donc bloqués par la politique de sécurité. Maintenir la
 * liste des pages pré-générées à la main a échoué deux fois - /aide puis
 * /inscription - avec à chaque fois une page cassée ou une politique relâchée
 * sans qu'on le voie.
 */
export const dynamic = "force-dynamic";

export default function DispositionPublique({ children }: { children: ReactNode }) {
  return (
    <div className={styles.page}>
      <header className={styles.entete}>
        <Link href="/" className={styles.logo}>
          formalist
        </Link>

        <nav className={styles.liens} aria-label="Navigation du site">
          <Link href="/blog">Le blog</Link>
          <Link href="/contact">Nous contacter</Link>
          <Link href="/connexion" className={styles.connexion}>
            Se connecter
          </Link>
        </nav>
      </header>

      {children}

      <footer className={styles.pied}>
        <p>Formalist · Création et modification de sociétés</p>
        <nav aria-label="Liens de pied de page">
          <Link href="/blog">Blog</Link>
          <Link href="/contact">Contact</Link>
          <Link href="/inscription">Créer un compte</Link>
        </nav>
      </footer>
    </div>
  );
}
