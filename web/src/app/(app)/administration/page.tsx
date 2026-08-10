import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { tableauAdministration } from "@/infrastructure/db/depots/administration";
import { Comptes } from "./Comptes";
import styles from "./Administration.module.css";

export const metadata: Metadata = {
  title: "Administration - Formalist",
  robots: { index: false, follow: false },
};

export default async function Administration() {
  const utilisateur = await exigerUtilisateur();

  // Comme l'espace avocat : 404 plutôt qu'un refus explicite.
  if (!utilisateur.roles.includes("admin")) notFound();

  const { comptes, chiffres } = await tableauAdministration(utilisateur);

  return (
    <main className={styles.page}>
      <p className={styles.eyebrow}>Administration</p>
      <h1>Plateforme</h1>
      <p className={styles.precision}>
        <Link href="/administration/dossiers">Suivi des dossiers, paiements et activité</Link>
      </p>

      <dl className={styles.chiffres}>
        <div>
          <dt>Comptes</dt>
          <dd>{chiffres.comptes}</dd>
        </div>
        <div>
          <dt>Dossiers</dt>
          <dd>{chiffres.dossiers}</dd>
        </div>
        <div>
          <dt>En cours</dt>
          <dd>{chiffres.enCours}</dd>
        </div>
        <div>
          <dt>Terminés</dt>
          <dd>{chiffres.termines}</dd>
        </div>
      </dl>

      <section className={styles.bloc}>
        <h2>Comptes</h2>
        <p className={styles.precision}>
          Accorder le rôle avocat ouvre l&apos;accès aux dossiers d&apos;un cabinet. C&apos;est le
          seul endroit où on peut le faire.
        </p>

        <Comptes
          comptes={comptes.map((c) => ({
            ...c,
            creeLe: c.creeLe?.toISOString() ?? null,
            derniereConnexion: c.derniereConnexion?.toISOString() ?? null,
          }))}
          moi={utilisateur.id}
        />
      </section>
    </main>
  );
}
