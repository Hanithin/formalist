import type { Metadata } from "next";
import Link from "next/link";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { tableauDeBord } from "@/infrastructure/db/depots/tableau-de-bord";
import { etatTableauDeBord, salutation } from "@/domain/formalite/actions";
import { libelleDossier, tonDossier, avancement, accorder } from "@/domain/formalite/etapes";
import { Etat } from "@/components/liste/Etat";
import { Vide } from "@/components/liste/Vide";
import { Avancement, Anneau } from "./Avancement";
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

  // Un seul dossier : on le met en avant plutôt que de le noyer dans une liste
  // d'une ligne. C'est l'état le plus fréquent au démarrage.
  const seul = societes.length === 1 ? societes[0] : null;

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

      {seul && (
        <section
          className={
            etat === "tous_termines"
              ? `${styles.singleHero} ${styles.singleCelebrate}`
              : styles.singleHero
          }
        >
          <Avancement pourcentage={avancement(seul.phase, seul.offre)} />

          <div className={styles.singleHeroBody}>
            <div className={styles.singleHeroTitle}>{seul.societe}</div>
            <div className={styles.singleHeroDesc}>
              {etat === "tous_termines"
                ? "Votre société est officielle. Le K-bis et le registre des bénéficiaires sont dans vos documents."
                : libelleDossier({ status: seul.status, phase: seul.phase, offer: seul.offre })}
            </div>

            <div className={styles.singleHeroActions}>
              <Link
                href={
                  etat === "tous_termines" ? "/documents" : "/creation?dossier=" + seul.id
                }
                className={styles.singleHeroBtn}
              >
                {etat === "tous_termines" ? "Voir mes documents" : "Reprendre mon dossier"}
              </Link>
              <Link href={"/formalites/" + seul.id} className={styles.singleHeroLink}>
                Détail du dossier
              </Link>
            </div>
          </div>
        </section>
      )}

      {etat === "tous_termines" && !seul && (
        <section className={`${styles.singleHero} ${styles.singleCelebrate}`}>
          <div className={styles.singleHeroBody}>
            <div className={styles.singleHeroTitle}>Tous vos dossiers sont finalisés</div>
            <div className={styles.singleHeroDesc}>
              {accorder(dossiers.length, "formalité terminée", "formalités terminées")}.
            </div>
            <div className={styles.singleHeroActions}>
              <Link href="/creation?type=creation" className={styles.singleHeroBtn}>
                Nouvelle société
              </Link>
            </div>
          </div>
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

      {societes.length > 1 && (
        <section className={styles.section}>
          <h2>Vos sociétés</h2>

          <ul className={styles.socGrid}>
            {societes.map((s) => (
              <li
                key={s.id}
                className={
                  s.status === "terminee" ? `${styles.socTile} ${styles.done}` : styles.socTile
                }
              >
                <div className={styles.socTileHead}>
                  <Anneau pourcentage={avancement(s.phase, s.offre)} termine={s.status === "terminee"} />

                  <div className={styles.socTileIdent}>
                    <Link href={"/formalites/" + s.id} className={styles.socTileName}>
                      {s.societe}
                    </Link>
                    <div className={styles.socTileStep}>
                      {s.forme} ·{" "}
                      {libelleDossier({ status: s.status, phase: s.phase, offer: s.offre })}
                    </div>
                  </div>
                </div>

                <div className={styles.socTileFoot}>
                  <Etat
                    libelle={libelleDossier({ status: s.status, phase: s.phase, offer: s.offre })}
                    ton={tonDossier({ status: s.status, phase: s.phase })}
                  />
                  {s.actions.length > 0 && (
                    <Link href={s.actions[0].lien} className={styles.socTileBtn}>
                      {s.actions[0].bouton}
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
