import type { Metadata } from "next";
import Link from "next/link";
import styles from "./Etats.module.css";

export const metadata: Metadata = {
  title: "Dossier introuvable - Formalist",
  robots: { index: false, follow: false },
};

/**
 * Ce qu'on voit au bout d'un lien qui ne mène plus à rien.
 *
 * Les parcours ouvraient leur dossier sans filet : un favori vers un dossier supprimé,
 * un lien reçu qui pointe celui de quelqu'un d'autre, et la page levait une erreur que
 * personne n'attrapait - « Application error: a server-side exception has occurred »,
 * hors de l'application, sans un mot sur ce qu'il fallait faire.
 *
 * Les deux cas se disent d'une seule phrase, et c'est délibéré. Distinguer « il
 * n'existe pas » de « il ne vous est pas accessible » renseignerait sur l'existence du
 * dossier d'autrui : à qui essaie des numéros, la réponse doit être la même.
 */
export default function DossierIntrouvable() {
  return (
    <main>
      <div className={styles.etat}>
        <h1 className={styles.titre}>Ce dossier est introuvable</h1>
        <p className={styles.texte}>
          Il n&apos;existe pas, ou il ne vous est pas accessible.
        </p>
        <p className={styles.precision}>
          Un dossier peut avoir été supprimé, ou appartenir à un autre compte. Si vous
          pensez qu&apos;il devrait s&apos;ouvrir, écrivez-nous depuis le centre
          d&apos;aide : nous le retrouverons.
        </p>

        <div className={styles.actions}>
          <Link href="/formalites" className={styles.principal}>
            Mes formalités
          </Link>
          <Link href="/aide" className={styles.secondaire}>
            Centre d&apos;aide
          </Link>
        </div>
      </div>
    </main>
  );
}
