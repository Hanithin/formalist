"use client";

import Link from "next/link";
import styles from "./Etats.module.css";

/**
 * Le dernier filet, quand rien d'autre n'a rattrapé.
 *
 * Sans lui, une panne du serveur rendait la page d'erreur de Next : un fond blanc,
 * « Application error: a server-side exception has occurred », et rien à faire d'autre
 * que revenir en arrière. La personne quitte l'application par une porte qui n'est pas
 * la nôtre, au moment précis où elle a besoin qu'on lui dise quoi faire.
 *
 * `reset` rejoue le rendu sans recharger la page : beaucoup d'incidents sont
 * passagers - une requête perdue, une base qui a hoqueté - et un second essai suffit.
 * Le repère de l'incident se lit en dessous : il ne dit rien à qui le lit, il sert à
 * retrouver la trace côté serveur quand on nous écrit.
 */
export default function PanneDeLApplication({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main>
      <div className={styles.etat}>
        <h1 className={styles.titre}>Quelque chose s&apos;est interrompu</h1>
        <p className={styles.texte}>
          L&apos;écran n&apos;a pas pu s&apos;afficher. Rien de ce que vous aviez
          enregistré n&apos;est perdu.
        </p>
        <p className={styles.precision}>
          Réessayez : la plupart de ces interruptions ne durent pas. Si celle-ci
          revient, écrivez-nous depuis le centre d&apos;aide en nous donnant le repère
          ci-dessous.
        </p>

        <div className={styles.actions}>
          <button type="button" className={styles.principal} onClick={() => reset()}>
            Réessayer
          </button>
          <Link href="/formalites" className={styles.secondaire}>
            Mes formalités
          </Link>
          <Link href="/aide" className={styles.secondaire}>
            Centre d&apos;aide
          </Link>
        </div>

        {error.digest && <p className={styles.repere}>Repère de l&apos;incident : {error.digest}</p>}
      </div>
    </main>
  );
}
