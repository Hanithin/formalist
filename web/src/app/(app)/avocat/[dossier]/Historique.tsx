import styles from "../Avocat.module.css";

export interface EntreeDuJournal {
  id: number;
  auteur: string;
  libelle: string;
  champ: string | null;
  avant: string | null;
  apres: string | null;
  commentaire: string | null;
  quand: string;
  teinte: string;
}

/**
 * Le journal du dossier.
 *
 * Il occupait le bas du récapitulatif, déroulé quel que soit son âge : quarante lignes
 * d'interventions sous une fiche qu'on ouvre pour relire une adresse. Puis une fenêtre,
 * ouverte depuis les gestes rapides - où on ne la cherchait pas. Il a son onglet, et se
 * lit comme le reste du dossier.
 */
export function Historique({ entrees }: { entrees: EntreeDuJournal[] }) {
  return (
    <section className={styles.journal} aria-label="Historique du dossier">
      <div className={styles.journalTete}>
        <h3 className={styles.journalTitre}>Historique du dossier</h3>
        <p className={styles.journalDetail}>
          Chaque intervention du cabinet et du client, de la plus récente à la plus
          ancienne. C&apos;est cette trace qui permet d&apos;instruire un litige.
        </p>
      </div>

      {entrees.length === 0 ? (
        <p className={styles.journalVide}>Aucune intervention enregistrée.</p>
      ) : (
        <ol className={styles.journalListe}>
          {entrees.map((entree) => (
            <li key={entree.id} className={styles.journalEntree}>
              <span
                className={`${styles.journalPoint} ${styles[entree.teinte]}`}
                aria-hidden="true"
              />

              <div className={styles.journalCorps}>
                <p className={styles.journalLigne}>
                  <span className={styles.journalQuoi}>{entree.libelle}</span>
                  {entree.champ && (
                    <span className={styles.journalChamp}>{entree.champ}</span>
                  )}
                </p>

                {(entree.avant || entree.apres) && (
                  <p className={styles.journalValeurs}>
                    {entree.avant && <span className={styles.auditBefore}>{entree.avant}</span>}
                    {entree.avant && entree.apres && <span>&nbsp;→&nbsp;</span>}
                    {entree.apres && <span className={styles.auditAfter}>{entree.apres}</span>}
                  </p>
                )}

                {entree.commentaire && (
                  <p className={styles.journalCommentaire}>{entree.commentaire}</p>
                )}

                <p className={styles.journalQui}>
                  {entree.auteur} · {entree.quand}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
