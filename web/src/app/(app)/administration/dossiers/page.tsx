import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { vuesAdministration, avocats } from "@/infrastructure/db/depots/administration";
import { libelleEtat } from "@/domain/formalite/transitions";
import { Assignation } from "./Assignation";
import styles from "../Administration.module.css";

export const metadata: Metadata = {
  title: "Suivi de la plateforme - Formalist",
  robots: { index: false, follow: false },
};

function quand(date: Date | null): string {
  if (!date) return "";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

export default async function SuiviPlateforme() {
  const utilisateur = await exigerUtilisateur();
  if (!utilisateur.roles.includes("admin")) notFound();

  const [vues, listeAvocats] = await Promise.all([
    vuesAdministration(utilisateur),
    avocats(utilisateur),
  ]);

  return (
    <main className={styles.page}>
      <p className={styles.eyebrow}>
        <Link href="/administration">Administration</Link> · Suivi
      </p>
      <h1>Suivi de la plateforme</h1>

      <dl className={styles.chiffres}>
        <div>
          <dt>Dossiers récents</dt>
          <dd>{vues.dossiers.length}</dd>
        </div>
        <div>
          <dt>Paiements</dt>
          <dd>{vues.paiements.length}</dd>
        </div>
        <div>
          <dt>Messages de contact</dt>
          <dd>{vues.contacts.length}</dd>
        </div>
        <div>
          <dt>Appels de rédaction</dt>
          <dd>{vues.usageIA.appels}</dd>
        </div>
      </dl>

      <section className={styles.bloc}>
        <h2>Dossiers</h2>
        <p className={styles.precision}>
          Les cinquante derniers, du plus récemment modifié au plus ancien.
        </p>

        <ul className={styles.liste}>
          {vues.dossiers.map((d) => (
            <li key={d.id} className={styles.ligne}>
              <span className={styles.ligneTitre}>{d.societe}</span>
              <span className={styles.ligneDetail}>
                {d.client} · {d.forme} · {libelleEtat(d.status)}
              </span>
              <span className={styles.assignation}>
                <Assignation dossierId={d.id} avocatActuel={d.avocatId} avocats={listeAvocats} />
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.bloc}>
        <h2>Activité récente</h2>
        {vues.activite.length === 0 ? (
          <p className={styles.precision}>Aucune action enregistrée.</p>
        ) : (
          <ul className={styles.liste}>
            {vues.activite.map((a) => (
              <li key={a.id} className={styles.ligne}>
                <span className={styles.ligneTitre}>{a.action}</span>
                <span className={styles.ligneDetail}>
                  {a.auteur}
                  {a.dossierId ? " · dossier " + a.dossierId : " · plateforme"}
                </span>
                <span className={styles.quand}>{quand(a.quand)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.bloc}>
        <h2>Messages de contact</h2>
        {vues.contacts.length === 0 ? (
          <p className={styles.precision}>Aucun message.</p>
        ) : (
          <ul className={styles.liste}>
            {vues.contacts.map((c) => (
              <li key={c.id} className={styles.ligne}>
                <span className={styles.ligneTitre}>{c.nom}</span>
                <span className={styles.ligneDetail}>
                  {c.email} · {c.sujet}
                </span>
                <span className={styles.quand}>{quand(c.recuLe)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.bloc}>
        <h2>Paiements</h2>
        {vues.paiements.length === 0 ? (
          <p className={styles.precision}>Aucun paiement enregistré.</p>
        ) : (
          <ul className={styles.liste}>
            {vues.paiements.map((p) => (
              <li key={p.id} className={styles.ligne}>
                <span className={styles.ligneTitre}>
                  {p.montant.toLocaleString("fr-FR")} euros
                </span>
                <span className={styles.ligneDetail}>{p.statut}</span>
                <span className={styles.quand}>{quand(p.payeLe)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
