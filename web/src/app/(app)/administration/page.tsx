import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { tableauAdministration } from "@/infrastructure/db/depots/administration";
import { Comptes } from "./Comptes";
import { PiecesDuCabinet } from "./PiecesDuCabinet";
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
      <div className={styles.tete}>
        <p className={styles.eyebrow}>Administration</p>
        <h1>Plateforme</h1>
        <Link className={styles.lienSuivi} href="/administration/dossiers">
          Suivi des dossiers, paiements et activité
        </Link>
      </div>

      {/*
        Deux colonnes, parce que la page en avait une pour rien.

        Les comptes, les chiffres et les pièces du cabinet s'empilaient sur neuf cent
        quatre-vingts pixels au milieu d'un écran qui en offre douze cents : il fallait
        traverser quinze comptes pour atteindre les pièces. La liste, qui est longue,
        tient à gauche ; ce qui se consulte d'un coup d'œil tient à droite.
      */}
      <div className={styles.colonnes}>
        <div className={styles.colonne}>
          <section className={styles.bloc}>
            <h2>Comptes</h2>
            <p className={styles.precision}>
              Accorder le rôle avocat ouvre l&apos;accès aux dossiers d&apos;un cabinet.
              C&apos;est le seul endroit où on peut le faire.
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
        </div>

        <div className={styles.colonne}>
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

          {/*
            Les pièces du cabinet, déposées une fois pour tous les dossiers.

            Elles servent quand le cabinet domicilie une société : le greffe veut son
            extrait Kbis, l'identité de celui qui signe l'attestation, et son justificatif
            de domicile. Les redemander dossier par dossier les ferait vieillir en silence.
          */}
          <section className={styles.bloc}>
            <h2>Pièces du cabinet</h2>
            <p className={styles.precision}>
              Jointes aux dossiers domiciliés au cabinet. L&apos;extrait Kbis et le
              justificatif de domicile doivent avoir moins de trois mois le jour du dépôt.
            </p>

            <PiecesDuCabinet />
          </section>
        </div>
      </div>
    </main>
  );
}
