"use client";

import { ChampChoix } from "@/components/formulaire/ChampChoix";
import { ChampNombre } from "@/components/formulaire/ChampNombre";
import {
  conventionVide,
  regimeDesConventions,
  CONVENTIONS_INTERDITES,
  CONVENTIONS_LIBRES,
  NATURES_DE_CONVENTION,
  type Convention,
} from "@/domain/comptes/conventions";
import styles from "../modification/Modification.module.css";

/**
 * Les conventions réglementées, saisies et expliquées.
 *
 * C'est l'étape que les dirigeants passent le plus vite, et celle qui coûte le plus
 * cher à négliger : une convention non déclarée reste annulable, et son bénéficiaire
 * peut avoir à rendre ce qu'il a reçu.
 *
 * L'écran dit donc trois choses avant de faire saisir : ce que la loi impose à cette
 * société-ci, ce qui échappe au contrôle, et ce qui est purement interdit. Le régime
 * n'est pas le même selon la forme et le nombre d'associés, et c'est le domaine qui le
 * détermine - un texte figé se tromperait pour les trois quarts des dossiers.
 */
export function Conventions({
  forme,
  avecCommissaire,
  conventions,
  anomalies,
  surConventions,
}: {
  forme: string | null | undefined;
  avecCommissaire: boolean;
  conventions: Convention[];
  anomalies: { champ: string; message: string }[];
  surConventions: (conventions: Convention[]) => void;
}) {
  const regime = regimeDesConventions({ forme, avecCommissaire });
  const refus = (champ: string) => anomalies.find((a) => a.champ === champ)?.message;

  const modifier = (rang: number, changement: Partial<Convention>) =>
    surConventions(conventions.map((c, i) => (i === rang ? { ...c, ...changement } : c)));

  if (regime.regime === "sans-objet") {
    return (
      <>
        <p className={styles.description}>{regime.explication}</p>
        <p className={styles.blocNote}>
          Il n&apos;y a rien à déclarer ici, et le procès-verbal ne portera aucune
          résolution sur ce point.
        </p>
      </>
    );
  }

  return (
    <>
      <p className={styles.description}>
        Une convention passée entre la société et l&apos;un de ses dirigeants ou associés
        importants n&apos;est ni libre ni interdite : elle se déclare, et l&apos;assemblée
        en prend acte au moment d&apos;approuver les comptes.
      </p>

      <section className={styles.bloc}>
        <h3 className={styles.blocTitre}>Ce que la loi impose à votre société</h3>
        <p className={styles.blocTexte}>{regime.explication}</p>
        <p className={styles.blocNote}>{CONVENTIONS_LIBRES}</p>
        <p className={styles.blocNote}>{CONVENTIONS_INTERDITES}</p>
      </section>

      {conventions.length === 0 && (
        <p className={styles.blocNote}>
          Aucune convention déclarée. Le procès-verbal prendra acte qu&apos;il n&apos;y en
          a eu aucune au cours de l&apos;exercice - ce qui engage le dirigeant.
        </p>
      )}

      {conventions.map((convention, rang) => (
        <section key={rang} className={styles.cession}>
          <div className={styles.cessionTete}>
            <h4 className={styles.cessionTitre}>Convention {rang + 1}</h4>
            <button
              type="button"
              className={styles.cessionRetrait}
              onClick={() => surConventions(conventions.filter((_, i) => i !== rang))}
            >
              Retirer
            </button>
          </div>

          <div className={styles.champs}>
            <div className={styles.champ}>
              <label htmlFor={"conv-nature-" + rang}>Nature</label>
              {/*
                Le menu d'un `<select>` est dessiné par le système, et rien ne l'habille :
                gris ardoise et surlignage bleu sur macOS au milieu d'un formulaire clair.
                Celui-ci suit la feuille de l'application, comme le calendrier.
              */}
              <ChampChoix
                id={"conv-nature-" + rang}
                valeur={convention.nature}
                options={NATURES_DE_CONVENTION}
                surChangement={(nature) => modifier(rang, { nature })}
              />
              {refus("convention-" + rang + "-nature") && (
                <p role="alert">{refus("convention-" + rang + "-nature")}</p>
              )}
            </div>

            <div className={styles.champ}>
              <label htmlFor={"conv-montant-" + rang}>Montant, en euros</label>
              <ChampNombre
                id={"conv-montant-" + rang}
                decimales
                valeur={
                  convention.montantCentimes === 0 ? "" : convention.montantCentimes / 100
                }
                surChangement={(n) =>
                  modifier(rang, { montantCentimes: n === "" ? 0 : Math.round(n * 100) })
                }
              />
            </div>

            <div className={`${styles.champ} ${styles.pleineLargeur}`}>
              <label htmlFor={"conv-partie-" + rang}>Personne intéressée et sa qualité</label>
              <input
                id={"conv-partie-" + rang}
                placeholder="Monsieur Jean DUPONT, président"
                value={convention.partie}
                onChange={(e) => modifier(rang, { partie: e.target.value })}
              />
              {refus("convention-" + rang + "-partie") && (
                <p role="alert">{refus("convention-" + rang + "-partie")}</p>
              )}
            </div>

            <div className={`${styles.champ} ${styles.pleineLargeur}`}>
              <label htmlFor={"conv-objet-" + rang}>Objet</label>
              <input
                id={"conv-objet-" + rang}
                placeholder="avance de trésorerie consentie à la société"
                value={convention.objet}
                onChange={(e) => modifier(rang, { objet: e.target.value })}
              />
              {refus("convention-" + rang + "-objet") && (
                <p role="alert">{refus("convention-" + rang + "-objet")}</p>
              )}
            </div>

            <div className={`${styles.champ} ${styles.pleineLargeur}`}>
              <label htmlFor={"conv-modalites-" + rang}>Modalités</label>
              <input
                id={"conv-modalites-" + rang}
                placeholder="remboursable à douze mois, sans intérêt"
                value={convention.modalites}
                onChange={(e) => modifier(rang, { modalites: e.target.value })}
              />
            </div>

            <div className={`${styles.champ} ${styles.pleineLargeur}`}>
              {/*
                `.case`, non `.nature`.
                `.nature` habille les pastilles à choisir, et masque leur `input` - ici
                la case disparaissait, et l'on cochait sans rien voir une mention qui
                change le texte de l'acte.
              */}
              <label className={styles.case}>
                <input
                  type="checkbox"
                  checked={convention.poursuivie}
                  onChange={(e) => modifier(rang, { poursuivie: e.target.checked })}
                />
                {/* Une convention d'un exercice antérieur se déclare aussi tant qu'elle
                    produit ses effets : l'acte doit dire laquelle est nouvelle. */}
                Convention conclue lors d&apos;un exercice antérieur et poursuivie
              </label>
            </div>
          </div>
        </section>
      ))}

      <button
        type="button"
        className={styles.ajouterLigne}
        onClick={() => surConventions([...conventions, conventionVide()])}
      >
        + Déclarer une convention
      </button>
    </>
  );
}
