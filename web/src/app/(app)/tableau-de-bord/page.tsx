import type { Metadata } from "next";
import Link from "next/link";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { tableauDeBord } from "@/infrastructure/db/depots/tableau-de-bord";
import { etatTableauDeBord, salutation } from "@/domain/formalite/actions";
import { libelleDossier, tonDossier, avancement, accorder } from "@/domain/formalite/etapes";
import { Etat } from "@/components/liste/Etat";
import { Vide } from "@/components/liste/Vide";
import styles from "./TableauDeBord.module.css";

export const metadata: Metadata = {
  title: "Tableau de bord - Formalist",
  robots: { index: false, follow: false },
};

export default async function TableauDeBord() {
  const utilisateur = await exigerUtilisateur();
  const { dossiers, societes } = await tableauDeBord(utilisateur);
  const etat = etatTableauDeBord(dossiers);

  const prenom = utilisateur.nom.split(" ")[0];
  const actions = societes.flatMap((s) => s.actions.map((a) => ({ ...a, societe: s.societe })));

  return (
    <main className={styles.page}>
      <header className={styles.entete}>
        <h1>
          {salutation()} {prenom}
        </h1>
        <p className={styles.date}>
          {new Intl.DateTimeFormat("fr-FR", { dateStyle: "full" }).format(new Date())}
        </p>
      </header>

      {etat === "aucun" && (
        <Vide
          titre="Bienvenue sur Formalist"
          texte="Créez votre société en quelques minutes, accompagné par un avocat."
          action={{ libelle: "Créer une société", lien: "/creation?type=creation" }}
        />
      )}

      {etat === "tous_termines" && (
        <section className={styles.bandeau}>
          <h2>
            {dossiers.length === 1
              ? "Votre société est immatriculée"
              : "Tous vos dossiers sont finalisés"}
          </h2>
          <p>{accorder(dossiers.length, "formalité terminée", "formalités terminées")}.</p>
          <Link href="/creation?type=creation">Nouvelle société</Link>
        </section>
      )}

      {actions.length > 0 && (
        <section className={styles.section}>
          <h2>Ce qu&apos;on attend de vous</h2>
          <p className={styles.precision}>
            {accorder(actions.length, "action", "actions")} sur{" "}
            {accorder(societes.length, "dossier", "dossiers")}
          </p>

          <ul className={styles.actions}>
            {actions.map((action, i) => (
              <li key={i} className={action.urgent ? styles.actionUrgente : styles.action}>
                <span className={styles.actionTitre}>{action.titre}</span>
                <span className={styles.actionPrecision}>
                  {action.societe} · {action.precision}
                </span>
                <Link href={action.lien} className={styles.actionBouton}>
                  {action.bouton}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {societes.length > 0 && (
        <section className={styles.section}>
          <h2>{societes.length === 1 ? "Votre société" : "Vos sociétés"}</h2>

          <ul className={styles.societes}>
            {societes.map((s) => (
              <li key={s.id} className={styles.societe}>
                <span className={styles.avancement}>{avancement(s.phase, s.offre)}%</span>
                <Link href={"/formalites/" + s.id} className={styles.nom}>
                  {s.societe}
                </Link>
                <span className={styles.forme}>{s.forme}</span>
                <Etat
                  libelle={libelleDossier({ status: s.status, phase: s.phase, offer: s.offre })}
                  ton={tonDossier({ status: s.status, phase: s.phase })}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
