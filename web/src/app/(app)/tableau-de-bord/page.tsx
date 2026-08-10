import type { Metadata } from "next";
import Link from "next/link";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { tableauDeBord } from "@/infrastructure/db/depots/tableau-de-bord";
import { etatTableauDeBord, salutation } from "@/domain/formalite/actions";
import { libelleDossier, avancement, accorder, nombreDEtapes } from "@/domain/formalite/etapes";
import { dateRelative, phraseJournal, seSuffitAElleMeme } from "@/domain/formalite/journal";
import { Vide } from "@/components/liste/Vide";
import { Avancement, Anneau } from "./Avancement";
import { ActionPrioritaire, type Priorite } from "./ActionPrioritaire";
import styles from "./TableauDeBord.module.css";

export const metadata: Metadata = {
  title: "Tableau de bord - Formalist",
  robots: { index: false, follow: false },
};

/** Le chevron du bouton « Voir toutes ». */
function Chevron() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

export default async function TableauDeBord() {
  const utilisateur = await exigerUtilisateur();
  const { dossiers, societes, activite } = await tableauDeBord(utilisateur);
  const etat = etatTableauDeBord(dossiers);

  const prenom = utilisateur.nom.split(" ")[0];
  const nbActions = societes.reduce((total, s) => total + s.actions.length, 0);

  // Un seul dossier : on le met en avant plutôt que de le noyer dans une liste
  // d'une ligne. C'est l'état le plus fréquent au démarrage.
  const seul = societes.length === 1 ? societes[0] : null;

  // Le bandeau du haut : les messages non lus passent devant tout, puis les
  // dossiers en attente, puis ceux qui attendent une action du client.
  const priorites: Priorite[] = [];
  const nonLus = societes.reduce((total, s) => total + s.nonLus, 0);
  if (nonLus > 0) {
    const avecMessages = societes.find((s) => s.nonLus > 0)!;
    priorites.push({
      icone: "message",
      titre: accorder(nonLus, "nouveau message", "nouveaux messages"),
      precision: "Sur " + avecMessages.societe,
      lien: "/messagerie?dossier=" + avecMessages.id,
      bouton: "Consulter",
    });
  } else {
    for (const s of societes.filter((s) => s.actions.length > 0)) {
      priorites.push({
        icone: s.status === "en_attente" ? "attente" : "document",
        titre: "Reprendre " + s.societe,
        precision: s.actions[0].titre,
        lien: s.actions[0].lien,
        bouton: "Continuer",
      });
    }
  }

  // Les trois dossiers les plus récents ; le reste se consulte dans la liste.
  const recentes = societes.slice(0, 3);

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.topbarLeft}>
          <h1>
            {salutation()} {prenom}
          </h1>
        </div>
        <div className={styles.topbarActions}>
          <span className={styles.topbarDate}>
            {new Intl.DateTimeFormat("fr-FR", { dateStyle: "full" }).format(new Date())}
          </span>
        </div>
      </header>

      <div className={styles.content}>
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
                  href={etat === "tous_termines" ? "/documents" : "/creation?dossier=" + seul.id}
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

        {societes.length > 1 && (
          <>
            <ActionPrioritaire priorites={priorites} />

            <div className={styles.dbSectionHead}>
              <h2>Vos sociétés</h2>
              {societes.length > 3 && (
                <Link href="/formalites" className={styles.socSeeAll}>
                  Voir toutes
                  <span className={styles.socSeeAllCount}>{societes.length}</span>
                  <Chevron />
                </Link>
              )}
            </div>

            <div className={styles.socGrid}>
              {recentes.map((s) => {
                const termine = s.status === "terminee";
                const ton = termine ? styles.done : s.actions.length > 0 ? styles.action : "";
                const libelle = libelleDossier({
                  status: s.status,
                  phase: s.phase,
                  offer: s.offre,
                });

                return (
                  <div key={s.id} className={`${styles.socTile} ${ton}`}>
                    <div className={styles.socTileHead}>
                      <Anneau pourcentage={avancement(s.phase, s.offre)} termine={termine} />

                      <div className={styles.socTileIdent}>
                        <div className={styles.socTileName}>{s.societe}</div>
                        <div className={styles.socTileStep}>
                          {termine
                            ? "Immatriculée"
                            : "Étape " +
                              s.phase +
                              " sur " +
                              nombreDEtapes(s.offre) +
                              " · " +
                              libelle}
                        </div>
                      </div>

                      <span className={`${styles.socTileStatus} ${ton}`}>{libelle}</span>
                    </div>

                    <div className={styles.socTileNext}>
                      {s.actions.length > 0
                        ? s.actions[0].titre
                        : "Rien à faire : nous avançons sur votre dossier."}
                    </div>

                    <div className={styles.socTileFoot}>
                      {s.nonLus > 0 && (
                        <span className={styles.socTileUnread}>
                          {accorder(s.nonLus, "message", "messages")}
                        </span>
                      )}
                      <Link href={"/formalites/" + s.id} className={styles.socTileBtn}>
                        {termine ? "Consulter" : "Continuer"}
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {societes.length > 1 && (
          <section className={styles.dashCard}>
            <div className={styles.dashCardHead}>
              <div>
                {/* Un titre de section reste un titre : la page d'origine le
                    posait en div, ce qui le rendait invisible à la navigation
                    par titres. */}
                <h2 className={styles.dashCardTitle}>Ce qu&apos;on attend de vous</h2>
                <div className={styles.dashCardSub}>
                  {nbActions === 0
                    ? "Aucune action en attente"
                    : accorder(nbActions, "action", "actions") +
                      " sur " +
                      accorder(societes.length, "dossier", "dossiers")}
                </div>
              </div>
            </div>

            {nbActions === 0 ? (
              <div className={styles.dashEmpty}>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                <div>
                  <strong>Rien à faire pour l&apos;instant.</strong> Nous traitons vos dossiers,
                  vous serez prévenu dès qu&apos;une action vous attend.
                </div>
              </div>
            ) : (
              <div className={styles.todoList}>
                {societes.flatMap((s) =>
                  s.actions.map((a, i) => (
                    <Link
                      key={s.id + "-" + i}
                      href={a.lien}
                      className={a.urgent ? `${styles.todo} ${styles.urgent}` : styles.todo}
                    >
                      <span className={styles.todoDot} />
                      <span className={styles.todoBody}>
                        <span className={styles.todoTitle}>{a.titre}</span>
                        <span className={styles.todoDesc}>
                          <strong>{s.societe}</strong> · {a.precision}
                        </span>
                      </span>
                      <span className={styles.todoCta}>{a.bouton}</span>
                    </Link>
                  ))
                )}
              </div>
            )}
          </section>
        )}

        {societes.length > 1 && (
          <>
            <div className={styles.dbSectionHead}>
              <h2>Activité récente</h2>
            </div>

            <section className={styles.dashCard}>
              {activite.length === 0 ? (
                <div className={`${styles.dashEmpty} ${styles.small}`}>
                  Rien ne s&apos;est encore passé sur vos dossiers.
                </div>
              ) : (
                <div className={styles.actCols}>
                  {activite.slice(0, 6).map((e, i) => {
                    const cestMoi = e.auteurRole === "user";
                    const qui = cestMoi ? "Vous" : (e.auteur ?? "Formalist");

                    return (
                      <Link
                        key={i}
                        href={"/formalites/" + e.dossierId}
                        className={`${styles.actRow} ${styles.actRowLink}`}
                      >
                        <span className={styles.actDot} />
                        <span className={styles.actBody}>
                          <span className={styles.actText}>
                            {seSuffitAElleMeme(e) ? (
                              <strong>{e.valeur}</strong>
                            ) : (
                              <>
                                <strong>{qui}</strong> {phraseJournal(e, cestMoi)}
                              </>
                            )}
                          </span>
                          {e.commentaire && (
                            <span className={styles.actNote}>{e.commentaire}</span>
                          )}
                          <span className={styles.actTime}>
                            {e.societe} · {dateRelative(e.quand)}
                          </span>
                        </span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
