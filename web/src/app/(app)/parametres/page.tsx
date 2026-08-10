import type { Metadata } from "next";
import { prisma } from "@/infrastructure/db/client";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { FormulaireProfil } from "./FormulaireProfil";
import { FormulaireMotDePasse } from "./FormulaireMotDePasse";
import { Deconnexion } from "./Deconnexion";
import styles from "./Parametres.module.css";

export const metadata: Metadata = {
  title: "Paramètres - Formalist",
  robots: { index: false, follow: false },
};

export default async function Parametres() {
  const utilisateur = await exigerUtilisateur();
  const compte = await prisma.users.findUniqueOrThrow({
    where: { id: utilisateur.id },
    select: { first_name: true, last_name: true, name: true, email: true },
  });

  // Les comptes anciens n'ont que le nom complet : on le découpe pour l'affichage.
  const morceaux = (compte.name ?? "").split(/\s+/);
  const prenom = compte.first_name ?? morceaux[0] ?? "";
  const nom = compte.last_name ?? morceaux.slice(1).join(" ");

  return (
    <main>
      <h1>Paramètres</h1>
      <p>Votre compte et son accès.</p>

      <section className={styles.bloc}>
        <h2>Vos informations</h2>
        <p className={styles.explication}>
          Le nom figure sur vos documents, l&apos;adresse sert à vous connecter.
        </p>
        <FormulaireProfil prenom={prenom} nom={nom} email={compte.email} />
      </section>

      <section className={styles.bloc}>
        <h2>Mot de passe</h2>
        <p className={styles.explication}>
          Le changer ferme vos autres sessions, sur les appareils où vous êtes resté connecté.
        </p>
        <FormulaireMotDePasse />
      </section>

      <section className={`${styles.bloc} ${styles.session}`}>
        <h2>Session</h2>
        <p className={styles.explication}>
          Vous fermez la session de cet appareil. Les autres restent ouvertes.
        </p>
        <Deconnexion />
      </section>
    </main>
  );
}
