import styles from "./Authentification.module.css";

/**
 * Ce que Formalist fait pendant qu'on attend.
 *
 * Repris de la page d'origine : un dossier qui avance, des signatures qui
 * rentrent, des documents qui se produisent. C'est plus parlant qu'une liste
 * d'arguments - on voit le produit au travail.
 *
 * Décoratif : masqué aux lecteurs d'écran, qui n'ont rien à y gagner.
 */
export function PanneauDroit() {
  return (
    <div className={styles.authRight} aria-hidden="true">
      <div className={styles.authRightContent}>
        <h2 className={styles.authRightTitle}>Créez et modifiez votre société, avec un avocat</h2>
        <p className={styles.authRightSub}>
          Statuts, transfert de siège, changement de gérant : un avocat rédige et valide chaque
          acte. Signature et dépôt au greffe compris.
        </p>

        <div className={styles.authCards}>
          <div className={`${styles.authCard} ${styles.authCard1}`}>
            <div className={styles.authCardHead}>
              <span className={styles.authCardLabel}>Dossier en cours</span>
              <span className={styles.authCardRef}>SASU · K4TP2M</span>
            </div>

            <div className={styles.authStep}>
              <span className={styles.authStepMark}>
                <svg viewBox="0 0 12 12">
                  <polyline points="2,6 5,9 10,3" />
                </svg>
              </span>
              Statuts rédigés
            </div>
            <div className={styles.authStep}>
              <span className={styles.authStepMark}>
                <svg viewBox="0 0 12 12">
                  <polyline points="2,6 5,9 10,3" />
                </svg>
              </span>
              Annonce légale publiée
            </div>
            <div className={`${styles.authStep} ${styles.authStepCurrent}`}>
              <span className={styles.authStepMark} />
              Dépôt au greffe
            </div>
            <div className={`${styles.authStep} ${styles.authStepTodo}`}>
              <span className={styles.authStepMark} />
              Kbis
            </div>

            <div className={styles.authProgress}>
              <span />
            </div>
          </div>

          <div className={`${styles.authCard} ${styles.authCard2}`}>
            <div className={styles.authCardHead}>
              <span className={styles.authCardLabel}>Signature électronique</span>
            </div>
            <div className={styles.authSigners}>
              <div className={styles.authAvatars}>
                <span className={styles.authAv} style={{ background: "#dcfce7", color: "#16a34a" }}>
                  C
                </span>
                <span className={styles.authAv} style={{ background: "#ede9fe", color: "#7c3aed" }}>
                  M
                </span>
                <span className={`${styles.authAv} ${styles.authAvPending}`}>L</span>
              </div>
              <span className={styles.authSignersText}>
                2 associés sur 3 ont signé
                <small>Relance envoyée à Lucie</small>
              </span>
            </div>
          </div>

          <div className={`${styles.authCard} ${styles.authCard3}`}>
            <div className={styles.authCardHead}>
              <span className={styles.authCardLabel}>Documents générés</span>
            </div>
            {[
              { nom: "Statuts constitutifs.docx", pages: "18 p." },
              { nom: "Liste des souscripteurs.pdf", pages: "2 p." },
            ].map((d) => (
              <div key={d.nom} className={styles.authDoc}>
                <span className={styles.authDocIcon}>
                  <svg viewBox="0 0 24 24">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                </span>
                <span className={styles.authDocName}>{d.nom}</span>
                <span className={styles.authDocMeta}>{d.pages}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
